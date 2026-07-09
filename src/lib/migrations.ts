import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

type Migration = {
  version: string;
  sql?: string;
  run?: (database: Database.Database) => void;
};

type MigrationOptions = {
  uploadRoot?: string;
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
];

function addColumnIfMissing(database: Database.Database, table: string, column: string, definition: string): void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((existing) => existing.name === column)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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
      SELECT id, subject_code, submodule FROM knowledge_points WHERE chapter_id IS NULL
    `).all() as Array<{ id: string; subject_code: string; submodule: string }>;
    if (orphanPoints.length) {
      const insertChapter = database.prepare(`
        INSERT OR IGNORE INTO subject_chapters (id, subject_code, title, sort_order)
        VALUES (@id, @subjectCode, @title,
          COALESCE((SELECT MAX(sort_order) FROM subject_chapters WHERE subject_code = @subjectCode), 0) + 1)
      `);
      const findChapter = database.prepare("SELECT id FROM subject_chapters WHERE subject_code = ? AND title = ?");
      const attach = database.prepare("UPDATE knowledge_points SET chapter_id = ? WHERE id = ?");
      for (const point of orphanPoints) {
        const title = point.submodule?.trim() || "未分章";
        insertChapter.run({
          id: `chapter:${point.subject_code}:${migrationSlug(title)}`,
          subjectCode: point.subject_code,
          title,
        });
        const chapter = findChapter.get(point.subject_code, title) as { id: string };
        attach.run(chapter.id, point.id);
      }
    }

    // 2. Promote legacy knowledge_tags to knowledge_points (skip names that already exist in the chapter).
    const tags = database.prepare(`
      SELECT t.id AS tag_id, t.chapter_id, t.name, c.subject_code, c.title AS chapter_title, s.name AS subject_name
      FROM knowledge_tags t
      JOIN subject_chapters c ON c.id = t.chapter_id
      JOIN subjects s ON s.code = c.subject_code
    `).all() as Array<{
      tag_id: string;
      chapter_id: string;
      name: string;
      subject_code: string;
      chapter_title: string;
      subject_name: string;
    }>;
    const pointByChapterTitle = database.prepare(
      "SELECT id FROM knowledge_points WHERE chapter_id = ? AND title = ?",
    );
    const insertPoint = database.prepare(`
      INSERT INTO knowledge_points
        (id, subject_code, subject_name, submodule, tier, tier_name, title, exam, status, mastery, reviews, chapter_id)
      VALUES
        (@id, @subjectCode, @subjectName, @submodule, 'g', '了解', @title, 0, '未学', 0, 0, @chapterId)
    `);
    const tagToPoint = new Map<string, string>();
    for (const tag of tags) {
      const existing = pointByChapterTitle.get(tag.chapter_id, tag.name) as { id: string } | undefined;
      if (existing) {
        tagToPoint.set(tag.tag_id, existing.id);
        continue;
      }
      const id = `kp:${tag.chapter_id}:${migrationSlug(tag.name)}`;
      insertPoint.run({
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
        SELECT akt.asset_id, akt.knowledge_tag_id, c.subject_code, c.id AS chapter_id
        FROM asset_knowledge_tags akt
        JOIN knowledge_tags t ON t.id = akt.knowledge_tag_id
        JOIN subject_chapters c ON c.id = t.chapter_id
      `).all() as Array<{ asset_id: number; knowledge_tag_id: string; subject_code: string; chapter_id: string }>;
      const insertLink = database.prepare(`
        INSERT OR IGNORE INTO asset_links (asset_id, subject_code, chapter_id, knowledge_point_id)
        VALUES (?, ?, ?, ?)
      `);
      for (const link of links) {
        const pointId = tagToPoint.get(link.knowledge_tag_id);
        if (pointId) insertLink.run(link.asset_id, link.subject_code, link.chapter_id, pointId);
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

  const assets = database.prepare("SELECT id, original_name, relative_path FROM assets").all() as Array<{
    id: number;
    original_name: string;
    relative_path: string;
  }>;
  if (!assets.length) return;

  const insertBlob = database.prepare(`
    INSERT INTO blobs (id, sha256, size, mime_type, storage_key, ref_count)
    VALUES (@id, @sha256, @size, @mimeType, @storageKey, 0)
    ON CONFLICT(id) DO UPDATE SET
      size = excluded.size,
      storage_key = excluded.storage_key
  `);
  const updateAsset = database.prepare("UPDATE assets SET relative_path = ?, size = ? WHERE id = ?");

  const backfill = database.transaction(() => {
    for (const asset of assets) {
      const sourcePath = resolveAssetPathForRoot(uploadRoot, asset.relative_path);
      if (!existsSync(/*turbopackIgnore: true*/ sourcePath)) continue;

      const bytes = readFileSync(/*turbopackIgnore: true*/ sourcePath);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const storageKey = storageKeyForSha(sha256);
      const targetPath = resolveAssetPathForRoot(uploadRoot, storageKey);
      mkdirSync(path.dirname(targetPath), { recursive: true });
      if (!existsSync(/*turbopackIgnore: true*/ targetPath)) {
        copyFileSync(/*turbopackIgnore: true*/ sourcePath, /*turbopackIgnore: true*/ targetPath);
      }

      const size = statSync(/*turbopackIgnore: true*/ targetPath).size;
      insertBlob.run({
        id: sha256,
        sha256,
        size,
        mimeType: "",
        storageKey,
      });
      updateAsset.run(storageKey, size, asset.id);
    }

    database.prepare(`
      UPDATE blobs
      SET ref_count = (
        SELECT COUNT(*)
        FROM assets
        WHERE assets.relative_path = blobs.storage_key
      )
    `).run();
  });

  backfill();
}

function tableExists(database: Database.Database, tableName: string): boolean {
  return Boolean(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function storageKeyForSha(sha256: string): string {
  return path.posix.join("blobs", sha256.slice(0, 2), sha256);
}

function resolveAssetPathForRoot(uploadRoot: string, relativePath: string): string {
  const root = path.resolve(/*turbopackIgnore: true*/ uploadRoot);
  const absolute = path.resolve(/*turbopackIgnore: true*/ root, relativePath);
  if (absolute !== root && absolute.startsWith(`${root}${path.sep}`)) return absolute;
  throw new Error("Invalid asset path");
}
