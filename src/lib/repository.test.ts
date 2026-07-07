import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runMigrations } from "./migrations";
import { getActiveDayDraftsWithDb, markCommittedDayDraftsWithDb } from "./repository";

describe("day draft commits", () => {
  it("commits only drafts matching the submitted day snapshot", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    db.prepare(`
      INSERT INTO drafts (id, scope_type, scope_id, field, content, version, status)
      VALUES
        ('day:2026-07-07:plan', 'day', '2026-07-07', 'plan', 'submitted plan', 1, 'active'),
        ('day:2026-07-07:diary', 'day', '2026-07-07', 'diary', 'newer remote diary', 2, 'active')
    `).run();

    markCommittedDayDraftsWithDb(db, "2026-07-07", {
      plan: "submitted plan",
      diary: "older submitted diary",
    });

    expect(db.prepare("SELECT status FROM drafts WHERE id = 'day:2026-07-07:plan'").get()).toEqual({
      status: "committed",
    });
    expect(db.prepare("SELECT status FROM drafts WHERE id = 'day:2026-07-07:diary'").get()).toEqual({
      status: "active",
    });
  });

  it("returns active draft content with versions for reload-safe autosave", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    db.prepare(`
      INSERT INTO drafts (id, scope_type, scope_id, field, content, version, status)
      VALUES
        ('day:2026-07-07:summary', 'day', '2026-07-07', 'summary', 'reopened draft', 4, 'active'),
        ('day:2026-07-07:blockers', 'day', '2026-07-07', 'blockers', 'old blocker', 2, 'committed')
    `).run();

    expect(getActiveDayDraftsWithDb(db, "2026-07-07")).toEqual({
      values: { summary: "reopened draft" },
      versions: { summary: 4 },
    });
  });
});
