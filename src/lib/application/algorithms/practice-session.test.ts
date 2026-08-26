import { describe, expect, it } from "vitest";
import { setPluginEnabled } from "../../repo/plugins";
import {
  createTestDb,
  createTestWorkspace,
  seedTestManagedAlgorithmProblems,
} from "../../repo/testing";
import {
  abandonPracticeSession,
  finishPracticeSession,
  getPracticeSession,
  recordPracticeActivity,
  startPracticeSession,
} from "./practice-session";

function setup() {
  const db = createTestDb();
  const scope = createTestWorkspace(db);
  setPluginEnabled(db, scope, "algorithms", true);
  const { sourceProblemId } = seedTestManagedAlgorithmProblems(db, scope);
  return { db, scope, problemId: sourceProblemId };
}

describe("cross-client algorithm practice session", () => {
  it("starts, updates and finishes one canonical manual session", () => {
    const { db, scope, problemId } = setup();
    const started = startPracticeSession(db, scope, {
      sessionId: "session:vscode:0001",
      problemId,
      day: "2026-08-25",
      language: "cpp17",
      clientKind: "vscode",
      deviceId: "device-1",
      reviewKind: "initial",
      preConfidence: 2,
    });
    expect(started).toMatchObject({ outcome: "in_progress", clientKind: "vscode", activeSeconds: 0 });

    recordPracticeActivity(db, scope, {
      sessionId: started.sessionId,
      activeSeconds: 125,
      planText: "读取两个整数后求和并输出",
    });
    const attempt = finishPracticeSession(db, scope, {
      sessionId: started.sessionId,
      verdict: "AC",
      activeSeconds: 140,
      maxHintLevel: 1,
      reflection: "检查输入输出边界",
    });

    expect(attempt).toMatchObject({ verdict: "AC", durationMinutes: 3, independent: true });
    expect(getPracticeSession(db, scope, started.sessionId)).toMatchObject({ outcome: "AC" });
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM study_sessions
      WHERE workspace_id = ? AND source_type = 'learning_evidence'
    `).get(scope.workspaceId)).toEqual({ count: 1 });
  });

  it("replays session start and finish idempotently", () => {
    const { db, scope, problemId } = setup();
    const input = {
      sessionId: "session:vscode:replay",
      problemId,
      day: "2026-08-25",
      language: "cpp17" as const,
      clientKind: "vscode" as const,
      reviewKind: "initial" as const,
    };
    startPracticeSession(db, scope, input);
    startPracticeSession(db, scope, input);
    const first = finishPracticeSession(db, scope, { sessionId: input.sessionId, verdict: "WA" });
    const replay = finishPracticeSession(db, scope, { sessionId: input.sessionId, verdict: "WA" });
    expect(replay.id).toBe(first.id);
  });

  it("abandons a replaced local attempt without creating learning evidence", () => {
    const { db, scope, problemId } = setup();
    const started = startPracticeSession(db, scope, {
      sessionId: "session:vscode:abandon",
      problemId,
      day: "2026-08-25",
      language: "cpp17",
      clientKind: "vscode",
    });
    const abandoned = abandonPracticeSession(db, scope, started.sessionId);
    expect(abandoned).toMatchObject({ outcome: "abandoned" });
    expect(abandoned.endedAt).toBeTruthy();
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM study_sessions
      WHERE workspace_id = ? AND source_type = 'learning_evidence'
    `).get(scope.workspaceId)).toEqual({ count: 0 });
  });
});
