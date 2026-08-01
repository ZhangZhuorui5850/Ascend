import { describe, expect, it } from "vitest";
import { createAlgorithmProblem, recordAlgorithmAttempt } from "../repo/algorithms";
import { setPluginEnabled } from "../repo/plugins";
import { createTestDb, createTestWorkspace } from "../repo/testing";
import { getPluginAnalyticsSections, getPluginTodayRecommendations } from "./runtime";

describe("plugin runtime", () => {
  it("only contributes actionable recommendations from enabled plugins", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const problem = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/problems/dp",
      title: "动态规划复测",
    });
    recordAlgorithmAttempt(db, scope, {
      problemId: problem.id,
      day: "2026-07-20",
      verdict: "AC",
      maxHintLevel: 0,
    });

    expect(getPluginTodayRecommendations(db, scope, "2026-07-22")).toEqual([]);
    expect(getPluginTodayRecommendations(db, scope, "2026-07-23")).toEqual([
      expect.objectContaining({
        pluginId: "algorithms",
        href: "/practice/algorithms",
        count: 1,
      }),
    ]);

    setPluginEnabled(db, scope, "algorithms", false);
    expect(getPluginTodayRecommendations(db, scope, "2026-07-23")).toEqual([]);
  });

  it("reports unique-problem learning evidence with explicit sample sizes", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const source = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/problems/transfer-source",
      title: "迁移来源",
      tags: ["双指针"],
    });
    recordAlgorithmAttempt(db, scope, {
      problemId: source.id,
      day: "2026-07-20",
      verdict: "AC",
      maxHintLevel: 0,
    });
    const variant = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/problems/transfer-target",
      title: "迁移验证",
      tags: ["双指针"],
    });
    recordAlgorithmAttempt(db, scope, {
      problemId: variant.id,
      day: "2026-07-23",
      verdict: "AC",
      maxHintLevel: 0,
      reviewKind: "unseen_variant",
      transferSourceProblemId: source.id,
    });

    const [section] = getPluginAnalyticsSections(db, scope, "2026-07-23");
    expect(section).toMatchObject({
      pluginId: "algorithms",
      sampleLabel: "有效题目 2 · Provider 验证 0",
    });
    expect(section.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "首次独立通过率", value: "100%", samples: 2 }),
      expect.objectContaining({ label: "未见变式迁移", value: "100%", samples: 1 }),
    ]));

    setPluginEnabled(db, scope, "algorithms", false);
    expect(getPluginAnalyticsSections(db, scope, "2026-07-23")).toEqual([]);
  });
});
