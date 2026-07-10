import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { initializeDatabase, seedKnowledgeMapIfEmpty } from "./db";
import { runMigrations } from "./migrations";
import { LEGACY_WORKSPACE_ID } from "./repo/workspaces";

describe("database initialization", () => {
  it("seeds a fresh knowledge map into the legacy workspace", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);

    seedKnowledgeMapIfEmpty(db);

    expect(db.prepare("SELECT COUNT(*) AS count FROM subjects WHERE workspace_id = ?").get(LEGACY_WORKSPACE_ID)).toMatchObject({
      count: 7,
    });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM knowledge_points WHERE workspace_id = ?").get(LEGACY_WORKSPACE_ID),
    ).toMatchObject({ count: expect.any(Number) });
  });
});
