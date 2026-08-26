import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { applyGatewaySubmissionResult, prepareAlgorithmSubmission } from "./algorithm-submissions";
import {
  getAlgorithmLearningState,
  resolveAlgorithmErrorCase,
  saveAlgorithmReflection,
} from "./algorithm-learning";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace, seedTestManagedAlgorithmProblems } from "./testing";

const key = { key: randomBytes(32), version: 1 };

function setup() {
  const db = createTestDb();
  const scope = createTestWorkspace(db);
  setPluginEnabled(db, scope, "algorithms", true);
  const { sourceProblemId } = seedTestManagedAlgorithmProblems(db, scope);
  const prepared = prepareAlgorithmSubmission(db, scope, {
    operationId: "learning:operation:0001",
    sessionId: "learning:session:0001",
    problemId: sourceProblemId,
    day: "2026-07-26",
    language: "python3",
    sourceCode: "print(0)",
    preConfidence: 2,
    planText: "读取两个整数后进行求和并输出结果",
  }, key, 0);
  applyGatewaySubmissionResult(db, scope, prepared.submission.id, {
    id: "",
    status: "WA",
    timeMs: 3,
    memoryKb: 900,
    compilerExcerpt: "",
    publicFeedback: [],
    failureCode: "",
    judgedAt: "2026-07-26T12:00:00Z",
  }, 0);
  return { db, scope, attemptId: prepared.submission.attemptId };
}

describe("algorithm learning follow-up", () => {
  it("saves structured reflection and confirms one linked core mistake idempotently", () => {
    const { db, scope, attemptId } = setup();
    const saved = saveAlgorithmReflection(db, scope, {
      attemptId,
      errorCategory: "边界条件",
      correctionRule: "提交前手算最小值、最大值和空区间",
      complexityTime: "O(1)",
      complexitySpace: "O(1)",
      takeaway: "先列出输入边界，再开始实现。",
    });
    expect(saved.reflection).toMatchObject({
      errorCategory: "边界条件",
      complexityTime: "O(1)",
    });
    expect(saved.errorCase).toMatchObject({
      status: "candidate",
      correctionRule: "提交前手算最小值、最大值和空区间",
    });

    const confirmed = resolveAlgorithmErrorCase(db, scope, {
      attemptId,
      decision: "confirm",
    });
    expect(confirmed.errorCase).toMatchObject({ status: "confirmed" });
    expect(confirmed.errorCase?.mistakeId).toBeTypeOf("number");
    const duplicate = resolveAlgorithmErrorCase(db, scope, {
      attemptId,
      decision: "confirm",
    });
    expect(duplicate.errorCase?.mistakeId).toBe(confirmed.errorCase?.mistakeId);
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM mistakes WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 1 });
  });

  it("can dismiss a candidate without creating a core mistake", () => {
    const { db, scope, attemptId } = setup();
    const state = resolveAlgorithmErrorCase(db, scope, {
      attemptId,
      decision: "dismiss",
    });
    expect(state.errorCase).toMatchObject({ status: "dismissed", mistakeId: null });
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM mistakes WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 0 });
  });

  it("does not expose another workspace attempt", () => {
    const { db, scope, attemptId } = setup();
    const other = createTestWorkspace(db, { userId: "algorithm-other" });
    setPluginEnabled(db, other, "algorithms", true);
    expect(() => getAlgorithmLearningState(db, other, attemptId)).toThrow("不存在");
    expect(getAlgorithmLearningState(db, scope, attemptId).errorCase).not.toBeNull();
  });
});
