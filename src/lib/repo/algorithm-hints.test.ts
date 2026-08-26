import { describe, expect, it } from "vitest";
import { getSessionMaxHintLevel, revealAlgorithmHint } from "./algorithm-hints";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace, seedTestManagedAlgorithmProblems } from "./testing";

describe("algorithm hint evidence", () => {
  it("returns one requested level and records the maximum without exposing the ladder", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const { sourceProblemId } = seedTestManagedAlgorithmProblems(db, scope);
    const sessionId = "hint:session:0001";

    expect(revealAlgorithmHint(db, scope, {
      problemId: sourceProblemId,
      sessionId,
      level: 1,
    })).toMatchObject({ level: 1, source: "static" });
    expect(revealAlgorithmHint(db, scope, {
      problemId: sourceProblemId,
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
