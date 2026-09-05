import { describe, expect, it } from "vitest";
import {
  createAlgorithmProblem,
  deleteAlgorithmProblems,
  getAlgorithmDashboard,
  getAlgorithmDashboardSummary,
  getAlgorithmProblemDetail,
  recordAlgorithmAttempt,
  updateAlgorithmProblemDetails,
} from "./algorithms";
import { getAlgorithmTrainingRelations, scheduleAlgorithmProblems } from "./algorithm-training";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

describe("algorithm training repo", () => {
  it("deletes selected problems and their active plans within the current workspace", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const other = createTestWorkspace(db, { email: "algorithm-delete-other@example.com" });
    setPluginEnabled(db, scope, "algorithms", true);
    setPluginEnabled(db, other, "algorithms", true);
    const removed = createAlgorithmProblem(db, scope, { sourceUrl: "https://example.com/remove", title: "待删除", tags: ["动态规划"] });
    const kept = createAlgorithmProblem(db, scope, { sourceUrl: "https://example.com/keep", title: "保留", tags: ["动态规划"] });
    const foreign = createAlgorithmProblem(db, other, { sourceUrl: "https://example.com/foreign", title: "其他空间" });
    scheduleAlgorithmProblems(db, scope, { problemIds: [removed.id, kept.id], day: "2026-09-02" });
    const removedPlan = getAlgorithmTrainingRelations(db, scope).plans.find((plan) => plan.problemId === removed.id)!;
    recordAlgorithmAttempt(db, scope, {
      problemId: removed.id,
      day: "2026-09-01",
      verdict: "AC",
    });
    recordAlgorithmAttempt(db, scope, {
      problemId: kept.id,
      day: "2026-09-02",
      verdict: "AC",
      reviewKind: "unseen_variant",
      transferSourceProblemId: removed.id,
    });

    expect(() => deleteAlgorithmProblems(db, scope, { problemIds: [foreign.id] })).toThrow("删除范围包含无效题目");
    deleteAlgorithmProblems(db, scope, { problemIds: [removed.id] });

    expect(getAlgorithmDashboard(db, scope, "2026-09-02").problems.map((problem) => problem.id)).toEqual([kept.id]);
    expect(getAlgorithmDashboard(db, other, "2026-09-02").problems.map((problem) => problem.id)).toEqual([foreign.id]);
    expect(getAlgorithmTrainingRelations(db, scope).plans.map((plan) => plan.problemId)).toEqual([kept.id]);
    expect(db.prepare("SELECT deleted_at IS NOT NULL AS deleted FROM planner_tasks WHERE id = ?").get(removedPlan.taskId)).toEqual({ deleted: 1 });
    expect(db.prepare("SELECT transfer_source_problem_id AS source FROM algorithm_attempts WHERE workspace_id = ? AND problem_id = ?").get(scope.workspaceId, kept.id)).toEqual({ source: null });
  });

  it("updates VS Code quick-edit metadata within the active workspace", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const problem = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/9991/",
      title: "待编辑题目",
    });
    expect(
      updateAlgorithmProblemDetails(db, scope, problem.id, {
        title: "区间动态规划",
        difficultyBand: "challenge",
        tags: ["动态规划", "区间 DP"],
        notes: "先枚举区间长度",
        materialStatus: "doing",
        priorityBand: "P1",
        phaseKey: "W3",
        nextReview: "2026-08-28",
      }),
    ).toMatchObject({
      title: "区间动态规划",
      difficultyBand: "challenge",
      tags: ["动态规划", "区间 DP"],
      notes: "先枚举区间长度",
      materialStatus: "doing",
      priorityBand: "P1",
      phaseKey: "W3",
      nextReview: "2026-08-28",
    });
    expect(() => updateAlgorithmProblemDetails(db, scope, problem.id, { materialStatus: "invalid" })).toThrow(
      "训练状态无效",
    );
  });

  it("requires the plugin and keeps problem data workspace-scoped", () => {
    const db = createTestDb();
    const first = createTestWorkspace(db, { email: "algorithm-first@example.com" });
    const second = createTestWorkspace(db, { email: "algorithm-second@example.com" });
    setPluginEnabled(db, first, "algorithms", true);

    const problem = createAlgorithmProblem(db, first, {
      sourceUrl: "https://bailian.openjudge.cn/practice/1000/",
      title: "A+B Problem",
      externalProblemId: "1000",
      difficultyBand: "foundation",
      tags: ["模拟", "基础", "模拟"],
    });

    expect(problem).toMatchObject({
      providerId: "bailian",
      providerLabel: "百炼",
      tags: ["模拟", "基础"],
      evidenceStatus: "unseen",
    });
    expect(getAlgorithmDashboard(db, first, "2026-07-26").metrics.problemCount).toBe(1);
    expect(() => getAlgorithmDashboard(db, second, "2026-07-26")).toThrow("扩展未启用");
    setPluginEnabled(db, second, "algorithms", true);
    expect(getAlgorithmDashboard(db, second, "2026-07-26").problems).toEqual([]);
  });

  it("keeps list reads compact and loads rich problem detail on demand", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const problem = createAlgorithmProblem(db, scope, {
      title: "懒加载题目",
      statementMarkdown: "# 一段很长的题面",
      examples: [{ input: "1", output: "2" }],
    });
    recordAlgorithmAttempt(db, scope, { problemId: problem.id, day: "2026-09-03", verdict: "WA" });

    const summary = getAlgorithmDashboardSummary(db, scope, "2026-09-04");
    expect(summary.metrics.attemptedCount).toBe(1);
    expect(summary.problems[0]).toMatchObject({ statementMarkdown: "", examples: [], attempts: [] });
    expect(getAlgorithmProblemDetail(db, scope, problem.id)).toMatchObject({
      statementMarkdown: "# 一段很长的题面",
      examples: [{ input: "1", output: "2" }],
      attempts: [expect.objectContaining({ verdict: "WA" })],
    });
  });

  it("distinguishes guided, independent, delayed and transfer evidence", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const problem = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/1001/",
      title: "动态规划基础",
      tags: ["动态规划"],
    });

    const guided = recordAlgorithmAttempt(db, scope, {
      problemId: problem.id,
      day: "2026-07-20",
      verdict: "AC",
      durationMinutes: 45,
      maxHintLevel: 3,
      preConfidence: 1,
      reflection: "状态定义不清",
    });
    expect(guided.independent).toBe(false);
    expect(
      db
        .prepare(
          `
      SELECT COUNT(*) AS count FROM study_sessions WHERE workspace_id = ?
    `,
        )
        .get(scope.workspaceId),
    ).toEqual({ count: 0 });
    expect(getAlgorithmDashboard(db, scope, "2026-07-20").problems[0]).toMatchObject({
      evidenceStatus: "guided_completed",
      nextReview: "2026-07-21",
    });

    recordAlgorithmAttempt(db, scope, {
      problemId: problem.id,
      day: "2026-07-21",
      verdict: "AC",
      maxHintLevel: 0,
      reviewKind: "original_retest",
    });
    expect(getAlgorithmDashboard(db, scope, "2026-07-21").problems[0]).toMatchObject({
      evidenceStatus: "delayed_stable",
      nextReview: "2026-07-31",
    });

    const variant = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/1002/",
      title: "动态规划未见变式",
      tags: ["动态规划"],
    });
    recordAlgorithmAttempt(db, scope, {
      problemId: variant.id,
      day: "2026-07-31",
      verdict: "AC",
      maxHintLevel: 1,
      reviewKind: "unseen_variant",
      transferSourceProblemId: problem.id,
    });
    expect(
      getAlgorithmDashboard(db, scope, "2026-07-31").problems.find((item) => item.id === variant.id),
    ).toMatchObject({
      evidenceStatus: "transfer_verified",
      nextReview: "2026-08-30",
    });
    expect(
      getAlgorithmDashboard(db, scope, "2026-07-31").problems.find((item) => item.id === problem.id)?.nextReview,
    ).toBeNull();
    expect(
      db
        .prepare(
          `
      SELECT outcome, ended_at IS NOT NULL AS ended, transfer_source_problem_id
      FROM algorithm_attempts WHERE workspace_id = ? AND id = ?
    `,
        )
        .get(scope.workspaceId, guided.id),
    ).toEqual({
      outcome: "AC",
      ended: 1,
      transfer_source_problem_id: null,
    });
  });

  it("rejects self-asserted transfer evidence without a valid mastered related source", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const source = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/source",
      title: "已学来源",
      tags: ["双指针"],
    });
    const target = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/target",
      title: "陌生变式",
      tags: ["双指针"],
    });
    expect(() =>
      recordAlgorithmAttempt(db, scope, {
        problemId: target.id,
        day: "2026-07-26",
        verdict: "AC",
        reviewKind: "unseen_variant",
      }),
    ).toThrow("必须选择");
    expect(() =>
      recordAlgorithmAttempt(db, scope, {
        problemId: target.id,
        day: "2026-07-26",
        verdict: "AC",
        reviewKind: "unseen_variant",
        transferSourceProblemId: source.id,
      }),
    ).toThrow("先前独立 AC");

    recordAlgorithmAttempt(db, scope, {
      problemId: source.id,
      day: "2026-07-20",
      verdict: "AC",
    });
    const unrelated = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/unrelated",
      title: "不相关变式",
      tags: ["图论"],
    });
    expect(() =>
      recordAlgorithmAttempt(db, scope, {
        problemId: unrelated.id,
        day: "2026-07-26",
        verdict: "AC",
        reviewKind: "unseen_variant",
        transferSourceProblemId: source.id,
      }),
    ).toThrow("共同技能标签");
  });

  it("treats external results as user reported and validates unsafe input", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    expect(() =>
      createAlgorithmProblem(db, scope, {
        sourceUrl: "javascript:alert(1)",
        title: "不安全链接",
      }),
    ).toThrow("HTTP 或 HTTPS");

    const problem = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/problems/two-sum",
      title: "Two Sum",
    });
    const attempt = recordAlgorithmAttempt(db, scope, {
      problemId: problem.id,
      day: "2026-07-26",
      verdict: "WA",
      maxHintLevel: 0,
      preConfidence: 3,
      errorCategory: "边界遗漏",
    });
    expect(attempt).toMatchObject({
      independent: false,
      sourceVerification: "user_reported",
    });
    expect(() =>
      recordAlgorithmAttempt(db, scope, {
        problemId: problem.id,
        day: "2026-07-26",
        verdict: "AC",
        maxHintLevel: 5,
      }),
    ).toThrow("提示级别");
  });

  it("makes caller-keyed manual attempts replay-safe without owning study projections", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const problem = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/problems/idempotent",
      title: "Idempotent Attempt",
    });
    const input = {
      operationId: "algorithm:manual:repo:0001",
      problemId: problem.id,
      day: "2026-07-26",
      verdict: "WA",
      durationMinutes: 20,
      errorCategory: "边界遗漏",
    };

    const first = recordAlgorithmAttempt(db, scope, input);
    const replay = recordAlgorithmAttempt(db, scope, input);

    expect(replay).toEqual(first);
    expect(
      db
        .prepare(
          `
      SELECT COUNT(*) AS count FROM algorithm_attempts WHERE workspace_id = ?
    `,
        )
        .get(scope.workspaceId),
    ).toEqual({ count: 1 });
    expect(
      db
        .prepare(
          `
      SELECT COUNT(*) AS count FROM study_sessions WHERE workspace_id = ?
    `,
        )
        .get(scope.workspaceId),
    ).toEqual({ count: 0 });
    expect(() =>
      recordAlgorithmAttempt(db, scope, {
        ...input,
        verdict: "AC",
      }),
    ).toThrow("同一算法训练幂等键不能用于不同请求");
  });

  it("assigns a stable external id when a root URL has no path identifier", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);

    const first = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/",
      title: "根路径题目一",
    });
    const second = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.org/",
      title: "根路径题目二",
    });

    expect(first.externalProblemId).toMatch(/^url:[a-f0-9]{24}$/);
    expect(second.externalProblemId).toMatch(/^url:[a-f0-9]{24}$/);
    expect(second.externalProblemId).not.toBe(first.externalProblemId);
  });
});
