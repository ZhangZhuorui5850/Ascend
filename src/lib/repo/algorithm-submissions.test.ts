import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ensureManagedAlgorithmCatalog } from "../algorithm-catalog";
import { readAlgorithmCodeBlob } from "../algorithm-code-crypto";
import type { JudgeGatewayResult } from "../judge-gateway";
import { getAlgorithmDashboard } from "./algorithms";
import { revealAlgorithmHint } from "./algorithm-hints";
import {
  applyGatewaySubmissionResult,
  attachGatewaySubmission,
  getAlgorithmDraft,
  prepareAlgorithmSubmission,
  saveAlgorithmDraft,
} from "./algorithm-submissions";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

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
  return { db, scope, problemId: problem.id };
}

function result(
  id: string,
  status: JudgeGatewayResult["status"],
): JudgeGatewayResult {
  return {
    id,
    status,
    timeMs: status === "AC" ? 8 : null,
    memoryKb: status === "AC" ? 1024 : null,
    compilerExcerpt: status === "CE" ? "main.cpp: error" : "",
    publicFeedback: status === "WA" ? [{
      caseIndex: 0,
      visibility: "public",
      status: "WA",
      stdoutExcerpt: "2",
      expectedExcerpt: "3",
    }] : [],
    failureCode: status === "JE" ? "UPSTREAM_FAILURE" : "",
    judgedAt: "2026-07-26T11:00:00.000Z",
  };
}

