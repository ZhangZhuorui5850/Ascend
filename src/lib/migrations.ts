import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { addMinutesToInstant, localDateTimeToUtc } from "./planner/time";
import { ensurePlannerDefaults, plannerDefaultId } from "./repo/planner-defaults";
import { LEGACY_WORKSPACE_ID } from "./repo/workspaces";

type Migration = {
  version: string;
  sql?: string;
  run?: (database: Database.Database) => void;
};

type MigrationOptions = {
  uploadRoot?: string;
  throughVersion?: string;
};

const migrations: Migration[] = [
  {
    version: "0001_foundation",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_pulled_seq INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS entity_changes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        op_id TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        op TEXT NOT NULL,
        base_version INTEGER,
        patch_json TEXT NOT NULL DEFAULT '{}',
        snapshot_json TEXT NOT NULL DEFAULT '{}',
        device_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        field TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        base_version INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        device_id TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(scope_type, scope_id, field)
      );

      CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        base_version INTEGER NOT NULL,
        local_json TEXT NOT NULL,
        incoming_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        resolved_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_entity_changes_seq ON entity_changes(seq);
      CREATE INDEX IF NOT EXISTS idx_entity_changes_entity ON entity_changes(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_drafts_scope ON drafts(scope_type, scope_id, field);
    `,
  },
  {
    version: "0002_auth_sessions",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        user_agent TEXT NOT NULL DEFAULT '',
        ip_hint TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    `,
  },
  {
    version: "0003_asset_blobs",
    sql: `
      CREATE TABLE IF NOT EXISTS blobs (
        id TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL UNIQUE,
        size INTEGER NOT NULL,
        mime_type TEXT NOT NULL DEFAULT '',
        storage_key TEXT NOT NULL UNIQUE,
        ref_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY,
        blob_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        received_bytes INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (blob_id) REFERENCES blobs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_blobs_sha256 ON blobs(sha256);
      CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status, expires_at);
    `,
  },
  {
    version: "0004_knowledge_unification",
    run: (database) => {
      if (!tableExists(database, "knowledge_points")) return;
      addColumnIfMissing(database, "knowledge_points", "chapter_id", "TEXT");
      addColumnIfMissing(database, "knowledge_points", "sort_order", "INTEGER NOT NULL DEFAULT 0");
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_knowledge_points_chapter ON knowledge_points(chapter_id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_points_subject ON knowledge_points(subject_code);
      `);
      if (tableExists(database, "asset_links")) {
        database.exec("CREATE INDEX IF NOT EXISTS idx_asset_links_point ON asset_links(knowledge_point_id)");
      }
      if (tableExists(database, "assets")) {
        database.exec("CREATE INDEX IF NOT EXISTS idx_assets_folder ON assets(folder_path)");
      }
      if (tableExists(database, "mistakes")) {
        database.exec("CREATE INDEX IF NOT EXISTS idx_mistakes_point ON mistakes(knowledge_point_id)");
      }
    },
  },
  {
    version: "0005_day_planning",
    run: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS day_tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          day TEXT NOT NULL,
          title TEXT NOT NULL,
          subject_code TEXT,
          done INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          done_at TEXT
        );

        CREATE TABLE IF NOT EXISTS day_notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          day TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_day_tasks_day ON day_tasks(day);
        CREATE INDEX IF NOT EXISTS idx_day_notes_day ON day_notes(day);
      `);
      if (tableExists(database, "subjects")) {
        addColumnIfMissing(database, "subjects", "track", "TEXT NOT NULL DEFAULT 'written'");
      }

      // 老数据迁移：把已有的「今日计划」文本按行拆成任务，「过程记录」转成一条随笔。
      if (!tableExists(database, "daily_entries")) return;
      const entries = database.prepare(`
        SELECT date, plan, diary FROM daily_entries
        WHERE TRIM(plan) != '' OR TRIM(diary) != ''
      `).all() as Array<{ date: string; plan: string; diary: string }>;
      const insertTask = database.prepare(
        "INSERT INTO day_tasks (day, title, sort_order) VALUES (?, ?, ?)",
      );
      const insertNote = database.prepare("INSERT INTO day_notes (day, content) VALUES (?, ?)");
      for (const entry of entries) {
        const lines = entry.plan
          .split(/\r?\n/)
          .map((line) => line.replace(/^\s*[-*\d.、]+\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 20);
        lines.forEach((line, index) => insertTask.run(entry.date, line, index + 1));
        if (entry.diary.trim()) insertNote.run(entry.date, entry.diary.trim());
      }
    },
  },
  {
    version: "0006_identity_workspaces",
    run: (database) => {
      addColumnIfMissing(database, "users", "role", "TEXT NOT NULL DEFAULT 'user'");
      addColumnIfMissing(database, "users", "status", "TEXT NOT NULL DEFAULT 'active'");
      addColumnIfMissing(database, "users", "must_change_password", "INTEGER NOT NULL DEFAULT 0");
      addColumnIfMissing(database, "users", "last_login_at", "TEXT");
      addColumnIfMissing(database, "users", "password_changed_at", "TEXT");

      database.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          owner_user_id TEXT UNIQUE,
          display_name TEXT NOT NULL DEFAULT '',
          storage_quota_bytes INTEGER NOT NULL DEFAULT 2147483648,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS invitations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor_user_id TEXT NOT NULL,
          target_user_id TEXT,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT,
          summary_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS login_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email_hint TEXT NOT NULL,
          ip_hint TEXT NOT NULL,
          succeeded INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_user_id);
        CREATE INDEX IF NOT EXISTS idx_invitations_user ON invitations(user_id);
        CREATE INDEX IF NOT EXISTS idx_invitations_expiry ON invitations(expires_at, used_at);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup
          ON login_attempts(email_hint, ip_hint, created_at);
      `);
    },
  },
  {
    version: "0007_workspace_scope",
    run: (database) => {
      database.prepare(`
        INSERT OR IGNORE INTO workspaces (id, display_name)
        VALUES (?, '原有学习空间')
      `).run(LEGACY_WORKSPACE_ID);

      rebuildWorkspaceKeyedTables(database);

      const scopedTables = [
        "devices",
        "entity_changes",
        "conflicts",
        "blobs",
        "upload_sessions",
        "knowledge_points",
        "knowledge_tags",
        "assets",
        "asset_tags",
        "asset_knowledge_tags",
        "asset_links",
        "study_sessions",
        "review_events",
        "mistakes",
        "day_tasks",
        "day_notes",
      ];
      for (const table of scopedTables) {
        if (tableExists(database, table)) {
          addColumnIfMissing(
            database,
            table,
            "workspace_id",
            `TEXT NOT NULL DEFAULT '${LEGACY_WORKSPACE_ID}'`,
          );
        }
      }

      const scopedIndexes: Array<[string, string[], string]> = [
        ["subjects", ["workspace_id", "code"], "CREATE INDEX IF NOT EXISTS idx_subjects_workspace ON subjects(workspace_id, code)"],
        [
          "subject_chapters",
          ["workspace_id", "subject_code", "sort_order"],
          "CREATE INDEX IF NOT EXISTS idx_chapters_workspace ON subject_chapters(workspace_id, subject_code, sort_order)",
        ],
        [
          "knowledge_points",
          ["workspace_id", "subject_code", "chapter_id"],
          "CREATE INDEX IF NOT EXISTS idx_points_workspace ON knowledge_points(workspace_id, subject_code, chapter_id)",
        ],
        [
          "daily_entries",
          ["workspace_id", "date"],
          "CREATE INDEX IF NOT EXISTS idx_daily_entries_workspace ON daily_entries(workspace_id, date)",
        ],
        ["assets", ["workspace_id", "folder_path", "day"], "CREATE INDEX IF NOT EXISTS idx_assets_workspace ON assets(workspace_id, folder_path, day)"],
        ["folders", ["workspace_id", "parent_path", "path"], "CREATE INDEX IF NOT EXISTS idx_folders_workspace ON folders(workspace_id, parent_path, path)"],
        ["day_tasks", ["workspace_id", "day", "sort_order"], "CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON day_tasks(workspace_id, day, sort_order)"],
        ["day_notes", ["workspace_id", "day"], "CREATE INDEX IF NOT EXISTS idx_notes_workspace ON day_notes(workspace_id, day)"],
        [
          "study_sessions",
          ["workspace_id", "day"],
          "CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON study_sessions(workspace_id, day)",
        ],
        ["review_events", ["workspace_id", "day"], "CREATE INDEX IF NOT EXISTS idx_reviews_workspace ON review_events(workspace_id, day)"],
        [
          "mistakes",
          ["workspace_id", "next_review", "graduated"],
          "CREATE INDEX IF NOT EXISTS idx_mistakes_workspace ON mistakes(workspace_id, next_review, graduated)",
        ],
      ];
      for (const [table, columns, sql] of scopedIndexes) {
        if (tableHasColumns(database, table, columns)) database.exec(sql);
      }
    },
  },
  {
    version: "0008_workspace_blob_storage",
    run: (database) => {
      if (!tableExists(database, "blobs")) return;
      database.exec("DROP TABLE IF EXISTS upload_sessions");
      database.exec("ALTER TABLE blobs RENAME TO blobs_before_workspace_storage");
      database.exec(`
        CREATE TABLE blobs (
          workspace_id TEXT NOT NULL,
          id TEXT PRIMARY KEY,
          sha256 TEXT NOT NULL,
          size INTEGER NOT NULL,
          mime_type TEXT NOT NULL DEFAULT '',
          storage_key TEXT NOT NULL UNIQUE,
          ref_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(workspace_id, sha256),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        INSERT INTO blobs (workspace_id, id, sha256, size, mime_type, storage_key, ref_count, created_at)
        SELECT
          '${LEGACY_WORKSPACE_ID}',
          '${LEGACY_WORKSPACE_ID}:' || sha256,
          sha256,
          size,
          mime_type,
          storage_key,
          ref_count,
          created_at
        FROM blobs_before_workspace_storage;

        DROP TABLE blobs_before_workspace_storage;

        CREATE TABLE upload_sessions (
          workspace_id TEXT NOT NULL,
          id TEXT PRIMARY KEY,
          blob_id TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          received_bytes INTEGER NOT NULL DEFAULT 0,
          expires_at TEXT NOT NULL,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
          FOREIGN KEY (blob_id) REFERENCES blobs(id)
        );

        CREATE INDEX idx_blobs_workspace_sha ON blobs(workspace_id, sha256);
        CREATE INDEX idx_upload_sessions_workspace_status
          ON upload_sessions(workspace_id, status, expires_at);
      `);
    },
  },
  {
    version: "0009_user_profile",
    run: (database) => {
      addColumnIfMissing(database, "users", "avatar_kind", "TEXT NOT NULL DEFAULT 'seal'");
      addColumnIfMissing(database, "users", "avatar_char", "TEXT NOT NULL DEFAULT ''");
      addColumnIfMissing(database, "users", "avatar_color", "TEXT NOT NULL DEFAULT 'cinnabar'");
      addColumnIfMissing(database, "users", "avatar_image", "BLOB");
      addColumnIfMissing(database, "users", "avatar_mime", "TEXT NOT NULL DEFAULT ''");
      // 历史引导账号的占位昵称改为邮箱 local-part（品牌已更名登峰，ZGCA 不再作为默认昵称）
      database.exec(`
        UPDATE users SET display_name = substr(email, 1, instr(email, '@') - 1)
        WHERE display_name = 'ZGCA' AND instr(email, '@') > 1
      `);
    },
  },
  {
    version: "0010_point_created_at",
    run: (database) => {
      if (!tableExists(database, "knowledge_points")) return;
      addColumnIfMissing(database, "knowledge_points", "created_at", "TEXT NOT NULL DEFAULT ''");
      // 存量行的历史创建时间不可考，统一回填为迁移时刻
      database.exec("UPDATE knowledge_points SET created_at = datetime('now') WHERE created_at = ''");
    },
  },
  {
    version: "0011_chapter_tree",
    run: (database) => {
      if (!tableExists(database, "subject_chapters")) return;
      // NULL = 顶层章节；存量章节全部保持顶层，零数据变动
      addColumnIfMissing(database, "subject_chapters", "parent_id", "TEXT");
      database.exec("CREATE INDEX IF NOT EXISTS idx_subject_chapters_parent ON subject_chapters(parent_id)");
    },
  },
  {
    version: "0012_point_tree",
    run: (database) => {
      if (!tableExists(database, "knowledge_points")) return;
      // NULL = 章节直属知识点；存量知识点全部保持章节直属，零数据变动。
      // 不变量：整棵点树的 chapter_id 与根一致；sort_order 在（chapter_id, parent_point_id）兄弟组内递增。
      addColumnIfMissing(database, "knowledge_points", "parent_point_id", "TEXT");
      database.exec("CREATE INDEX IF NOT EXISTS idx_knowledge_points_parent ON knowledge_points(parent_point_id)");
    },
  },
  {
    version: "0013_learning_engine",
    run: (database) => {
      if (tableExists(database, "knowledge_points")) {
        addColumnIfMissing(database, "knowledge_points", "prompt", "TEXT NOT NULL DEFAULT ''");
        addColumnIfMissing(database, "knowledge_points", "answer", "TEXT NOT NULL DEFAULT ''");
        addColumnIfMissing(database, "knowledge_points", "interval_step", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfMissing(database, "knowledge_points", "lapse_count", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfMissing(database, "knowledge_points", "last_score", "INTEGER");
        database.exec(`
          CREATE INDEX IF NOT EXISTS idx_points_due_priority
          ON knowledge_points(workspace_id, next_review, tier, mastery)
        `);
      }
      if (tableExists(database, "mistakes")) {
        addColumnIfMissing(database, "mistakes", "pass_count", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfMissing(database, "mistakes", "last_pass_day", "TEXT");
        addColumnIfMissing(database, "mistakes", "cause_category", "TEXT NOT NULL DEFAULT ''");
      }
      if (tableExists(database, "review_events")) {
        addColumnIfMissing(database, "review_events", "operation_id", "TEXT");
        database.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_review_events_operation
          ON review_events(workspace_id, operation_id)
          WHERE operation_id IS NOT NULL
        `);
      }
    },
  },
  {
    version: "0014_learning_product",
    run: (database) => {
      if (tableExists(database, "workspaces")) {
        addColumnIfMissing(database, "workspaces", "onboarding_completed", "INTEGER NOT NULL DEFAULT 0");
        const activityTables = ["study_sessions", "review_events", "mistakes", "day_tasks", "assets"]
          .filter((table) => tableExists(database, table));
        if (activityTables.length) {
          const activityChecks = activityTables
            .map((table) => `EXISTS (SELECT 1 FROM ${table} activity WHERE activity.workspace_id = workspaces.id)`)
            .join(" OR ");
          database.exec(`
            UPDATE workspaces SET onboarding_completed = 1
            WHERE onboarding_completed = 0 AND (${activityChecks})
          `);
        }
      }
      database.exec(`
        CREATE TABLE IF NOT EXISTS mock_exams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id TEXT NOT NULL,
          day TEXT NOT NULL,
          name TEXT NOT NULL,
          subject_code TEXT,
          score REAL NOT NULL DEFAULT 0,
          max_score REAL NOT NULL DEFAULT 100,
          duration_minutes INTEGER NOT NULL DEFAULT 0,
          breakdown_json TEXT NOT NULL DEFAULT '[]',
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_mock_exams_workspace_day
          ON mock_exams(workspace_id, day DESC, created_at DESC);
      `);
    },
  },
  {
    version: "0015_recovery_audit",
    run: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS review_recovery_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id TEXT NOT NULL,
          day TEXT NOT NULL,
          moved_count INTEGER NOT NULL DEFAULT 0,
          horizon_days INTEGER NOT NULL DEFAULT 7,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_review_recovery_workspace
          ON review_recovery_events(workspace_id, day DESC);
      `);
    },
  },
  {
    version: "0016_task_schedule",
    run: (database) => {
      if (!tableExists(database, "day_tasks")) return;
      addColumnIfMissing(database, "day_tasks", "priority", "INTEGER NOT NULL DEFAULT 2");
      addColumnIfMissing(database, "day_tasks", "estimated_minutes", "INTEGER NOT NULL DEFAULT 30");
      addColumnIfMissing(database, "day_tasks", "scheduled_start", "TEXT");
      addColumnIfMissing(database, "day_tasks", "notes", "TEXT NOT NULL DEFAULT ''");
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_schedule
        ON day_tasks(workspace_id, day, scheduled_start, done, priority)
      `);
    },
  },
  {
    version: "0017_agent_tokens",
    sql: `
      CREATE TABLE IF NOT EXISTS agent_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        token_prefix TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_agent_tokens_user
        ON agent_tokens(user_id, revoked_at, expires_at);
      CREATE INDEX IF NOT EXISTS idx_agent_tokens_hash
        ON agent_tokens(token_hash);
    `,
  },
  {
    version: "0018_planner_core",
    run: (database) => {
      addColumnIfMissing(database, "workspaces", "timezone", "TEXT NOT NULL DEFAULT 'Asia/Shanghai'");
      addColumnIfMissing(database, "workspaces", "week_start", "INTEGER NOT NULL DEFAULT 1");
      addColumnIfMissing(database, "workspaces", "hour_cycle", "INTEGER NOT NULL DEFAULT 24");
      addColumnIfMissing(database, "workspaces", "working_hours_json", "TEXT NOT NULL DEFAULT '{}'");
      database.exec(`
        CREATE TABLE task_lists (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          name TEXT NOT NULL,
          color_token TEXT NOT NULL DEFAULT 'summit-blue',
          icon TEXT NOT NULL DEFAULT 'ListTodo',
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_inbox INTEGER NOT NULL DEFAULT 0 CHECK (is_inbox IN (0, 1)),
          archived_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(workspace_id, name),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX idx_task_lists_inbox
          ON task_lists(workspace_id, is_inbox) WHERE is_inbox = 1;
        CREATE INDEX idx_task_lists_workspace
          ON task_lists(workspace_id, archived_at, sort_order, id);

        CREATE TABLE planner_tasks (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          list_id TEXT NOT NULL,
          parent_task_id TEXT,
          depth INTEGER NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 3),
          title TEXT NOT NULL CHECK (length(trim(title)) > 0),
          notes TEXT NOT NULL DEFAULT '',
          subject_code TEXT,
          status TEXT NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'waiting', 'completed', 'canceled')),
          priority INTEGER NOT NULL DEFAULT 2 CHECK (priority IN (1, 2, 3)),
          due_date TEXT,
          due_at TEXT,
          due_timezone TEXT,
          scheduled_start_at TEXT,
          scheduled_end_at TEXT,
          scheduled_timezone TEXT,
          scheduled_all_day INTEGER NOT NULL DEFAULT 0 CHECK (scheduled_all_day IN (0, 1)),
          estimated_minutes INTEGER NOT NULL DEFAULT 30 CHECK (estimated_minutes BETWEEN 5 AND 1440),
          series_id TEXT,
          occurrence_key TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          deleted_at TEXT,
          completed_at TEXT,
          canceled_at TEXT,
          version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
          legacy_day_task_id INTEGER,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK (due_date IS NULL OR due_at IS NULL),
          CHECK ((due_at IS NULL AND due_timezone IS NULL) OR (due_at IS NOT NULL AND due_timezone IS NOT NULL)),
          CHECK (
            (scheduled_start_at IS NULL AND scheduled_end_at IS NULL AND scheduled_timezone IS NULL)
            OR
            (scheduled_start_at IS NOT NULL AND scheduled_end_at IS NOT NULL
             AND scheduled_timezone IS NOT NULL AND scheduled_end_at > scheduled_start_at)
          ),
          CHECK (
            (status = 'completed' AND completed_at IS NOT NULL)
            OR (status != 'completed' AND completed_at IS NULL)
          ),
          CHECK (
            (status = 'canceled' AND canceled_at IS NOT NULL)
            OR (status != 'canceled' AND canceled_at IS NULL)
          ),
          UNIQUE(workspace_id, legacy_day_task_id),
          UNIQUE(workspace_id, series_id, occurrence_key),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
          FOREIGN KEY (list_id) REFERENCES task_lists(id) ON DELETE RESTRICT,
          FOREIGN KEY (parent_task_id) REFERENCES planner_tasks(id) ON DELETE RESTRICT
        );
        CREATE INDEX idx_planner_tasks_workspace_list
          ON planner_tasks(workspace_id, list_id, deleted_at, status, sort_order, id);
        CREATE INDEX idx_planner_tasks_due
          ON planner_tasks(workspace_id, deleted_at, status, due_date, due_at, id);
        CREATE INDEX idx_planner_tasks_schedule
          ON planner_tasks(workspace_id, deleted_at, scheduled_start_at, scheduled_end_at, id);
        CREATE INDEX idx_planner_tasks_parent
          ON planner_tasks(workspace_id, parent_task_id, sort_order, id);

        CREATE TABLE planner_calendars (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          name TEXT NOT NULL,
          color_token TEXT NOT NULL DEFAULT 'summit-blue',
          is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
          visibility TEXT NOT NULL DEFAULT 'visible'
            CHECK (visibility IN ('visible', 'hidden')),
          sort_order INTEGER NOT NULL DEFAULT 0,
          archived_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(workspace_id, name),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX idx_planner_calendars_default
          ON planner_calendars(workspace_id, is_default) WHERE is_default = 1;
        CREATE INDEX idx_planner_calendars_workspace
          ON planner_calendars(workspace_id, archived_at, sort_order, id);

        CREATE TABLE calendar_events (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          calendar_id TEXT NOT NULL,
          title TEXT NOT NULL CHECK (length(trim(title)) > 0),
          description TEXT NOT NULL DEFAULT '',
          location TEXT NOT NULL DEFAULT '',
          url TEXT NOT NULL DEFAULT '',
          subject_code TEXT,
          kind TEXT NOT NULL DEFAULT 'event'
            CHECK (kind IN ('event', 'class', 'exam', 'meeting', 'focus', 'milestone')),
          busy_status TEXT NOT NULL DEFAULT 'busy' CHECK (busy_status IN ('busy', 'free')),
          start_at TEXT,
          end_at TEXT,
          timezone TEXT,
          start_date TEXT,
          end_date_exclusive TEXT,
          all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
          recurrence_rule TEXT,
          recurrence_until TEXT,
          recurring_event_id TEXT,
          original_start_at TEXT,
          exception_kind TEXT CHECK (exception_kind IN ('override', 'cancel')),
          migration_key TEXT,
          deleted_at TEXT,
          version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK (
            (all_day = 1 AND start_date IS NOT NULL AND end_date_exclusive IS NOT NULL
             AND end_date_exclusive > start_date AND start_at IS NULL AND end_at IS NULL AND timezone IS NULL)
            OR
            (all_day = 0 AND start_at IS NOT NULL AND end_at IS NOT NULL
             AND end_at > start_at AND timezone IS NOT NULL
             AND start_date IS NULL AND end_date_exclusive IS NULL)
          ),
          CHECK (
            (recurring_event_id IS NULL AND original_start_at IS NULL AND exception_kind IS NULL)
            OR
            (recurring_event_id IS NOT NULL AND original_start_at IS NOT NULL AND exception_kind IS NOT NULL)
          ),
          UNIQUE(workspace_id, recurring_event_id, original_start_at),
          UNIQUE(workspace_id, migration_key),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
          FOREIGN KEY (calendar_id) REFERENCES planner_calendars(id) ON DELETE RESTRICT,
          FOREIGN KEY (recurring_event_id) REFERENCES calendar_events(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_calendar_events_timed_range
          ON calendar_events(workspace_id, deleted_at, start_at, end_at, calendar_id);
        CREATE INDEX idx_calendar_events_all_day_range
          ON calendar_events(workspace_id, deleted_at, start_date, end_date_exclusive, calendar_id);
        CREATE INDEX idx_calendar_events_recurring
          ON calendar_events(workspace_id, recurring_event_id, original_start_at);

        CREATE TABLE planner_labels (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          name TEXT NOT NULL,
          color_token TEXT NOT NULL DEFAULT 'summit-blue',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(workspace_id, name),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_planner_labels_workspace
          ON planner_labels(workspace_id, name, id);

        CREATE TABLE planner_task_labels (
          workspace_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          label_id TEXT NOT NULL,
          PRIMARY KEY (workspace_id, task_id, label_id),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
          FOREIGN KEY (task_id) REFERENCES planner_tasks(id) ON DELETE CASCADE,
          FOREIGN KEY (label_id) REFERENCES planner_labels(id) ON DELETE CASCADE
        );
        CREATE TABLE planner_event_labels (
          workspace_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          label_id TEXT NOT NULL,
          PRIMARY KEY (workspace_id, event_id, label_id),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
          FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
          FOREIGN KEY (label_id) REFERENCES planner_labels(id) ON DELETE CASCADE
        );
      `);

      const workspaces = database.prepare("SELECT id FROM workspaces ORDER BY id").all() as Array<{ id: string }>;
      for (const workspace of workspaces) ensurePlannerDefaults(database, { workspaceId: workspace.id });
      migrateLegacyDayTasks(database);
      database.exec(`
        CREATE TRIGGER day_tasks_planner_v2_readonly_insert
        BEFORE INSERT ON day_tasks
        BEGIN
          SELECT RAISE(ABORT, 'day_tasks is read-only after Planner v2 migration');
        END;
        CREATE TRIGGER day_tasks_planner_v2_readonly_update
        BEFORE UPDATE ON day_tasks
        BEGIN
          SELECT RAISE(ABORT, 'day_tasks is read-only after Planner v2 migration');
        END;
        CREATE TRIGGER day_tasks_planner_v2_readonly_delete
        BEFORE DELETE ON day_tasks
        BEGIN
          SELECT RAISE(ABORT, 'day_tasks is read-only after Planner v2 migration');
        END;
      `);
    },
  },
  {
    version: "0019_planner_recurrence_reminders",
    sql: `
      CREATE TABLE task_series (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        rrule TEXT NOT NULL,
        timezone TEXT NOT NULL,
        generation_mode TEXT NOT NULL
          CHECK (generation_mode IN ('fixed_schedule', 'after_completion')),
        template_json TEXT NOT NULL,
        next_occurrence_at TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        generated_count INTEGER NOT NULL DEFAULT 0 CHECK (generated_count >= 0),
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workspace_id, idempotency_key),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_task_series_due
        ON task_series(workspace_id, active, next_occurrence_at, id);

      CREATE TABLE planner_reminders (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('task', 'event')),
        entity_id TEXT NOT NULL,
        anchor TEXT NOT NULL
          CHECK (anchor IN ('due', 'scheduled_start', 'event_start', 'exact')),
        offset_minutes INTEGER,
        exact_at TEXT,
        channel TEXT NOT NULL CHECK (channel IN ('in_app', 'web_push')),
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'leased', 'sent', 'failed', 'canceled')),
        next_attempt_at TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        leased_until TEXT,
        lease_owner TEXT,
        sent_at TEXT,
        last_error TEXT NOT NULL DEFAULT '',
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (
          (anchor = 'exact' AND exact_at IS NOT NULL)
          OR (anchor != 'exact' AND offset_minutes IS NOT NULL)
        ),
        UNIQUE(workspace_id, idempotency_key),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_planner_reminders_claim
        ON planner_reminders(status, next_attempt_at, leased_until, id);
      CREATE INDEX idx_planner_reminders_entity
        ON planner_reminders(workspace_id, entity_type, entity_id, status, id);

      CREATE TABLE planner_notifications (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        reminder_id TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        target_path TEXT NOT NULL,
        read_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workspace_id, reminder_id),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (reminder_id) REFERENCES planner_reminders(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_planner_notifications_unread
        ON planner_notifications(workspace_id, read_at, created_at DESC);

      CREATE TABLE push_subscriptions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        endpoint_hash TEXT NOT NULL,
        endpoint_ciphertext TEXT NOT NULL,
        p256dh_ciphertext TEXT NOT NULL,
        auth_ciphertext TEXT NOT NULL,
        device_name TEXT NOT NULL DEFAULT '',
        last_success_at TEXT,
        expired_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workspace_id, endpoint_hash),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_push_subscriptions_active
        ON push_subscriptions(workspace_id, expired_at, id);
    `,
  },
];

