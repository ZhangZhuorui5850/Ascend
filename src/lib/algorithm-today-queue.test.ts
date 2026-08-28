import { describe, expect, it } from "vitest";
import { buildAlgorithmTodayQueue } from "./algorithm-today-queue";
import type { AlgorithmProblem } from "./repo/algorithms";

function problem(id: number, overrides: Partial<AlgorithmProblem> = {}): AlgorithmProblem {
  return {
    id,
    providerId: "ascend",
    providerLabel: "Ascend",
    externalProblemId: String(id),
    sourceUrl: "",
    title: `P${id}`,
    difficultyBand: "foundation",
    tags: [],
    notes: "",
    evidenceStatus: "unseen",
    nextReview: null,
    reviewEnabled: true,
    reviewStep: 0,
    problemMode: "managed",
    contentMode: "managed",
    evaluationMode: "judge",
    materialStatus: "todo",
    priorityBand: "",
    phaseKey: "W1",
    collectionIds: [],
    statementMarkdown: "",
    inputSpecification: "",
    outputSpecification: "",
    examples: [],
    judgeProblemRef: "",
    timeLimitMs: 1000,
    memoryLimitKb: 65536,
    supportedLanguages: ["cpp17"],
    starterCode: {},
    referenceCode: {},
    attempts: [],
    ...overrides,
  };
}

describe("algorithm today queue", () => {
  it("ranks due review, active work and priority new problems with reasons", () => {
    const queue = buildAlgorithmTodayQueue([
      problem(4, { phaseKey: "W2" }),
      problem(3, { priorityBand: "P1" }),
      problem(2, { materialStatus: "doing" }),
      problem(1, { nextReview: "2026-08-24" }),
    ], "2026-08-25");
    expect(queue.map((item) => item.problem.id)).toEqual([1, 2, 3, 4]);
    expect(queue.map((item) => item.reason)).toEqual([
      "due_review",
      "in_progress",
      "priority_new",
      "catalog_progression",
    ]);
  });
});
