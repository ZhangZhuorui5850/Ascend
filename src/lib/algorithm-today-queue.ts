import type { AlgorithmProblem } from "./repo/algorithms";

export type AlgorithmRecommendationReason =
  | "due_review"
  | "in_progress"
  | "material_review"
  | "priority_new"
  | "continue_learning"
  | "catalog_progression";

export type RankedAlgorithmProblem = {
  problem: AlgorithmProblem;
  reason: AlgorithmRecommendationReason;
  reasonLabel: string;
  score: number;
};

export function buildAlgorithmTodayQueue(
  problems: AlgorithmProblem[],
  today: string,
  limit = 5,
): RankedAlgorithmProblem[] {
  const capacity = Math.min(50, Math.max(1, Math.round(limit)));
  return problems
    .map((problem) => rankAlgorithmProblem(problem, today))
    .sort((left, right) =>
      left.score - right.score
      || phaseOrder(left.problem.phaseKey) - phaseOrder(right.problem.phaseKey)
      || left.problem.id - right.problem.id,
    )
    .slice(0, capacity);
}

export function rankAlgorithmProblem(problem: AlgorithmProblem, today: string): RankedAlgorithmProblem {
  if (problem.nextReview && problem.nextReview <= today) {
    return ranked(problem, "due_review", "到期复测", 0);
  }
  if (problem.materialStatus === "doing") {
    return ranked(problem, "in_progress", "继续正在训练的题目", 100);
  }
  if (problem.materialStatus === "review") {
    return ranked(problem, "material_review", "完成素材复查", 200);
  }
  if (problem.priorityBand === "P1" && problem.evidenceStatus === "unseen") {
    return ranked(problem, "priority_new", "开始 P1 新题", 300);
  }
  if (problem.evidenceStatus === "attempted" || problem.evidenceStatus === "guided_completed") {
    return ranked(problem, "continue_learning", "继续建立独立证据", 400);
  }
  return ranked(problem, "catalog_progression", "按训练阶段推进", 1000);
}

function ranked(
  problem: AlgorithmProblem,
  reason: AlgorithmRecommendationReason,
  reasonLabel: string,
  score: number,
): RankedAlgorithmProblem {
  return { problem, reason, reasonLabel, score };
}

function phaseOrder(value: string): number {
  const match = value.match(/^W(\d+)/i);
  return match ? Number(match[1]) : 99;
}