function migrateLegacyDayTasks(database: Database.Database): void {
  if (!tableExists(database, "day_tasks") || !tableExists(database, "planner_tasks")) return;
  const legacyTasks = database.prepare(`
    SELECT d.workspace_id, d.id, d.day, d.title, d.subject_code, d.done, d.sort_order,
           d.created_at, d.done_at, d.priority, d.estimated_minutes, d.scheduled_start, d.notes,
           COALESCE(w.timezone, 'Asia/Shanghai') AS timezone
    FROM day_tasks d
    JOIN workspaces w ON w.id = d.workspace_id
    LEFT JOIN planner_tasks p
      ON p.workspace_id = d.workspace_id AND p.legacy_day_task_id = d.id
    WHERE p.id IS NULL
    ORDER BY d.workspace_id, d.id
  `).all() as Array<{
    workspace_id: string;
    id: number;
    day: string;
    title: string;
    subject_code: string | null;
    done: number;
    sort_order: number;
    created_at: string;
    done_at: string | null;
    priority: number;
    estimated_minutes: number;
    scheduled_start: string | null;
    notes: string;
    timezone: string;
  }>;
  const insert = database.prepare(`
    INSERT OR IGNORE INTO planner_tasks
      (id, workspace_id, list_id, title, notes, subject_code, status, priority,
       due_date, scheduled_start_at, scheduled_end_at, scheduled_timezone,
       estimated_minutes, sort_order, completed_at, version, legacy_day_task_id,
       created_at, updated_at)
    VALUES
      (@plannerId, @workspaceId, @listId, @title, @notes, @subjectCode, @status, @priority,
       @dueDate, @scheduledStartAt, @scheduledEndAt, @scheduledTimezone,
       @estimatedMinutes, @sortOrder, @completedAt, 1, @legacyId,
       @createdAt, @updatedAt)
  `);
  for (const task of legacyTasks) {
    const scheduledStartAt = task.scheduled_start
      ? localDateTimeToUtc({ date: task.day, time: task.scheduled_start, timeZone: task.timezone })
      : null;
    insert.run({
      plannerId: `${task.workspace_id}:planner:legacy-day-task:${task.id}`,
      workspaceId: task.workspace_id,
      listId: plannerDefaultId(task.workspace_id, "inbox"),
      title: task.title,
      notes: task.notes,
      subjectCode: task.subject_code,
      status: task.done ? "completed" : "open",
      priority: task.priority,
      dueDate: scheduledStartAt ? null : task.day,
      scheduledStartAt,
      scheduledEndAt: scheduledStartAt ? addMinutesToInstant(scheduledStartAt, task.estimated_minutes) : null,
      scheduledTimezone: scheduledStartAt ? task.timezone : null,
      estimatedMinutes: task.estimated_minutes,
      sortOrder: task.sort_order,
      completedAt: task.done ? (task.done_at ?? task.created_at) : null,
      legacyId: task.id,
      createdAt: task.created_at,
      updatedAt: task.done_at ?? task.created_at,
    });
  }
}

