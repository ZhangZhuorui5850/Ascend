import { describe, expect, it } from "vitest";
import { updateDayEntryAutosave } from "./days";
import { createTestDb, createTestWorkspace } from "./testing";

describe("day entry autosave", () => {
  it("rejects an older request that arrives after a newer pagehide save", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);

    expect(updateDayEntryAutosave(db, scope, "2026-08-10", {
      clientId: "tab-1",
      revision: 102,
      fields: { summary: "最新总结", tomorrow: "最新计划" },
    })).toEqual({ applied: true, revision: 102 });
    expect(updateDayEntryAutosave(db, scope, "2026-08-10", {
      clientId: "tab-1",
      revision: 101,
      fields: { summary: "过期总结", tomorrow: "过期计划" },
    })).toEqual({ applied: false, revision: 102 });

    expect(db.prepare(`
      SELECT summary, tomorrow FROM daily_entries WHERE workspace_id = ? AND date = ?
    `).get(scope.workspaceId, "2026-08-10")).toEqual({
      summary: "最新总结",
      tomorrow: "最新计划",
    });
  });

  it("treats a repeated beacon revision as an idempotent success", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const input = {
      clientId: "tab-2",
      revision: 201,
      fields: { summary: "只保存一次" },
    };

    expect(updateDayEntryAutosave(db, scope, "2026-08-10", input).applied).toBe(true);
    expect(updateDayEntryAutosave(db, scope, "2026-08-10", input)).toEqual({
      applied: false,
      revision: 201,
    });
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM drafts
      WHERE workspace_id = ? AND scope_type = 'day-entry-autosave'
    `).get(scope.workspaceId)).toEqual({ count: 1 });
  });
});