describe("algorithm submission repo", () => {
  it("persists encrypted cross-device drafts and redacts superseded code", () => {
    const { db, scope, problemId } = setup();
    const first = saveAlgorithmDraft(db, scope, {
      problemId,
      language: "cpp17",
      sourceCode: "int main(){return 0;}",
    }, key);
    expect(getAlgorithmDraft(db, scope, { problemId, language: "cpp17" }, [key]))
      .toMatchObject({ sourceCode: "int main(){return 0;}" });

    const second = saveAlgorithmDraft(db, scope, {
      problemId,
      language: "cpp17",
      sourceCode: "int main(){return 1;}",
    }, key);
    expect(second.codeBlobId).not.toBe(first.codeBlobId);
    expect(() => readAlgorithmCodeBlob(db, scope, first.codeBlobId, [key])).toThrow("已删除");
    expect(getAlgorithmDraft(db, scope, { problemId, language: "cpp17" }, [key]))
      .toMatchObject({ sourceCode: "int main(){return 1;}" });
  });

  it("uses an operation id to prevent duplicate formal evaluations", () => {
    const { db, scope, problemId } = setup();
    const input = {
      operationId: "submit:operation:0001",
      sessionId: "attempt:session:0001",
      problemId,
      day: "2026-07-26",
      language: "cpp17" as const,
      sourceCode: "int main(){return 0;}",
      activeSeconds: 125,
      preConfidence: 2,
      planText: "读入两个整数后直接相加并输出结果",
    };
    const first = prepareAlgorithmSubmission(db, scope, input, key, 0);
    const duplicate = prepareAlgorithmSubmission(db, scope, input, key, 0);
    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.submission.id).toBe(first.submission.id);
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_submissions WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 1 });

    expect(() => prepareAlgorithmSubmission(db, scope, {
      ...input,
      sourceCode: "int main(){return 1;}",
    }, key, 0)).toThrow("幂等键");
  });

  it("finalizes AC evidence, review and active study time exactly once", () => {
    const { db, scope, problemId } = setup();
    const prepared = prepareAlgorithmSubmission(db, scope, {
      operationId: "submit:operation:ac01",
      sessionId: "attempt:session:ac01",
      problemId,
      day: "2026-07-26",
      language: "python3",
      sourceCode: "a,b=map(int,input().split());print(a+b)",
      activeSeconds: 125,
      maxHintLevel: 1,
      preConfidence: 2,
      planText: "读入两个整数后直接相加并输出",
    }, key, 0);
    const attached = attachGatewaySubmission(db, scope, {
      submissionId: prepared.submission.id,
      gatewaySubmissionId: "submission:gateway:ac01",
      status: "QUEUED",
      gatewayLatencyMs: 42,
    });
    expect(attached.status).toBe("QUEUED");

    applyGatewaySubmissionResult(
      db,
      scope,
      attached.id,
      result("submission:gateway:ac01", "AC"),
      0,
    );
    applyGatewaySubmissionResult(
      db,
      scope,
      attached.id,
      result("submission:gateway:ac01", "AC"),
      0,
    );

    expect(getAlgorithmDashboard(db, scope, "2026-07-26").problems
      .find((problem) => problem.id === problemId)).toMatchObject({
      evidenceStatus: "independent_completed",
      nextReview: "2026-07-29",
    });
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_reviews
      WHERE workspace_id = ? AND source_attempt_id = ?
    `).get(scope.workspaceId, prepared.submission.attemptId)).toEqual({ count: 1 });
    expect(db.prepare(`
      SELECT duration_minutes, output, source_id FROM study_sessions
      WHERE workspace_id = ? AND source_type = 'plugin:algorithms'
    `).get(scope.workspaceId)).toMatchObject({
      duration_minutes: 3,
      output: "AC · 正式评测",
      source_id: String(prepared.submission.attemptId),
    });
    expect(() => readAlgorithmCodeBlob(
      db,
      scope,
      prepared.submission.codeBlobId!,
      [key],
    )).toThrow("已删除");
  });

  it("aggregates repeated failures into one error case per attempt", () => {
    const { db, scope, problemId } = setup();
    const prepared = prepareAlgorithmSubmission(db, scope, {
      operationId: "submit:operation:wa01",
      sessionId: "attempt:session:wa01",
      problemId,
      day: "2026-07-26",
      language: "cpp17",
      sourceCode: "int main(){return 0;}",
      preConfidence: 1,
      planText: "先解析输入，再检查边界并计算结果",
    }, key, 7);
    attachGatewaySubmission(db, scope, {
      submissionId: prepared.submission.id,
      gatewaySubmissionId: "submission:gateway:wa01",
      status: "RUNNING",
      gatewayLatencyMs: 5,
    });
    applyGatewaySubmissionResult(
      db,
      scope,
      prepared.submission.id,
      result("submission:gateway:wa01", "WA"),
      7,
    );
    applyGatewaySubmissionResult(
      db,
      scope,
      prepared.submission.id,
      result("submission:gateway:wa01", "WA"),
      7,
    );
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_error_cases
      WHERE workspace_id = ? AND attempt_id = ?
    `).get(scope.workspaceId, prepared.submission.attemptId)).toEqual({ count: 1 });
    expect(readAlgorithmCodeBlob(
      db,
      scope,
      prepared.submission.codeBlobId!,
      [key],
    )).toBe("int main(){return 0;}");
  });

  it("does not count an AC after an authoritative L3 reveal as independent", () => {
    const { db, scope, problemId } = setup();
    const sessionId = "attempt:session:hint3";
    revealAlgorithmHint(db, scope, { problemId, sessionId, level: 3 });
    const prepared = prepareAlgorithmSubmission(db, scope, {
      operationId: "submit:operation:hint3",
      sessionId,
      problemId,
      day: "2026-07-26",
      language: "python3",
      sourceCode: "a,b=map(int,input().split());print(a+b)",
      maxHintLevel: 0,
      preConfidence: 3,
      planText: "读取输入后使用常数时间求和并输出",
    }, key, 0);
    attachGatewaySubmission(db, scope, {
      submissionId: prepared.submission.id,
      gatewaySubmissionId: "submission:gateway:hint3",
      status: "QUEUED",
      gatewayLatencyMs: 1,
    });
    applyGatewaySubmissionResult(
      db,
      scope,
      prepared.submission.id,
      result("submission:gateway:hint3", "AC"),
      0,
    );
    expect(db.prepare(`
      SELECT max_hint_level, independent FROM algorithm_attempts
      WHERE workspace_id = ? AND id = ?
    `).get(scope.workspaceId, prepared.submission.attemptId)).toEqual({
      max_hint_level: 3,
      independent: 0,
    });
    expect(getAlgorithmDashboard(db, scope, "2026-07-26").problems
      .find((problem) => problem.id === problemId)?.evidenceStatus).toBe("guided_completed");
  });

  it("keeps a public sample run separate from formal learning evidence", () => {
    const { db, scope, problemId } = setup();
    const prepared = prepareAlgorithmSubmission(db, scope, {
      operationId: "submit:operation:sample",
      sessionId: "attempt:session:sample",
      problemId,
      day: "2026-07-26",
      language: "python3",
      sourceCode: "print(sum(map(int,input().split())))",
      submissionKind: "sample",
      activeSeconds: 30,
    }, key, 0);
    attachGatewaySubmission(db, scope, {
      submissionId: prepared.submission.id,
      gatewaySubmissionId: "submission:gateway:sample",
      status: "QUEUED",
      gatewayLatencyMs: 1,
    });
    const completed = applyGatewaySubmissionResult(
      db,
      scope,
      prepared.submission.id,
      result("submission:gateway:sample", "AC"),
      0,
    );
    expect(completed.submissionKind).toBe("sample");
    expect(db.prepare(`
      SELECT outcome, ended_at FROM algorithm_attempts
      WHERE workspace_id = ? AND id = ?
    `).get(scope.workspaceId, prepared.submission.attemptId)).toEqual({
      outcome: "in_progress",
      ended_at: null,
    });
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM study_sessions WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 0 });
    expect(getAlgorithmDashboard(db, scope, "2026-07-26").problems
      .find((problem) => problem.id === problemId)?.attempts).toHaveLength(0);
  });

  it("does not turn an infrastructure failure into learning evidence or an error case", () => {
    const { db, scope, problemId } = setup();
    const prepared = prepareAlgorithmSubmission(db, scope, {
      operationId: "submit:operation:judge-error",
      sessionId: "attempt:session:judge-error",
      problemId,
      day: "2026-07-26",
      language: "cpp17",
      sourceCode: "int main(){return 0;}",
      preConfidence: 2,
      planText: "读入输入并按题意完成线性扫描",
      activeSeconds: 61,
    }, key, 0);
    applyGatewaySubmissionResult(
      db,
      scope,
      prepared.submission.id,
      result("", "JE"),
      0,
    );
    const dashboardProblem = getAlgorithmDashboard(db, scope, "2026-07-26").problems
      .find((problem) => problem.id === problemId);
    expect(dashboardProblem).toMatchObject({
      evidenceStatus: "unseen",
      nextReview: null,
    });
    expect(dashboardProblem?.attempts).toHaveLength(0);
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_error_cases WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 0 });
  });

  it("closes one matching review and replaces a same-session schedule after a new verdict", () => {
    const { db, scope, problemId } = setup();
    const first = prepareAlgorithmSubmission(db, scope, {
      operationId: "submit:operation:review-source",
      sessionId: "attempt:session:review-source",
      problemId,
      day: "2026-07-20",
      language: "python3",
      sourceCode: "print(sum(map(int,input().split())))",
      preConfidence: 2,
      planText: "读取两个整数并在常数时间内求和",
      reviewKind: "initial",
    }, key, 7);
    applyGatewaySubmissionResult(db, scope, first.submission.id, result("", "AC"), 7);

    const retest = prepareAlgorithmSubmission(db, scope, {
      operationId: "submit:operation:review-target",
      sessionId: "attempt:session:review-target",
      problemId,
      day: "2026-07-23",
      language: "python3",
      sourceCode: "print(sum(map(int,input().split())))",
      preConfidence: 3,
      planText: "独立回忆求和模型并验证整数边界",
      reviewKind: "original_retest",
    }, key, 7);
    applyGatewaySubmissionResult(db, scope, retest.submission.id, result("", "AC"), 7);

    expect(db.prepare(`
      SELECT completed_at IS NOT NULL AS completed, attempt_id
      FROM algorithm_reviews
      WHERE workspace_id = ? AND source_attempt_id = ?
    `).get(scope.workspaceId, first.submission.attemptId)).toEqual({
      completed: 1,
      attempt_id: retest.submission.attemptId,
    });
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_reviews
      WHERE workspace_id = ? AND source_attempt_id = ? AND completed_at IS NULL
    `).get(scope.workspaceId, retest.submission.attemptId)).toEqual({ count: 1 });
  });

  it("requires and persists a mastered related source for managed transfer evidence", () => {
    const { db, scope, problemId: sourceProblemId } = setup();
    const target = db.prepare(`
      SELECT id FROM algorithm_problems
      WHERE workspace_id = ? AND judge_problem_ref = 'ascend:foundation:range-sum:v1'
    `).get(scope.workspaceId) as { id: number };
    db.prepare(`
      INSERT INTO algorithm_problem_skills
        (workspace_id, problem_id, skill_key, role, confidence)
      VALUES (?, ?, 'integer-arithmetic', 'secondary', 1)
    `).run(scope.workspaceId, target.id);

    const first = prepareAlgorithmSubmission(db, scope, {
      operationId: "submit:transfer:source:first",
      sessionId: "session:transfer:source:first",
      problemId: sourceProblemId,
      day: "2026-07-20",
      language: "python3",
      sourceCode: "a,b=map(int,input().split());print(a+b)",
      preConfidence: 2,
      planText: "读取两个整数，使用加法后输出",
    }, key, 0);
    applyGatewaySubmissionResult(db, scope, first.submission.id, result("", "AC"), 0);
    const retest = prepareAlgorithmSubmission(db, scope, {
      operationId: "submit:transfer:source:retest",
      sessionId: "session:transfer:source:retest",
      problemId: sourceProblemId,
      day: "2026-07-23",
      language: "python3",
      sourceCode: "a,b=map(int,input().split());print(a+b)",
      preConfidence: 3,
      planText: "不看旧代码，重新读取并求和输出",
      reviewKind: "original_retest",
    }, key, 0);
    applyGatewaySubmissionResult(db, scope, retest.submission.id, result("", "AC"), 0);

    const transfer = prepareAlgorithmSubmission(db, scope, {
      operationId: "submit:transfer:target",
      sessionId: "session:transfer:target",
      problemId: target.id,
      day: "2026-07-26",
      language: "python3",
      sourceCode: "l,r=map(int,input().split());print((l+r)*(r-l+1)//2)",
      preConfidence: 2,
      planText: "将整数求和迁移为等差数列公式并检查边界",
      reviewKind: "unseen_variant",
      transferSourceProblemId: sourceProblemId,
    }, key, 0);
    applyGatewaySubmissionResult(db, scope, transfer.submission.id, result("", "AC"), 0);

    expect(db.prepare(`
      SELECT transfer_source_problem_id, outcome
      FROM algorithm_attempts WHERE workspace_id = ? AND id = ?
    `).get(scope.workspaceId, transfer.submission.attemptId)).toEqual({
      transfer_source_problem_id: sourceProblemId,
      outcome: "AC",
    });
    expect(getAlgorithmDashboard(db, scope, "2026-07-26").problems
      .find((problem) => problem.id === target.id)).toMatchObject({
      evidenceStatus: "transfer_verified",
      nextReview: "2026-08-25",
    });
    expect(db.prepare(`
      SELECT completed_at IS NOT NULL AS completed, attempt_id
      FROM algorithm_reviews
      WHERE workspace_id = ? AND problem_id = ? AND review_kind = 'unseen_variant'
    `).get(scope.workspaceId, sourceProblemId)).toEqual({
      completed: 1,
      attempt_id: transfer.submission.attemptId,
    });
  });
});
