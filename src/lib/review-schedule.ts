export const REVIEW_LADDER_DAYS = [1, 3, 7, 16, 30] as const;

export function nextReviewDate(today: string, intervalStep: number): string {
  const normalizedStep = Math.max(0, Math.min(Math.trunc(intervalStep), REVIEW_LADDER_DAYS.length - 1));
  const interval = REVIEW_LADDER_DAYS[normalizedStep];
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + interval);
  return date.toISOString().slice(0, 10);
}

/**
 * 连续成功阶梯。首次成功稳定进入 3 天；后续“熟练”可前进两级。
 * 失败由调用方重置为 step 0。
 */
export function nextIntervalStep(currentStep: number, score: number): number {
  const step = Math.max(0, Math.min(Math.trunc(currentStep), REVIEW_LADDER_DAYS.length - 1));
  if (score <= 1) return 0;
  if (step === 0) return 1;
  return Math.min(REVIEW_LADDER_DAYS.length - 1, step + (score >= 3 ? 2 : 1));
}
