import { describe, expect, it } from "vitest";
import { createTestDb, createTestWorkspace } from "./testing";
import {
  listEnabledPluginIds,
  listWorkspacePlugins,
  requirePluginEnabled,
  savePluginOrder,
  setPluginEnabled,
} from "./plugins";

describe("plugin repo", () => {
  it("keeps plugins opt-in and persists enable state per workspace", () => {
    const db = createTestDb();
    const first = createTestWorkspace(db, { email: "plugins-first@example.com" });
    const second = createTestWorkspace(db, { email: "plugins-second@example.com" });

    expect(listWorkspacePlugins(db, first)).toMatchObject([
      { enabled: false, state: "available", manifest: { id: "algorithms" } },
    ]);
    setPluginEnabled(db, first, "algorithms", true);

    expect(listEnabledPluginIds(db, first)).toEqual(["algorithms"]);
    expect(listEnabledPluginIds(db, second)).toEqual([]);
    expect(requirePluginEnabled(db, first, "algorithms")).toMatchObject({ id: "algorithms" });
    expect(() => requirePluginEnabled(db, second, "algorithms")).toThrow("扩展未启用");
  });

  it("disables without deleting plugin-owned data and validates ordering", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    db.prepare(`
      INSERT INTO algorithm_problems
        (workspace_id, provider_id, external_problem_id, source_url, title)
      VALUES (?, 'bailian', '1000', 'https://bailian.openjudge.cn/practice/1000/', '测试题')
    `).run(scope.workspaceId);

    setPluginEnabled(db, scope, "algorithms", false);

    expect(listEnabledPluginIds(db, scope)).toEqual([]);
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_problems WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 1 });
    expect(() => savePluginOrder(db, scope, [])).toThrow("扩展排序不完整");
    savePluginOrder(db, scope, ["algorithms"]);
  });

  it("rejects unknown plugins", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    expect(() => setPluginEnabled(db, scope, "arbitrary-code", true)).toThrow("未知扩展");
  });
});