function addColumnIfMissing(database: Database.Database, table: string, column: string, definition: string): void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((existing) => existing.name === column)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function rebuildWorkspaceKeyedTables(database: Database.Database): void {
  rebuildTableWithWorkspace(database, {
    table: "subjects",
    create: `
      CREATE TABLE subjects (
        workspace_id TEXT NOT NULL DEFAULT 'workspace:legacy',
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        track TEXT NOT NULL DEFAULT 'written',
        PRIMARY KEY (workspace_id, code),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `,
    columns: ["code", "name", "description", "track"],
  });
  rebuildTableWithWorkspace(database, {
    table: "subject_chapters",
    create: `
      CREATE TABLE subject_chapters (
        workspace_id TEXT NOT NULL DEFAULT 'workspace:legacy',
        id TEXT PRIMARY KEY,
        subject_code TEXT NOT NULL,
        title TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workspace_id, subject_code, title),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `,
    columns: ["id", "subject_code", "title", "sort_order", "created_at", "updated_at"],
  });
  rebuildTableWithWorkspace(database, {
    table: "daily_entries",
    create: `
      CREATE TABLE daily_entries (
        workspace_id TEXT NOT NULL DEFAULT 'workspace:legacy',
        date TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT '',
        diary TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        blockers TEXT NOT NULL DEFAULT '',
        tomorrow TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (workspace_id, date),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `,
    columns: ["date", "plan", "diary", "summary", "blockers", "tomorrow", "created_at", "updated_at"],
  });
  rebuildTableWithWorkspace(database, {
    table: "folders",
    create: `
      CREATE TABLE folders (
        workspace_id TEXT NOT NULL DEFAULT 'workspace:legacy',
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        parent_path TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (workspace_id, path),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `,
    columns: ["path", "name", "parent_path", "created_at", "updated_at"],
  });
  rebuildTableWithWorkspace(database, {
    table: "app_settings",
    create: `
      CREATE TABLE app_settings (
        workspace_id TEXT NOT NULL DEFAULT 'workspace:legacy',
        key TEXT NOT NULL,
        value TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (workspace_id, key),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `,
    columns: ["key", "value"],
  });
  rebuildTableWithWorkspace(database, {
    table: "drafts",
    create: `
      CREATE TABLE drafts (
        workspace_id TEXT NOT NULL DEFAULT 'workspace:legacy',
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        field TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        base_version INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        device_id TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workspace_id, scope_type, scope_id, field),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `,
    columns: [
      "id",
      "scope_type",
      "scope_id",
      "field",
      "content",
      "base_version",
      "version",
      "status",
      "device_id",
      "updated_at",
    ],
  });
  rebuildTableWithWorkspace(database, {
    table: "tags",
    create: `
      CREATE TABLE tags (
        workspace_id TEXT NOT NULL DEFAULT 'workspace:legacy',
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        UNIQUE(workspace_id, name),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `,
    columns: ["id", "name"],
  });
}

