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
