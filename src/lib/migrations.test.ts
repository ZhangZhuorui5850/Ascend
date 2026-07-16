import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "./db";
import { getAppliedMigrations, runMigrations } from "./migrations";
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
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'devices'").get(),
    ).toMatchObject({ name: "devices" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entity_changes'").get(),
    ).toMatchObject({ name: "entity_changes" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drafts'").get(),
    ).toMatchObject({ name: "drafts" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get(),
    ).toMatchObject({ name: "users" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get(),
    ).toMatchObject({ name: "sessions" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'blobs'").get(),
    ).toMatchObject({ name: "blobs" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'upload_sessions'").get(),
    ).toMatchObject({ name: "upload_sessions" });
  });

  it("adds identity and workspace schema", () => {
    const db = new Database(":memory:");

    runMigrations(db);

    const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    expect(userColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "role",
        "status",
        "must_change_password",
        "last_login_at",
        "password_changed_at",
      ]),
    );
    for (const table of ["workspaces", "invitations", "audit_logs", "login_attempts"]) {
      expect(
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
      ).toMatchObject({ name: table });
    }
  });

  it("adds learning-engine state and idempotency fields", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);

    const pointColumns = (db.prepare("PRAGMA table_info(knowledge_points)").all() as Array<{ name: string }>).map((row) => row.name);
    expect(pointColumns).toEqual(expect.arrayContaining([
      "prompt",
      "answer",
      "interval_step",
      "lapse_count",
      "last_score",
    ]));
    const mistakeColumns = (db.prepare("PRAGMA table_info(mistakes)").all() as Array<{ name: string }>).map((row) => row.name);
    expect(mistakeColumns).toEqual(expect.arrayContaining(["pass_count", "last_pass_day", "cause_category"]));
    const reviewColumns = (db.prepare("PRAGMA table_info(review_events)").all() as Array<{ name: string }>).map((row) => row.name);
    expect(reviewColumns).toContain("operation_id");
    expect(getAppliedMigrations(db)).toContain("0013_learning_engine");
  });

  it("adds onboarding and mock-exam product state", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);

    const workspaceColumns = (db.prepare("PRAGMA table_info(workspaces)").all() as Array<{ name: string }>).map((row) => row.name);
    expect(workspaceColumns).toContain("onboarding_completed");
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mock_exams'").get()).toMatchObject({ name: "mock_exams" });
    expect(getAppliedMigrations(db)).toContain("0014_learning_product");
    expect(getAppliedMigrations(db)).toContain("0015_recovery_audit");
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'review_recovery_events'").get()).toMatchObject({ name: "review_recovery_events" });
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
      db.prepare(`
        INSERT INTO users (id, email, password_hash, display_name)
        VALUES (?, ?, 'hash', ?)
      `).run(`u${suffix}`, `u${suffix}@example.com`, `用户${suffix}`);
      db.prepare(`
        INSERT INTO workspaces (id, owner_user_id, display_name)
        VALUES (?, ?, ?)
      `).run(`w${suffix}`, `u${suffix}`, `空间${suffix}`);
      db.prepare(`
        INSERT INTO subjects (workspace_id, code, name, description)
        VALUES (?, 'M1', ?, '')
      `).run(`w${suffix}`, `科目${suffix}`);
      db.prepare(`
        INSERT INTO daily_entries (workspace_id, date)
        VALUES (?, '2026-07-10')
      `).run(`w${suffix}`);
      db.prepare(`
        INSERT INTO folders (workspace_id, path, name)
        VALUES (?, '讲义', '讲义')
      `).run(`w${suffix}`);
      db.prepare(`
        INSERT INTO app_settings (workspace_id, key, value)
        VALUES (?, 'review_limit', '20')
      `).run(`w${suffix}`);
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
    db.prepare("INSERT INTO users (id, email, password_hash, display_name) VALUES ('u1', 'zhuorui@example.com', 'hash', 'ZGCA')").run();
    db.prepare("INSERT INTO users (id, email, password_hash, display_name) VALUES ('u2', 'kept@example.com', 'hash', '自定义昵称')").run();

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

  it("rejects edited migrations that no longer match the applied checksum", () => {
    const db = new Database(":memory:");

    runMigrations(db);
    db.prepare("UPDATE schema_migrations SET checksum = ? WHERE version = ?").run("drifted", "0001_foundation");

    expect(() => runMigrations(db)).toThrow("Migration checksum mismatch for 0001_foundation");
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
    const promoted = db.prepare("SELECT id FROM knowledge_points WHERE title = '用户自建知识点'").get() as { id: string };
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
    db.prepare(`
      INSERT INTO assets (day, original_name, safe_name, relative_path, mime_type, size)
      VALUES ('2026-07-07', 'PCA.png', 'PCA.png', ?, 'image/png', 0)
    `).run(oldRelativePath);

    runMigrations(db, { uploadRoot });

    const sha256 = createHash("sha256").update("legacy asset").digest("hex");
    const storageKey = `${encodeURIComponent(LEGACY_WORKSPACE_ID)}/blobs/${sha256.slice(0, 2)}/${sha256}`;
    const asset = db.prepare("SELECT relative_path, size FROM assets WHERE id = 1").get() as {
      relative_path: string;
      size: number;
    };
    const blob = db.prepare("SELECT sha256, storage_key, ref_count FROM blobs WHERE id = ?").get(
      `${LEGACY_WORKSPACE_ID}:${sha256}`,
    );

    expect(asset).toEqual({ relative_path: storageKey, size: "legacy asset".length });
    expect(blob).toMatchObject({ sha256, storage_key: storageKey, ref_count: 1 });
    expect(readFileSync(path.join(uploadRoot, storageKey), "utf8")).toBe("legacy asset");
  });
});
