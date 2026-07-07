import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { getAppliedMigrations, runMigrations } from "./migrations";

describe("runMigrations", () => {
  it("creates migration bookkeeping and core sync tables", () => {
    const db = new Database(":memory:");

    runMigrations(db);

    expect(getAppliedMigrations(db)).toContain("0001_foundation");
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'devices'").get(),
    ).toMatchObject({ name: "devices" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entity_changes'").get(),
    ).toMatchObject({ name: "entity_changes" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drafts'").get(),
    ).toMatchObject({ name: "drafts" });
  });

  it("is idempotent", () => {
    const db = new Database(":memory:");

    runMigrations(db);
    runMigrations(db);

    expect(getAppliedMigrations(db).filter((version) => version === "0001_foundation")).toHaveLength(1);
  });
});
