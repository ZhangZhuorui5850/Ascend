import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ensureManagedAlgorithmCatalog } from "../../algorithm-catalog";
import type { JudgeGatewayResult } from "../../judge-gateway";
import {
  applyGatewaySubmissionResult,
  prepareAlgorithmSubmission,
} from "../../repo/algorithm-submissions";
import { setPluginEnabled } from "../../repo/plugins";
import { createTestDb, createTestWorkspace } from "../../repo/testing";
import { finalizeAlgorithmSubmission } from "./finalize-algorithm-submission";

const key = { key: randomBytes(32), version: 1 };

function setup() {
  const db = createTestDb();
  const scope = createTestWorkspace(db);
  setPluginEnabled(db, scope, "algorithms", true);
  ensureManagedAlgorithmCatalog(db, scope);
  const problem = db.prepare(`
    SELECT id FROM algorithm_problems
    WHERE workspace_id = ? AND judge_problem_ref = 'ascend:foundation:sum-two:v1'
  `).get(scope.workspaceId) as { id: number };
  const prepared = prepareAlgorithmSubmission(db, scope, {
    operationId: "application:algorithm:submission",
    sessionId: "application:algorithm:session",
    problemId: problem.id,
    day: "2026-08-10",
    language: "python3",
    sourceCode: "a,b=map(int,input().split());print(a+b)",
    activeSeconds: 125,
    preConfidence: 2,
    planText: "读取两个整数后在常数时间内求和并输出",
  }, key, 7);
  return { db, scope, prepared, problemId: problem.id };
}

function acceptedResult(): JudgeGatewayResult {
  return {
    id: "submission:application:algorithm",
    status: "AC",
    timeMs: 5,
    memoryKb: 900,
    compilerExcerpt: "",
    publicFeedback: [],
    failureCode: "",
    judgedAt: "2026-08-10T10:00:00.000Z",
  };
}

