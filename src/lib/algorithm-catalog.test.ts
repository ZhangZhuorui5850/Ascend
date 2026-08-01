import { describe, expect, it } from "vitest";
import {
  buildJudgeProblemDefinitions,
  validateFixtureDefinitions,
} from "../../scripts/algorithm-problem-fixtures.mjs";
import judgeDefinitions from "../../services/judge-gateway/problems.json";
import {
  ensureManagedAlgorithmCatalog,
  MANAGED_ALGORITHM_CATALOG,
} from "./algorithm-catalog";
import { setPluginEnabled } from "./repo/plugins";
import { createTestDb, createTestWorkspace } from "./repo/testing";

describe("managed algorithm catalog", () => {
  it("ships a synchronized 30-problem CC0 pilot with bounded public and hidden cases", () => {
    const generated = validateFixtureDefinitions(buildJudgeProblemDefinitions());
    expect(judgeDefinitions).toEqual(generated);
    expect(MANAGED_ALGORITHM_CATALOG).toHaveLength(30);
    expect(new Set(MANAGED_ALGORITHM_CATALOG.map((problem) => problem.ref)).size).toBe(30);
    expect(new Set(judgeDefinitions.map((problem) => problem.ref))).toEqual(
      new Set(MANAGED_ALGORITHM_CATALOG.map((problem) => problem.ref)),
    );
    expect(MANAGED_ALGORITHM_CATALOG.filter(
      (problem) => problem.difficultyBand === "foundation",
    )).toHaveLength(18);
    expect(MANAGED_ALGORITHM_CATALOG.filter(
      (problem) => problem.difficultyBand === "standard",
    )).toHaveLength(12);
    expect(MANAGED_ALGORITHM_CATALOG.every((problem) => (
      problem.hints.length === 4
      && problem.hints.every((hint, index) => hint.level === index + 1)
      && problem.supportedLanguages.join(",") === "cpp17,python3"
      && problem.skills.length >= 3
      && Boolean(problem.transferGroup)
    ))).toBe(true);
    expect(judgeDefinitions.every((problem) => (
      problem.license.id === "CC0-1.0"
      && problem.license.redistribution === true
      && problem.cases.length >= 6
      && problem.cases.filter((testCase) => testCase.visibility === "public").length >= 2
      && problem.cases.some((testCase) => testCase.visibility === "hidden")
    ))).toBe(true);

    for (const problem of MANAGED_ALGORITHM_CATALOG) {
      const judgeProblem = judgeDefinitions.find((item) => item.ref === problem.ref);
      const publicCases = judgeProblem?.cases
        .filter((testCase) => testCase.visibility === "public")
        .map(({ input, output }) => ({ input, output }));
      expect(publicCases, problem.ref).toEqual(
        problem.examples.map(({ input, output }) => ({ input, output })),
      );
    }

    const groupCounts = new Map<string, number>();
    for (const problem of MANAGED_ALGORITHM_CATALOG) {
      const group = problem.transferGroup || "";
      groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    }
    expect([...groupCounts.values()].filter((count) => count >= 2).length).toBeGreaterThanOrEqual(8);
  });

  it("installs only original licensed metadata and remains idempotent", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    ensureManagedAlgorithmCatalog(db, scope);
    ensureManagedAlgorithmCatalog(db, scope);

    const problems = db.prepare(`
      SELECT problem_mode, provider_id, judge_problem_ref, statement_markdown,
             license_metadata_json
      FROM algorithm_problems
      WHERE workspace_id = ?
      ORDER BY id
    `).all(scope.workspaceId) as Array<Record<string, string>>;
    expect(problems).toHaveLength(MANAGED_ALGORITHM_CATALOG.length);
    expect(problems.every((problem) => (
      problem.problem_mode === "managed"
      && problem.provider_id === "ascend"
      && problem.judge_problem_ref.startsWith("ascend:")
      && problem.statement_markdown.length > 0
      && JSON.parse(problem.license_metadata_json).license === "CC0-1.0"
    ))).toBe(true);
    const skillCount = db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_problem_skills WHERE workspace_id = ?
    `).get(scope.workspaceId) as { count: number };
    expect(skillCount.count).toBeGreaterThan(0);
  });

  it("requires the plugin to be enabled", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    expect(() => ensureManagedAlgorithmCatalog(db, scope)).toThrow("扩展未启用");
  });
});
