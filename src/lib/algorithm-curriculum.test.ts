import { describe, expect, it } from "vitest";
import type { AlgorithmProblem } from "./repo/algorithms";
import { getAlgorithmCurriculumChapter, getAlgorithmCurriculumChapters } from "./algorithm-curriculum";

describe("algorithm curriculum", () => {
  it.each([
    ["W1 字符串题", problem({ phaseKey: "W1", tags: ["字符串", "排序"] }), "cpp-stl"],
    ["W2 枚举题", problem({ phaseKey: "W2", tags: ["枚举", "状态翻转", "贪心"] }), "simulation-enumeration"],
    ["W2 二分题", problem({ phaseKey: "W2", tags: ["二分答案", "贪心"] }), "sequence-search"],
    ["W3 递归题", problem({ phaseKey: "W3", tags: ["递归", "表达式求值"] }), "recursion-divide"],
    ["W3 搜索题", problem({ phaseKey: "W3", tags: ["BFS", "最短步数"] }), "graph-search"],
    ["W4 动态规划题", problem({ phaseKey: "W4", tags: ["动态规划", "LIS"] }), "dynamic-programming"],
    ["W4 贪心题", problem({ phaseKey: "W4", tags: ["贪心", "双指针"] }), "greedy"],
    ["W5 图论题", problem({ phaseKey: "W5", tags: ["图论", "Dijkstra"] }), "graph-shortest-path"],
    [
      "历年机试图论题",
      problem({
        externalProblemId: "exercises/official/2025-summer/03",
        phaseKey: "Extra",
        tags: ["图论", "Dijkstra"],
      }),
      "graph-shortest-path",
    ],
  ])("places %s in its primary chapter", (_label, input, expected) => {
    expect(getAlgorithmCurriculumChapter(input).key).toBe(expected);
  });

  it("uses the training phase as a stable fallback", () => {
    expect(getAlgorithmCurriculumChapter(problem({ phaseKey: "W3", tags: [] })).key).toBe("recursion-divide");
  });

  it("adds past papers to the comprehensive practice chapter", () => {
    const chapters = getAlgorithmCurriculumChapters(
      problem({
        externalProblemId: "exercises/official/2025-summer/03",
        phaseKey: "Extra",
        tags: ["图论", "Dijkstra"],
      }),
    );
    expect(chapters.map((chapter) => chapter.key)).toEqual(["graph-shortest-path", "exam-practice"]);
  });
});

function problem(overrides: Partial<AlgorithmProblem>): AlgorithmProblem {
  return {
    id: 1,
    providerId: "bailian",
    providerLabel: "百练",
    externalProblemId: "2742",
    sourceUrl: "https://bailian.openjudge.cn/practice/2742/",
    title: "测试题",
    difficultyBand: "foundation",
    tags: [],
    notes: "",
    evidenceStatus: "unseen",
    nextReview: null,
    reviewEnabled: true,
    reviewStep: 0,
    problemMode: "external",
    contentMode: "external_link",
    evaluationMode: "manual",
    materialStatus: "todo",
    priorityBand: "",
    phaseKey: "W1",
    collectionIds: [],
    statementMarkdown: "",
    inputSpecification: "",
    outputSpecification: "",
    examples: [],
    judgeProblemRef: "",
    timeLimitMs: 2000,
    memoryLimitKb: 262144,
    supportedLanguages: ["cpp17"],
    starterCode: {},
    referenceCode: {},
    attempts: [],
    ...overrides,
  };
}
