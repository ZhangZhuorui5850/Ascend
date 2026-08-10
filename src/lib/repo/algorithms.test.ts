import { describe, expect, it } from "vitest";
import { createAlgorithmProblem, getAlgorithmDashboard, recordAlgorithmAttempt } from "./algorithms";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

describe("algorithm training repo", () => {
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
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM study_sessions WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 0 });
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
    expect(getAlgorithmDashboard(db, scope, "2026-07-31").problems
      .find((item) => item.id === variant.id)).toMatchObject({
      evidenceStatus: "transfer_verified",
      nextReview: "2026-08-30",
    });
    expect(getAlgorithmDashboard(db, scope, "2026-07-31").problems
      .find((item) => item.id === problem.id)?.nextReview).toBeNull();
    expect(db.prepare(`
      SELECT outcome, ended_at IS NOT NULL AS ended, transfer_source_problem_id
      FROM algorithm_attempts WHERE workspace_id = ? AND id = ?
    `).get(scope.workspaceId, guided.id)).toEqual({
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
    expect(() => recordAlgorithmAttempt(db, scope, {
      problemId: target.id,
      day: "2026-07-26",
      verdict: "AC",
      reviewKind: "unseen_variant",
    })).toThrow("必须选择");
    expect(() => recordAlgorithmAttempt(db, scope, {
      problemId: target.id,
      day: "2026-07-26",
      verdict: "AC",
      reviewKind: "unseen_variant",
      transferSourceProblemId: source.id,
    })).toThrow("先前独立 AC");

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
    expect(() => recordAlgorithmAttempt(db, scope, {
      problemId: unrelated.id,
      day: "2026-07-26",
      verdict: "AC",
      reviewKind: "unseen_variant",
      transferSourceProblemId: source.id,
    })).toThrow("共同技能标签");
  });

  it("treats external results as user reported and validates unsafe input", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    expect(() => createAlgorithmProblem(db, scope, {
      sourceUrl: "javascript:alert(1)",
      title: "不安全链接",
    })).toThrow("HTTP 或 HTTPS");

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
    expect(() => recordAlgorithmAttempt(db, scope, {
      problemId: problem.id,
      day: "2026-07-26",
      verdict: "AC",
      maxHintLevel: 5,
    })).toThrow("提示级别");
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
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_attempts WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 1 });
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM study_sessions WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 0 });
    expect(() => recordAlgorithmAttempt(db, scope, {
      ...input,
      verdict: "AC",
    })).toThrow("同一算法训练幂等键不能用于不同请求");
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
