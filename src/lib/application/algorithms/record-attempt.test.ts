import { describe, expect, it } from "vitest";
import { appendLearningEvidence } from "../../repo/learning-evidence";
import { createAlgorithmProblem } from "../../repo/algorithms";
import { setPluginEnabled } from "../../repo/plugins";
import { createTestDb, createTestWorkspace } from "../../repo/testing";
import { recordAlgorithmAttemptCommand } from "./record-attempt";

describe("recordAlgorithmAttemptCommand", () => {
  it("atomically records one replay-safe attempt, evidence row, and legacy projection", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const problem = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/problems/manual-command",
      title: "Manual Command",
    });
    const input = {
      operationId: "algorithm:manual:command:0001",
      problemId: problem.id,
      day: "2026-08-10",
      verdict: "AC",
      durationMinutes: 35,
      maxHintLevel: 1,
      reviewKind: "initial",
    };

    const first = recordAlgorithmAttemptCommand(db, scope, input);
    const replay = recordAlgorithmAttemptCommand(db, scope, input);

    expect(replay).toEqual(first);
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_attempts WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 1 });
    expect(db.prepare(`
      SELECT activity_type, actual_minutes, output, outcome, verification_method,
             verification_result, verification_outcome, source_type, source_id,
             idempotency_key
      FROM learning_evidence WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({
      activity_type: "practice",
      actual_minutes: 35,
      output: "AC · 最高提示 L1 · initial",
      outcome: "AC",
      verification_method: "external_user_report",
      verification_result: "AC",
      verification_outcome: "passed",
      source_type: "plugin:algorithms",
      source_id: String(first.id),
      idempotency_key: `algorithm-attempt:${input.operationId}`,
    });
    expect(db.prepare(`
      SELECT title, duration_minutes, output, source_type
      FROM study_sessions WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({
      title: "算法训练：Manual Command",
      duration_minutes: 35,
      output: "AC · 最高提示 L1 · initial",
      source_type: "learning_evidence",
    });
  });

  it("rolls the attempt and review state back when canonical evidence rejects the request", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const problem = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/problems/atomic-command",
      title: "Atomic Command",
    });
    const operationId = "algorithm:manual:command:collision";
    appendLearningEvidence(db, scope, {
      idempotencyKey: `algorithm-attempt:${operationId}`,
      completionCycle: 1,
      day: "2026-08-10",
      activityType: "study",
      outcome: "preexisting",
    });

    expect(() => recordAlgorithmAttemptCommand(db, scope, {
      operationId,
      problemId: problem.id,
      day: "2026-08-10",
      verdict: "WA",
      durationMinutes: 15,
    })).toThrow("学习证据幂等键已用于不同请求");

    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_attempts WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 0 });
    expect(db.prepare(`
      SELECT evidence_status, next_review FROM algorithm_problems
      WHERE workspace_id = ? AND id = ?
    `).get(scope.workspaceId, problem.id)).toEqual({
      evidence_status: "unseen",
      next_review: null,
    });
  });
});