function rebuildTableWithWorkspace(
  database: Database.Database,
  input: { table: string; create: string; columns: string[] },
): void {
  if (!tableExists(database, input.table)) return;
  const columns = database.prepare(`PRAGMA table_info(${input.table})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === "workspace_id")) return;

  const legacyTable = `${input.table}__pre_workspace`;
  database.exec(`ALTER TABLE ${input.table} RENAME TO ${legacyTable}`);
  database.exec(input.create);
  const names = input.columns.join(", ");
  database.prepare(`
    INSERT INTO ${input.table} (workspace_id, ${names})
    SELECT ?, ${names} FROM ${legacyTable}
  `).run(LEGACY_WORKSPACE_ID);
  database.exec(`DROP TABLE ${legacyTable}`);
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export function runMigrations(database: Database.Database, options: MigrationOptions = {}): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum TEXT NOT NULL
    );
  `);

  const applied = new Map(
    database
      .prepare("SELECT version, checksum FROM schema_migrations")
      .all()
      .map((row) => {
        const migration = row as { version: string; checksum: string };
        return [migration.version, migration.checksum];
      }),
  );
  const insert = database.prepare("INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)");

  for (const migration of migrations) {
    if (options.throughVersion && migration.version > options.throughVersion) break;
    const expectedChecksum = checksum(migration.sql ?? migration.version);
    const appliedChecksum = applied.get(migration.version);
    if (appliedChecksum) {
      if (appliedChecksum !== expectedChecksum) {
        throw new Error(`Migration checksum mismatch for ${migration.version}`);
      }
      continue;
    }

    const apply = database.transaction(() => {
      if (migration.sql) database.exec(migration.sql);
      migration.run?.(database);
      insert.run(migration.version, expectedChecksum);
    });

    apply();
  }

  backfillAssetBlobs(database, options.uploadRoot);
  backfillKnowledgeHierarchy(database);
}

