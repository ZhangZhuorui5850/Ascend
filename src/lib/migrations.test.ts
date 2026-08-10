import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "./db";
import { getAppliedMigrations, MIGRATION_RUN_HASHES, runMigrations } from "./migrations";
import { LEGACY_WORKSPACE_ID } from "./repo/workspaces";

describe("runMigrations", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("creates migration bookkeeping and core sync tables", () => {
    const db = new Database(":memory:");

    runMigrations(db);

    expect(getAppliedMigrations(db)).toContain("0001_foundation");
    expect(getAppliedMigrations(db)).toContain("0002_auth_sessions");
    expect(getAppliedMigrations(db)).toContain("0003_asset_blobs");
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'devices'").get()).toMatchObject({
      name: "devices",
    });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entity_changes'").get(),
    ).toMatchObject({ name: "entity_changes" });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drafts'").get()).toMatchObject({
      name: "drafts",
    });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()).toMatchObject({
      name: "users",
    });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get()).toMatchObject(
      { name: "sessions" },
    );
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'blobs'").get()).toMatchObject({
      name: "blobs",
    });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'upload_sessions'").get(),
    ).toMatchObject({ name: "upload_sessions" });
  });

  it("adds identity and workspace schema", () => {
    const db = new Database(":memory:");

    runMigrations(db);

    const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    expect(userColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["role", "status", "must_change_password", "last_login_at", "password_changed_at"]),
    );
    for (const table of ["workspaces", "invitations", "audit_logs", "login_attempts"]) {
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toMatchObject({
        name: table,
      });
    }
  });

  it("adds learning-engine state and idempotency fields", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);

    const pointColumns = (db.prepare("PRAGMA table_info(knowledge_points)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(pointColumns).toEqual(
      expect.arrayContaining(["prompt", "answer", "interval_step", "lapse_count", "last_score"]),
    );
    const mistakeColumns = (db.prepare("PRAGMA table_info(mistakes)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(mistakeColumns).toEqual(expect.arrayContaining(["pass_count", "last_pass_day", "cause_category"]));
    const reviewColumns = (db.prepare("PRAGMA table_info(review_events)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(reviewColumns).toEqual(
      expect.arrayContaining([
        "operation_id",
        "event_type",
        "attempt_mode",
        "attempt_text",
        "attempt_duration_seconds",
        "pre_confidence",
      ]),
    );
    const pointColumnsWithEvidence = (
      db.prepare("PRAGMA table_info(knowledge_points)").all() as Array<{ name: string }>
    ).map((row) => row.name);
    expect(pointColumnsWithEvidence).toContain("self_confidence");
    const taskColumns = (db.prepare("PRAGMA table_info(day_tasks)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(taskColumns).toEqual(
      expect.arrayContaining([
        "knowledge_point_id",
        "activity_type",
        "completion_criteria",
        "source_type",
        "source_id",
        "verification_outcome",
        "actual_minutes",
        "completion_output",
        "planned_verification_method",
        "verification_method",
        "verification_result",
      ]),
    );
    const sessionColumns = (db.prepare("PRAGMA table_info(study_sessions)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(sessionColumns).toContain("task_id");
    expect(getAppliedMigrations(db)).toContain("0013_learning_engine");
  });

  it("adds workspace-guarded learning task links and append-oriented evidence", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);

    for (const table of ["learning_task_links", "learning_evidence"]) {
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toEqual({
        name: table,
      });
    }
    const linkColumns = (db.prepare("PRAGMA table_info(learning_task_links)").all() as Array<{ name: string }>)
      .map((row) => row.name);
    expect(linkColumns).toEqual(expect.arrayContaining([
      "task_id",
      "knowledge_point_id",
      "activity_type",
      "completion_criteria",
      "planned_verification_method",
      "source_type",
      "source_id",
      "version",
    ]));
    const evidenceColumns = (db.prepare("PRAGMA table_info(learning_evidence)").all() as Array<{ name: string }>)
      .map((row) => row.name);
    expect(evidenceColumns).toEqual(expect.arrayContaining([
      "task_id",
      "completion_cycle",
      "day",
      "activity_type",
      "actual_minutes",
      "output",
      "outcome",
      "difficulty",
      "verification_method",
      "verification_result",
      "verification_outcome",
      "confidence",
      "idempotency_key",
      "corrected_by",
      "voided_at",
    ]));
    expect((db.prepare("PRAGMA foreign_key_list(learning_evidence)").all() as Array<{ table: string }>)
      .map((row) => row.table)).toEqual(expect.arrayContaining([
      "workspaces",
      "planner_tasks",
      "knowledge_points",
      "learning_evidence",
    ]));
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'trigger' AND name LIKE 'learning_evidence_%_workspace_%'
    `).get()).toEqual({ count: 6 });
    expect(getAppliedMigrations(db)).toContain("0030_learning_evidence_foundation");

    const before = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'learning_evidence'").get();
    runMigrations(db);
    expect(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'learning_evidence'").get()).toEqual(before);
  });

  it("adds onboarding and mock-exam product state", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);

    const workspaceColumns = (db.prepare("PRAGMA table_info(workspaces)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(workspaceColumns).toContain("onboarding_completed");
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mock_exams'").get(),
    ).toMatchObject({ name: "mock_exams" });
    const mockExamColumns = (db.prepare("PRAGMA table_info(mock_exams)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(mockExamColumns).toEqual(expect.arrayContaining(["diagnosis_status", "scope_label", "difficulty"]));
    expect(getAppliedMigrations(db)).toContain("0014_learning_product");
    expect(getAppliedMigrations(db)).toContain("0018_mock_exam_diagnosis_status");
    expect(getAppliedMigrations(db)).toContain("0015_recovery_audit");
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'review_recovery_events'").get(),
    ).toMatchObject({ name: "review_recovery_events" });
  });

  it("adds task scheduling fields", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);

    const taskColumns = (db.prepare("PRAGMA table_info(day_tasks)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(taskColumns).toEqual(expect.arrayContaining(["priority", "estimated_minutes", "scheduled_start", "notes"]));
    expect(getAppliedMigrations(db)).toContain("0016_task_schedule");
  });

  it("adds revocable Agent token storage", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);

    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_tokens'").get(),
    ).toMatchObject({ name: "agent_tokens" });
    expect(getAppliedMigrations(db)).toContain("0017_agent_tokens");
  });

  it("adds workspace plugin and algorithm training storage", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);

    for (const table of ["workspace_plugins", "algorithm_problems", "algorithm_attempts"]) {
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toMatchObject({
        name: table,
      });
    }
    expect(getAppliedMigrations(db)).toContain("0026_plugin_platform_algorithms");
    const attemptColumns = (db.prepare("PRAGMA table_info(algorithm_attempts)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(attemptColumns).toEqual(
      expect.arrayContaining(["max_hint_level", "pre_confidence", "independent", "review_kind", "source_verification"]),
    );
    const sessionColumns = (db.prepare("PRAGMA table_info(study_sessions)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(sessionColumns).toEqual(expect.arrayContaining(["source_type", "source_id"]));
  });

  it("adds the asynchronous judge, encrypted code and review evidence schema", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);

    for (const table of [
      "algorithm_provider_connections",
      "algorithm_problem_skills",
      "algorithm_code_blobs",
      "algorithm_code_drafts",
      "algorithm_hint_events",
      "algorithm_submissions",
      "algorithm_reflections",
      "algorithm_reviews",
      "algorithm_error_cases",
    ]) {
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toMatchObject({
        name: table,
      });
    }
    const problemColumns = (db.prepare("PRAGMA table_info(algorithm_problems)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(problemColumns).toEqual(
      expect.arrayContaining([
        "problem_mode",
        "statement_markdown",
        "judge_problem_ref",
        "time_limit_ms",
        "memory_limit_kb",
        "hint_ladder_json",
        "license_metadata_json",
      ]),
    );
    const attemptColumns = (db.prepare("PRAGMA table_info(algorithm_attempts)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(attemptColumns).toEqual(
      expect.arrayContaining([
        "language",
        "started_at",
        "ended_at",
        "active_seconds",
        "plan_text",
        "outcome",
        "session_id",
      ]),
    );
    expect(getAppliedMigrations(db)).toContain("0028_algorithm_judge_foundation");
  });

  it("assigns legacy domain rows to the legacy workspace", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    db.prepare("INSERT INTO subjects (code, name, description) VALUES ('M1', '线性代数', '')").run();
    db.prepare("INSERT INTO daily_entries (date) VALUES ('2026-07-10')").run();
    db.prepare("INSERT INTO folders (path, name) VALUES ('讲义', '讲义')").run();

    runMigrations(db);

    for (const table of ["subjects", "daily_entries", "folders"]) {
      expect(db.prepare(`SELECT workspace_id FROM ${table} LIMIT 1`).get()).toEqual({
        workspace_id: "workspace:legacy",
      });
    }
  });

  it("allows formerly global keys in different workspaces", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);
    for (const suffix of ["1", "2"]) {
      db.prepare(
        `
        INSERT INTO users (id, email, password_hash, display_name)
        VALUES (?, ?, 'hash', ?)
      `,
      ).run(`u${suffix}`, `u${suffix}@example.com`, `用户${suffix}`);
      db.prepare(
        `
        INSERT INTO workspaces (id, owner_user_id, display_name)
        VALUES (?, ?, ?)
      `,
      ).run(`w${suffix}`, `u${suffix}`, `空间${suffix}`);
      db.prepare(
        `
        INSERT INTO subjects (workspace_id, code, name, description)
        VALUES (?, 'M1', ?, '')
      `,
      ).run(`w${suffix}`, `科目${suffix}`);
      db.prepare(
        `
        INSERT INTO daily_entries (workspace_id, date)
        VALUES (?, '2026-07-10')
      `,
      ).run(`w${suffix}`);
      db.prepare(
        `
        INSERT INTO folders (workspace_id, path, name)
        VALUES (?, '讲义', '讲义')
      `,
      ).run(`w${suffix}`);
      db.prepare(
        `
        INSERT INTO app_settings (workspace_id, key, value)
        VALUES (?, 'review_limit', '20')
      `,
      ).run(`w${suffix}`);
    }

    expect(db.prepare("SELECT COUNT(*) AS count FROM subjects WHERE code = 'M1'").get()).toEqual({ count: 2 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM daily_entries WHERE date = '2026-07-10'").get()).toEqual({
      count: 2,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM folders WHERE path = '讲义'").get()).toEqual({ count: 2 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM app_settings WHERE key = 'review_limit'").get()).toEqual({
      count: 2,
    });
  });

  it("adds user profile avatar columns and renames legacy ZGCA display names", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    // 先跑到 0008，再插入一个旧的 ZGCA 占位昵称用户，验证 0009 的改名逻辑
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.prepare(
      "INSERT INTO users (id, email, password_hash, display_name) VALUES ('u1', 'zhuorui@example.com', 'hash', 'ZGCA')",
    ).run();
    db.prepare(
      "INSERT INTO users (id, email, password_hash, display_name) VALUES ('u2', 'kept@example.com', 'hash', '自定义昵称')",
    ).run();

    runMigrations(db);

    const columns = (db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toEqual(
      expect.arrayContaining(["avatar_kind", "avatar_char", "avatar_color", "avatar_image", "avatar_mime"]),
    );
    expect(db.prepare("SELECT display_name FROM users WHERE id = 'u1'").get()).toEqual({ display_name: "zhuorui" });
    expect(db.prepare("SELECT display_name FROM users WHERE id = 'u2'").get()).toEqual({ display_name: "自定义昵称" });
  });

  it("is idempotent", () => {
    const db = new Database(":memory:");

    runMigrations(db);
    runMigrations(db);

    expect(getAppliedMigrations(db).filter((version) => version === "0001_foundation")).toHaveLength(1);
  });

  it("runs the newly added migrations only after Planner dual-write and preserves already-applied IDs", () => {
    const db = new Database(":memory:");

    runMigrations(db, { throughVersion: "0029_planner_legacy_dual_write" });
    expect(getAppliedMigrations(db)).toContain("0029_planner_legacy_dual_write");
    expect(getAppliedMigrations(db)).not.toContain("0018_mock_exam_diagnosis_status");

    runMigrations(db);
    const preserved = [
      "0018_mock_exam_diagnosis_status",
      "0019_asset_links_integrity",
      "0020_mock_exam_comparison_key",
      "0021_review_event_type",
      "0022_learning_evidence_fields",
      "0023_task_learning_evidence",
      "0024_task_retest_outcome",
      "0025_operational_observability",
      "0026_plugin_platform_algorithms",
      "0027_plugin_study_session_sources",
      "0028_algorithm_judge_foundation",
    ];
    expect(getAppliedMigrations(db)).toEqual(expect.arrayContaining(preserved));
    const before = db.prepare("SELECT version, checksum FROM schema_migrations ORDER BY version").all();

    runMigrations(db);

    expect(db.prepare("SELECT version, checksum FROM schema_migrations ORDER BY version").all()).toEqual(before);
  });

  it("rejects edited migrations that no longer match the applied checksum", () => {
    const db = new Database(":memory:");

    runMigrations(db);
    db.prepare("UPDATE schema_migrations SET checksum = ? WHERE version = ?").run("drifted", "0001_foundation");

    expect(() => runMigrations(db)).toThrow("Migration checksum mismatch for 0001_foundation");
  });

  it("locks every function migration to its source hash", () => {
    const sourcePath = path.join(process.cwd(), "src/lib/migrations.ts");
    const sourceText = readFileSync(sourcePath, "utf8");
    const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const computed: Record<string, string> = {};

    function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
      const match = object.properties.find(
        (item): item is ts.PropertyAssignment =>
          ts.isPropertyAssignment(item) && item.name.getText(sourceFile) === name,
      );
      return match?.initializer;
    }

    function visit(node: ts.Node): void {
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText(sourceFile) === "migrations" &&
        node.initializer &&
        ts.isArrayLiteralExpression(node.initializer)
      ) {
        for (const element of node.initializer.elements) {
          if (!ts.isObjectLiteralExpression(element)) continue;
          const version = property(element, "version");
          const run = property(element, "run");
          if (!version || !ts.isStringLiteral(version) || !run) continue;
          computed[version.text] = createHash("sha256").update(run.getText(sourceFile)).digest("hex");
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    expect(computed).toEqual(MIGRATION_RUN_HASHES);
  });

  it("upgrades legacy version-only checksums to locked function hashes", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);
    const version = "0016_task_schedule";
    const legacyChecksum = createHash("sha256").update(version).digest("hex");
    db.prepare("UPDATE schema_migrations SET checksum = ? WHERE version = ?").run(legacyChecksum, version);

    runMigrations(db);

    expect(db.prepare("SELECT checksum FROM schema_migrations WHERE version = ?").get(version)).toEqual({
      checksum: MIGRATION_RUN_HASHES[version],
    });
  });

  it("upgrades the trigger-bearing planner checksum and enables dual writes", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);
    db.exec(`
      CREATE TRIGGER day_tasks_planner_v2_readonly_insert
      BEFORE INSERT ON day_tasks BEGIN
        SELECT RAISE(ABORT, 'day_tasks is read-only after Planner v2 migration');
      END;
      CREATE TRIGGER day_tasks_planner_v2_readonly_update
      BEFORE UPDATE ON day_tasks BEGIN
        SELECT RAISE(ABORT, 'day_tasks is read-only after Planner v2 migration');
      END;
      CREATE TRIGGER day_tasks_planner_v2_readonly_delete
      BEFORE DELETE ON day_tasks BEGIN
        SELECT RAISE(ABORT, 'day_tasks is read-only after Planner v2 migration');
      END;
      DELETE FROM schema_migrations WHERE version = '0029_planner_legacy_dual_write';
    `);
    db.prepare("UPDATE schema_migrations SET checksum = ? WHERE version = ?").run(
      "5f51d07feddc46115f81d6cfd66970ee52a8db416bc3fc5afa1056076289b743",
      "0018_planner_core",
    );

    runMigrations(db);

    expect(db.prepare("SELECT checksum FROM schema_migrations WHERE version = ?").get("0018_planner_core")).toEqual({
      checksum: MIGRATION_RUN_HASHES["0018_planner_core"],
    });
    expect(
      db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get("0029_planner_legacy_dual_write"),
    ).toEqual({ version: "0029_planner_legacy_dual_write" });
    expect(db.prepare("INSERT INTO day_tasks (day, title) VALUES ('2026-08-07', 'changed')").run().changes).toBe(1);
  });

  it("normalizes nullable asset links and prevents duplicate relations", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);
    db.prepare(
      `
      INSERT INTO assets
        (workspace_id, day, original_name, safe_name, relative_path)
      VALUES (?, '2026-07-25', '讲义.pdf', 'lecture.pdf', 'lecture.pdf')
    `,
    ).run(LEGACY_WORKSPACE_ID);
    db.exec(`
      DROP TABLE asset_links;
      CREATE TABLE asset_links (
        workspace_id TEXT NOT NULL,
        asset_id INTEGER NOT NULL,
        subject_code TEXT,
        knowledge_point_id TEXT
      );
    `);
    const insertLegacy = db.prepare(`
      INSERT INTO asset_links (workspace_id, asset_id, subject_code, knowledge_point_id)
      VALUES (?, 1, 'M1', NULL)
    `);
    insertLegacy.run(LEGACY_WORKSPACE_ID);
    insertLegacy.run(LEGACY_WORKSPACE_ID);
    db.prepare("DELETE FROM schema_migrations WHERE version = '0019_asset_links_integrity'").run();

    runMigrations(db);

    expect(db.prepare("SELECT COUNT(*) AS count FROM asset_links").get()).toEqual({ count: 1 });
    const duplicate = db
      .prepare(
        `
      INSERT OR IGNORE INTO asset_links
        (workspace_id, asset_id, subject_code, chapter_id, knowledge_point_id)
      VALUES (?, 1, 'M1', NULL, NULL)
    `,
      )
      .run(LEGACY_WORKSPACE_ID);
    expect(duplicate.changes).toBe(0);
    expect(
      (db.prepare("PRAGMA foreign_key_list(asset_links)").all() as Array<{ table: string }>).map((row) => row.table),
    ).toEqual(expect.arrayContaining(["assets", "workspaces"]));

    db.prepare(
      `
      INSERT INTO users (id, email, password_hash, display_name)
      VALUES ('asset-link-user', 'asset-link@example.com', 'hash', '关联测试')
    `,
    ).run();
    db.prepare(
      `
      INSERT INTO workspaces (id, owner_user_id, display_name)
      VALUES ('asset-link-workspace', 'asset-link-user', '关联测试')
    `,
    ).run();
    db.pragma("foreign_keys = ON");
    expect(() =>
      db
        .prepare(
          `
      INSERT INTO asset_links
        (workspace_id, asset_id, subject_code, chapter_id, knowledge_point_id)
      VALUES ('asset-link-workspace', 1, 'M1', NULL, NULL)
    `,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
    expect(getAppliedMigrations(db)).toContain("0019_asset_links_integrity");
  });

  it("refuses to silently drop invalid legacy asset links", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);
    db.prepare(
      `
      INSERT INTO assets
        (workspace_id, day, original_name, safe_name, relative_path)
      VALUES (?, '2026-07-25', '讲义.pdf', 'lecture.pdf', 'lecture.pdf')
    `,
    ).run(LEGACY_WORKSPACE_ID);
    db.exec(`
      DROP TABLE asset_links;
      CREATE TABLE asset_links (
        workspace_id TEXT NOT NULL,
        asset_id INTEGER NOT NULL,
        subject_code TEXT,
        knowledge_point_id TEXT
      );
    `);
    db.prepare(
      `
      INSERT INTO asset_links
        (workspace_id, asset_id, subject_code, knowledge_point_id)
      VALUES (?, 1, NULL, NULL)
    `,
    ).run(LEGACY_WORKSPACE_ID);
    db.prepare("DELETE FROM schema_migrations WHERE version = '0019_asset_links_integrity'").run();

    expect(() => runMigrations(db)).toThrow("asset_links contains 1 invalid row(s); repair them before migration");
    expect(db.prepare("SELECT COUNT(*) AS count FROM asset_links").get()).toEqual({ count: 1 });
    expect(getAppliedMigrations(db)).not.toContain("0019_asset_links_integrity");
  });

  it("unifies legacy knowledge tags into knowledge points and migrates asset links", () => {
    const db = new Database(":memory:");
    // Legacy shape: app tables exist, points have no chapter_id yet, tags carry extra point names.
    db.exec(`
      CREATE TABLE subjects (code TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL);
      CREATE TABLE knowledge_points (
        id TEXT PRIMARY KEY, subject_code TEXT NOT NULL, subject_name TEXT NOT NULL, submodule TEXT NOT NULL,
        tier TEXT NOT NULL, tier_name TEXT NOT NULL, title TEXT NOT NULL, exam INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT '未学', mastery INTEGER NOT NULL DEFAULT 0, reviews INTEGER NOT NULL DEFAULT 0,
        last_review TEXT, next_review TEXT
      );
      CREATE TABLE subject_chapters (
        id TEXT PRIMARY KEY, subject_code TEXT NOT NULL, title TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(subject_code, title)
      );
      CREATE TABLE knowledge_tags (
        id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL, name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chapter_id, name)
      );
      CREATE TABLE assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, original_name TEXT NOT NULL,
        safe_name TEXT NOT NULL, relative_path TEXT NOT NULL, folder_path TEXT NOT NULL DEFAULT '未归档'
      );
      CREATE TABLE asset_knowledge_tags (asset_id INTEGER NOT NULL, knowledge_tag_id TEXT NOT NULL, PRIMARY KEY (asset_id, knowledge_tag_id));
      CREATE TABLE asset_links (asset_id INTEGER NOT NULL, subject_code TEXT, chapter_id TEXT, knowledge_point_id TEXT, PRIMARY KEY (asset_id, subject_code, chapter_id, knowledge_point_id));
      CREATE TABLE mistakes (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, knowledge_point_id TEXT, title TEXT NOT NULL);
      INSERT INTO subjects VALUES ('M1', '线性代数', '');
      INSERT INTO knowledge_points (id, subject_code, subject_name, submodule, tier, tier_name, title)
        VALUES ('M1-1-1', 'M1', '线性代数', '矩阵', 'r', '精通', '矩阵乘法');
      INSERT INTO subject_chapters (id, subject_code, title, sort_order) VALUES ('chapter:M1:matrix', 'M1', '矩阵', 1);
      INSERT INTO knowledge_tags (id, chapter_id, name) VALUES ('kt1', 'chapter:M1:matrix', '矩阵乘法');
      INSERT INTO knowledge_tags (id, chapter_id, name) VALUES ('kt2', 'chapter:M1:matrix', '用户自建知识点');
      INSERT INTO assets (day, original_name, safe_name, relative_path) VALUES ('2026-07-01', 'a.png', 'a.png', 'x');
      INSERT INTO asset_knowledge_tags VALUES (1, 'kt2');
    `);

    runMigrations(db);
    runMigrations(db); // idempotent

    // Existing point attached to its chapter by submodule name.
    expect(db.prepare("SELECT chapter_id FROM knowledge_points WHERE id = 'M1-1-1'").get()).toMatchObject({
      chapter_id: "chapter:M1:matrix",
    });
    // Tag without a matching point becomes a real knowledge point; duplicate name does not.
    const points = db.prepare("SELECT title FROM knowledge_points ORDER BY id").all() as Array<{ title: string }>;
    expect(points.map((point) => point.title).sort()).toEqual(["用户自建知识点", "矩阵乘法"]);
    // asset_knowledge_tags migrated into asset_links pointing at the promoted point.
    const link = db.prepare("SELECT subject_code, chapter_id, knowledge_point_id FROM asset_links").get() as {
      subject_code: string;
      chapter_id: string;
      knowledge_point_id: string;
    };
    expect(link.subject_code).toBe("M1");
    expect(link.chapter_id).toBe("chapter:M1:matrix");
    const promoted = db.prepare("SELECT id FROM knowledge_points WHERE title = '用户自建知识点'").get() as {
      id: string;
    };
    expect(link.knowledge_point_id).toBe(promoted.id);
  });

  it("backfills existing assets into content-addressed blob storage", () => {
    const db = new Database(":memory:");
    const uploadRoot = mkdtempSync(path.join(os.tmpdir(), "zgca-assets-backfill-"));
    dirs.push(uploadRoot);
    const oldRelativePath = "2026/07/07/original/PCA.png";
    const oldAbsolutePath = path.join(uploadRoot, oldRelativePath);
    mkdirSync(path.dirname(oldAbsolutePath), { recursive: true });
    writeFileSync(oldAbsolutePath, "legacy asset", { flush: true });
    db.exec(`
      CREATE TABLE assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day TEXT NOT NULL,
        original_name TEXT NOT NULL,
        safe_name TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL DEFAULT 0
      );
    `);
    db.prepare(
      `
      INSERT INTO assets (day, original_name, safe_name, relative_path, mime_type, size)
      VALUES ('2026-07-07', 'PCA.png', 'PCA.png', ?, 'image/png', 0)
    `,
    ).run(oldRelativePath);

    runMigrations(db, { uploadRoot });

    const sha256 = createHash("sha256").update("legacy asset").digest("hex");
    const storageKey = `${encodeURIComponent(LEGACY_WORKSPACE_ID)}/blobs/${sha256.slice(0, 2)}/${sha256}`;
    const asset = db.prepare("SELECT relative_path, size FROM assets WHERE id = 1").get() as {
      relative_path: string;
      size: number;
    };
    const blob = db
      .prepare("SELECT sha256, storage_key, ref_count FROM blobs WHERE id = ?")
      .get(`${LEGACY_WORKSPACE_ID}:${sha256}`);

    expect(asset).toEqual({ relative_path: storageKey, size: "legacy asset".length });
    expect(blob).toMatchObject({ sha256, storage_key: storageKey, ref_count: 1 });
    expect(readFileSync(path.join(uploadRoot, storageKey), "utf8")).toBe("legacy asset");
  });

  it("skips already-backfilled assets on subsequent startups", () => {
    const db = new Database(":memory:");
    const uploadRoot = mkdtempSync(path.join(os.tmpdir(), "zgca-assets-backfill-"));
    dirs.push(uploadRoot);
    const oldRelativePath = "2026/07/07/original/PCA.png";
    const oldAbsolutePath = path.join(uploadRoot, oldRelativePath);
    mkdirSync(path.dirname(oldAbsolutePath), { recursive: true });
    writeFileSync(oldAbsolutePath, "legacy asset", { flush: true });
    db.exec(`
      CREATE TABLE assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day TEXT NOT NULL,
        original_name TEXT NOT NULL,
        safe_name TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL DEFAULT 0
      );
    `);
    db.prepare(
      `
      INSERT INTO assets (day, original_name, safe_name, relative_path, mime_type, size)
      VALUES ('2026-07-07', 'PCA.png', 'PCA.png', ?, 'image/png', 0)
    `,
    ).run(oldRelativePath);

    runMigrations(db, { uploadRoot });
    const first = db.prepare("SELECT relative_path, size FROM assets WHERE id = 1").get();

    // 改写遗留源文件模拟磁盘变化：已迁移的 asset 不应再被读取/重哈希
    writeFileSync(oldAbsolutePath, "tampered content that would change the hash", { flush: true });
    runMigrations(db, { uploadRoot });

    expect(db.prepare("SELECT relative_path, size FROM assets WHERE id = 1").get()).toEqual(first);
    expect(db.prepare("SELECT COUNT(*) AS n FROM blobs").get()).toEqual({ n: 1 });
  });
});
