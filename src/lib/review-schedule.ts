const REVIEW_LADDER_DAYS = [1, 3, 7, 16, 30];

export function nextReviewDate(today: string, completedReviews: number): string {
  const interval = REVIEW_LADDER_DAYS[Math.min(completedReviews, REVIEW_LADDER_DAYS.length - 1)];
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + interval);
  return date.toISOString().slice(0, 10);
}