/**
 * Unifies the two legacy knowledge structures into one tree:
 * subjects -> subject_chapters -> knowledge_points.
 *
 * - knowledge_points without a chapter are attached to a chapter derived
 *   from their legacy `submodule` text.
 * - Legacy `knowledge_tags` (chapter-scoped point names) become real
 *   knowledge_points, and `asset_knowledge_tags` links are migrated to
 *   `asset_links.knowledge_point_id`.
 *
 * Legacy tables are kept (never dropped) but no longer written to.
 * Every step is idempotent so this can run on every startup.
 */
export function backfillKnowledgeHierarchy(database: Database.Database): void {
  const required = ["knowledge_points", "subject_chapters", "knowledge_tags", "subjects"];
  if (!required.every((table) => tableExists(database, table))) return;
  const pointColumns = database.prepare("PRAGMA table_info(knowledge_points)").all() as Array<{ name: string }>;
  if (!pointColumns.some((column) => column.name === "chapter_id")) return;

  const run = database.transaction(() => {
    // 1. Attach orphan knowledge points to chapters derived from their submodule text.
    const orphanPoints = database.prepare(`
      SELECT workspace_id, id, subject_code, submodule FROM knowledge_points WHERE chapter_id IS NULL
    `).all() as Array<{ workspace_id: string; id: string; subject_code: string; submodule: string }>;
    if (orphanPoints.length) {
      const insertChapter = database.prepare(`
        INSERT OR IGNORE INTO subject_chapters (workspace_id, id, subject_code, title, sort_order)
        VALUES (@workspaceId, @id, @subjectCode, @title,
          COALESCE((SELECT MAX(sort_order) FROM subject_chapters
                    WHERE workspace_id = @workspaceId AND subject_code = @subjectCode), 0) + 1)
      `);
      const findChapter = database.prepare(`
        SELECT id FROM subject_chapters
        WHERE workspace_id = ? AND subject_code = ? AND title = ?
      `);
      const attach = database.prepare("UPDATE knowledge_points SET chapter_id = ? WHERE id = ?");
      for (const point of orphanPoints) {
        const title = point.submodule?.trim() || "未分章";
        insertChapter.run({
          workspaceId: point.workspace_id,
          id: point.workspace_id === LEGACY_WORKSPACE_ID
            ? `chapter:${point.subject_code}:${migrationSlug(title)}`
            : `${point.workspace_id}:chapter:${point.subject_code}:${migrationSlug(title)}`,
          subjectCode: point.subject_code,
          title,
        });
        const chapter = findChapter.get(point.workspace_id, point.subject_code, title) as { id: string };
        attach.run(chapter.id, point.id);
      }
    }

    // 2. Promote legacy knowledge_tags to knowledge_points (skip names that already exist in the chapter).
    const tags = database.prepare(`
      SELECT t.workspace_id, t.id AS tag_id, t.chapter_id, t.name,
             c.subject_code, c.title AS chapter_title, s.name AS subject_name
      FROM knowledge_tags t
      JOIN subject_chapters c ON c.id = t.chapter_id AND c.workspace_id = t.workspace_id
      JOIN subjects s ON s.code = c.subject_code AND s.workspace_id = c.workspace_id
    `).all() as Array<{
      workspace_id: string;
      tag_id: string;
      chapter_id: string;
      name: string;
      subject_code: string;
      chapter_title: string;
      subject_name: string;
    }>;
    const pointByChapterTitle = database.prepare(
      "SELECT id FROM knowledge_points WHERE workspace_id = ? AND chapter_id = ? AND title = ?",
    );
    const insertPoint = database.prepare(`
      INSERT INTO knowledge_points
        (workspace_id, id, subject_code, subject_name, submodule, tier, tier_name, title,
         exam, status, mastery, reviews, chapter_id, created_at)
      VALUES
        (@workspaceId, @id, @subjectCode, @subjectName, @submodule, 'g', '了解',
         @title, 0, '未学', 0, 0, @chapterId, datetime('now'))
    `);
    const tagToPoint = new Map<string, string>();
    for (const tag of tags) {
      const existing = pointByChapterTitle.get(tag.workspace_id, tag.chapter_id, tag.name) as
        | { id: string }
        | undefined;
      if (existing) {
        tagToPoint.set(tag.tag_id, existing.id);
        continue;
      }
      const id = tag.workspace_id === LEGACY_WORKSPACE_ID
        ? `kp:${tag.chapter_id}:${migrationSlug(tag.name)}`
        : `${tag.workspace_id}:kp:${tag.chapter_id}:${migrationSlug(tag.name)}`;
      insertPoint.run({
        workspaceId: tag.workspace_id,
        id,
        subjectCode: tag.subject_code,
        subjectName: tag.subject_name,
        submodule: tag.chapter_title,
        title: tag.name,
        chapterId: tag.chapter_id,
      });
      tagToPoint.set(tag.tag_id, id);
    }

    // 3. Migrate asset_knowledge_tags links into asset_links.
    if (tableExists(database, "asset_knowledge_tags")) {
      const links = database.prepare(`
        SELECT akt.workspace_id, akt.asset_id, akt.knowledge_tag_id, c.subject_code, c.id AS chapter_id
        FROM asset_knowledge_tags akt
        JOIN knowledge_tags t ON t.id = akt.knowledge_tag_id AND t.workspace_id = akt.workspace_id
        JOIN subject_chapters c ON c.id = t.chapter_id AND c.workspace_id = t.workspace_id
      `).all() as Array<{
        workspace_id: string;
        asset_id: number;
        knowledge_tag_id: string;
        subject_code: string;
        chapter_id: string;
      }>;
      const insertLink = database.prepare(`
        INSERT OR IGNORE INTO asset_links (workspace_id, asset_id, subject_code, chapter_id, knowledge_point_id)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const link of links) {
        const pointId = tagToPoint.get(link.knowledge_tag_id);
        if (pointId) {
          insertLink.run(link.workspace_id, link.asset_id, link.subject_code, link.chapter_id, pointId);
        }
      }
    }
  });
  run();
}

function migrationSlug(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase()).replaceAll("%", "");
}

export function getAppliedMigrations(database: Database.Database): string[] {
  const exists = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();

  if (!exists) return [];

  return database
    .prepare("SELECT version FROM schema_migrations ORDER BY version ASC")
    .all()
    .map((row) => (row as { version: string }).version);
}

function backfillAssetBlobs(database: Database.Database, uploadRoot?: string): void {
  if (!uploadRoot || !tableExists(database, "assets") || !tableExists(database, "blobs")) return;

  // 只处理还没有对应 blob 行的 asset：迁移完成后 relative_path 即 storage_key，
  // 此查询命中 0 行，冷启动不再全量读文件重哈希。
  const assets = database.prepare(`
    SELECT a.workspace_id, a.id, a.original_name, a.relative_path
    FROM assets a
    LEFT JOIN blobs b ON b.workspace_id = a.workspace_id AND b.storage_key = a.relative_path
    WHERE b.id IS NULL
  `).all() as Array<{
    workspace_id: string;
    id: number;
    original_name: string;
    relative_path: string;
  }>;
  if (!assets.length) return;

  const insertBlob = database.prepare(`
    INSERT INTO blobs (workspace_id, id, sha256, size, mime_type, storage_key, ref_count)
    VALUES (@workspaceId, @id, @sha256, @size, @mimeType, @storageKey, 0)
    ON CONFLICT(id) DO UPDATE SET
      size = excluded.size,
      storage_key = excluded.storage_key
  `);
  const updateAsset = database.prepare(`
    UPDATE assets SET relative_path = ?, size = ? WHERE workspace_id = ? AND id = ?
  `);

  const backfill = database.transaction(() => {
    for (const asset of assets) {
      const sourcePath = resolveAssetPathForRoot(uploadRoot, asset.relative_path);
      if (!existsSync(/*turbopackIgnore: true*/ sourcePath)) continue;

      const bytes = readFileSync(/*turbopackIgnore: true*/ sourcePath);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const storageKey = storageKeyForSha(asset.workspace_id, sha256);
      const targetPath = resolveAssetPathForRoot(uploadRoot, storageKey);
      mkdirSync(path.dirname(targetPath), { recursive: true });
      if (!existsSync(/*turbopackIgnore: true*/ targetPath)) {
        copyFileSync(/*turbopackIgnore: true*/ sourcePath, /*turbopackIgnore: true*/ targetPath);
      }

      const size = statSync(/*turbopackIgnore: true*/ targetPath).size;
      insertBlob.run({
        workspaceId: asset.workspace_id,
        id: `${asset.workspace_id}:${sha256}`,
        sha256,
        size,
        mimeType: "",
        storageKey,
      });
      updateAsset.run(storageKey, size, asset.workspace_id, asset.id);
    }

    database.prepare(`
      UPDATE blobs
      SET ref_count = (
        SELECT COUNT(*)
        FROM assets
        WHERE assets.workspace_id = blobs.workspace_id
          AND assets.relative_path = blobs.storage_key
      )
    `).run();
  });

  backfill();
}

function tableExists(database: Database.Database, tableName: string): boolean {
  return Boolean(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function tableHasColumns(database: Database.Database, tableName: string, required: string[]): boolean {
  if (!tableExists(database, tableName)) return false;
  const columns = new Set(
    (database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map((column) => column.name),
  );
  return required.every((column) => columns.has(column));
}

function storageKeyForSha(workspaceId: string, sha256: string): string {
  return path.posix.join(encodeURIComponent(workspaceId), "blobs", sha256.slice(0, 2), sha256);
}

function resolveAssetPathForRoot(uploadRoot: string, relativePath: string): string {
  const root = path.resolve(/*turbopackIgnore: true*/ uploadRoot);
  const absolute = path.resolve(/*turbopackIgnore: true*/ root, relativePath);
  if (absolute !== root && absolute.startsWith(`${root}${path.sep}`)) return absolute;
  throw new Error("Invalid asset path");
}
