import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { getAppliedMigrations, runMigrations } from "./migrations";

describe("runMigrations", () => {
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
});