describe("finalizeAlgorithmSubmission", () => {
  it("records one canonical evidence row and legacy projection on replay", () => {
    const { db, scope, prepared } = setup();

    finalizeAlgorithmSubmission(db, scope, {
      submissionId: prepared.submission.id,
      result: acceptedResult(),
      retentionDays: 7,
    });
    finalizeAlgorithmSubmission(db, scope, {
      submissionId: prepared.submission.id,
      result: acceptedResult(),
      retentionDays: 7,
    });

    expect(db.prepare(`
      SELECT activity_type, actual_minutes, output, outcome,
             verification_method, verification_result, verification_outcome,
             source_type, source_id, idempotency_key
      FROM learning_evidence WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({
      activity_type: "practice",
      actual_minutes: 3,
      output: "AC · 正式评测",
      outcome: "AC",
      verification_method: "judge_gateway",
      verification_result: "AC",
      verification_outcome: "passed",
      source_type: "plugin:algorithms",
      source_id: `attempt:${prepared.submission.attemptId}`,
      idempotency_key: `plugin:algorithms:attempt:${prepared.submission.attemptId}:formal-evaluation`,
    });
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM learning_evidence WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 1 });
    expect(db.prepare(`
      SELECT duration_minutes, output, source_type
      FROM study_sessions WHERE workspace_id = ?
    `).get(scope.workspaceId)).toMatchObject({
      duration_minutes: 3,
      output: "AC · 正式评测",
      source_type: "learning_evidence",
    });
    expect(() => finalizeAlgorithmSubmission(db, scope, {
      submissionId: prepared.submission.id,
      result: { ...acceptedResult(), status: "RUNNING" },
      retentionDays: 7,
    })).toThrow("不可变终态");
    expect(db.prepare(`
      SELECT status FROM algorithm_submissions WHERE workspace_id = ? AND id = ?
    `).get(scope.workspaceId, prepared.submission.id)).toEqual({ status: "AC" });
  });

  it("rolls back the provider result and attempt when canonical evidence fails", () => {
    const { db, scope, prepared } = setup();
    db.exec(`
      CREATE TRIGGER reject_algorithm_evidence
      BEFORE INSERT ON learning_evidence
      WHEN NEW.source_type = 'plugin:algorithms'
      BEGIN
        SELECT RAISE(ABORT, 'forced evidence failure');
      END;
    `);

    expect(() => finalizeAlgorithmSubmission(db, scope, {
      submissionId: prepared.submission.id,
      result: acceptedResult(),
      retentionDays: 7,
    })).toThrow("forced evidence failure");

    expect(db.prepare(`
      SELECT status, judged_at FROM algorithm_submissions
      WHERE workspace_id = ? AND id = ?
    `).get(scope.workspaceId, prepared.submission.id)).toEqual({
      status: "CREATING",
      judged_at: null,
    });
    expect(db.prepare(`
      SELECT outcome, ended_at FROM algorithm_attempts
      WHERE workspace_id = ? AND id = ?
    `).get(scope.workspaceId, prepared.submission.attemptId)).toEqual({
      outcome: "in_progress",
      ended_at: null,
    });
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_reviews WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 0 });
  });

  it("repairs a terminal repo-only result without the repo writing study data", () => {
    const { db, scope, prepared } = setup();
    applyGatewaySubmissionResult(
      db,
      scope,
      prepared.submission.id,
      acceptedResult(),
      7,
    );
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM learning_evidence WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 0 });
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM study_sessions WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 0 });

    finalizeAlgorithmSubmission(db, scope, {
      submissionId: prepared.submission.id,
      result: acceptedResult(),
      retentionDays: 7,
    });
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM learning_evidence WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 1 });
  });

  it("rejects a new operation on a terminal attempt and accepts a new session", () => {
    const { db, scope, prepared, problemId } = setup();
    const failed = { ...acceptedResult(), status: "WA" as const };
    finalizeAlgorithmSubmission(db, scope, {
      submissionId: prepared.submission.id,
      result: failed,
      retentionDays: 7,
    });

    expect(() => prepareAlgorithmSubmission(db, scope, {
      operationId: "application:algorithm:submission:reuse",
      sessionId: "application:algorithm:session",
      problemId,
      day: "2026-08-10",
      language: "python3",
      sourceCode: "a,b=map(int,input().split());print(a+b)",
      activeSeconds: 180,
      preConfidence: 3,
      planText: "修正边界后重新读取两个整数并输出求和结果",
    }, key, 7)).toThrow("训练会话已结束");

    const next = prepareAlgorithmSubmission(db, scope, {
      operationId: "application:algorithm:submission:new",
      sessionId: "application:algorithm:session:new",
      problemId,
      day: "2026-08-10",
      language: "python3",
      sourceCode: "a,b=map(int,input().split());print(a+b)",
      activeSeconds: 180,
      preConfidence: 3,
      planText: "新训练会话独立读取输入并检查边界后输出",
      reviewKind: "original_retest",
    }, key, 7);
    finalizeAlgorithmSubmission(db, scope, {
      submissionId: next.submission.id,
      result: acceptedResult(),
      retentionDays: 7,
    });

    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM learning_evidence WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 2 });
    expect(db.prepare(`
      SELECT COUNT(DISTINCT source_id) AS count
      FROM learning_evidence WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 2 });
  });

  it("preserves active time from infrastructure terminals as unverified evidence", () => {
    const { db, scope, prepared } = setup();
    finalizeAlgorithmSubmission(db, scope, {
      submissionId: prepared.submission.id,
      result: {
        ...acceptedResult(),
        status: "JE",
        failureCode: "UPSTREAM_FAILURE",
      },
      retentionDays: 7,
    });

    expect(db.prepare(`
      SELECT actual_minutes, outcome, verification_outcome, source_id
      FROM learning_evidence WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({
      actual_minutes: 3,
      outcome: "JE",
      verification_outcome: "unverified",
      source_id: `attempt:${prepared.submission.attemptId}`,
    });
    expect(db.prepare(`
      SELECT duration_minutes, output FROM study_sessions WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({
      duration_minutes: 3,
      output: "JE · 正式评测",
    });
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_error_cases WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 0 });
  });
});
