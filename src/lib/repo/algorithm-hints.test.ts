import { describe, expect, it } from "vitest";
import { ensureManagedAlgorithmCatalog } from "../algorithm-catalog";
import { getSessionMaxHintLevel, revealAlgorithmHint } from "./algorithm-hints";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

describe("algorithm hint evidence", () => {
  it("returns one requested level and records the maximum without exposing the ladder", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    ensureManagedAlgorithmCatalog(db, scope);
    const problem = db.prepare(`
      SELECT id FROM algorithm_problems
      WHERE workspace_id = ? AND judge_problem_ref = 'ascend:foundation:sum-two:v1'
    `).get(scope.workspaceId) as { id: number };
    const sessionId = "hint:session:0001";

    expect(revealAlgorithmHint(db, scope, {
      problemId: problem.id,
      sessionId,
      level: 1,
    })).toMatchObject({ level: 1, source: "static" });
    expect(revealAlgorithmHint(db, scope, {
      problemId: problem.id,
      sessionId,
      level: 3,
    })).toMatchObject({ level: 3, source: "static" });
    expect(getSessionMaxHintLevel(db, scope, sessionId)).toBe(3);
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_hint_events
      WHERE workspace_id = ? AND session_id = ?
    `).get(scope.workspaceId, sessionId)).toEqual({ count: 2 });
  });
});
