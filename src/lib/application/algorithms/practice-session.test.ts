import { describe, expect, it } from "vitest";
import { setPluginEnabled } from "../../repo/plugins";
import { getAlgorithmTrainingRelations, scheduleAlgorithmProblems } from "../../repo/algorithm-training";
import { todayKey } from "../../dates";
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

  it("atomically records an AC on the actual day and completes its linked plan", () => {
    const { db, scope, problemId } = setup();
    const plan = scheduleAlgorithmProblems(db, scope, { problemIds: [problemId], day: "2026-08-20" })[0];
    startPracticeSession(db, scope, { sessionId: "session:vscode:linked-ac", problemId, day: plan.day, language: "cpp17", clientKind: "vscode" });
    const attempt = finishPracticeSession(db, scope, { sessionId: "session:vscode:linked-ac", verdict: "AC", attemptDayMode: "now", plan: { taskId: plan.taskId, expectedVersion: plan.version } });
    expect(attempt.day).toBe(todayKey());
    expect(getAlgorithmTrainingRelations(db, scope).plans.find((item) => item.taskId === plan.taskId)?.status).toBe("completed");
  });

  it("replays a linked AC operation after its plan is completed", () => {
    const { db, scope, problemId } = setup();
    const plan = scheduleAlgorithmProblems(db, scope, { problemIds: [problemId], day: "2026-08-20" })[0];
    startPracticeSession(db, scope, { sessionId: "session:vscode:linked-replay", problemId, day: plan.day, language: "cpp17", clientKind: "vscode" });
    const input = { sessionId: "session:vscode:linked-replay", verdict: "AC", plan: { taskId: plan.taskId, expectedVersion: plan.version } };
    const first = finishPracticeSession(db, scope, input);
    const replay = finishPracticeSession(db, scope, input);
    expect(replay.id).toBe(first.id);
    expect(db.prepare("SELECT COUNT(*) AS count FROM study_sessions WHERE workspace_id = ?").get(scope.workspaceId)).toEqual({ count: 1 });
  });

  it("keeps a linked plan open for a failed result", () => {
    const { db, scope, problemId } = setup();
    const plan = scheduleAlgorithmProblems(db, scope, { problemIds: [problemId], day: "2026-08-20" })[0];
    startPracticeSession(db, scope, { sessionId: "session:vscode:linked-wa", problemId, day: plan.day, language: "cpp17", clientKind: "vscode" });
    finishPracticeSession(db, scope, { sessionId: "session:vscode:linked-wa", verdict: "WA", plan: { taskId: plan.taskId, expectedVersion: plan.version } });
    expect(getAlgorithmTrainingRelations(db, scope).plans.find((item) => item.taskId === plan.taskId)?.status).toBe("open");
  });

  it("rolls back evidence when the linked plan version conflicts", () => {
    const { db, scope, problemId } = setup();
    const plan = scheduleAlgorithmProblems(db, scope, { problemIds: [problemId], day: "2026-08-20" })[0];
    startPracticeSession(db, scope, { sessionId: "session:vscode:conflict", problemId, day: plan.day, language: "cpp17", clientKind: "vscode" });
    expect(() => finishPracticeSession(db, scope, { sessionId: "session:vscode:conflict", verdict: "AC", plan: { taskId: plan.taskId, expectedVersion: plan.version + 1 } })).toThrow("计划已经更新");
    expect(getPracticeSession(db, scope, "session:vscode:conflict").outcome).toBe("in_progress");
    expect(db.prepare("SELECT COUNT(*) AS count FROM study_sessions WHERE workspace_id = ?").get(scope.workspaceId)).toEqual({ count: 0 });
  });
});
