import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAppliedMigrations, runMigrations } from "./migrations";

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
    const storageKey = `blobs/${sha256.slice(0, 2)}/${sha256}`;
    const asset = db.prepare("SELECT relative_path, size FROM assets WHERE id = 1").get() as {
      relative_path: string;
      size: number;
    };
    const blob = db.prepare("SELECT sha256, storage_key, ref_count FROM blobs WHERE id = ?").get(sha256);

    expect(asset).toEqual({ relative_path: storageKey, size: "legacy asset".length });
    expect(blob).toMatchObject({ sha256, storage_key: storageKey, ref_count: 1 });
    expect(readFileSync(path.join(uploadRoot, storageKey), "utf8")).toBe("legacy asset");
  });
});
