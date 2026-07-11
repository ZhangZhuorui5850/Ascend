import type { CalendarSummary } from "./types";

type DayRecord = { date: string; plan?: string | null; summary?: string | null };
export type DayCountRow = { day: string; count: number };
export type DayMinutesRow = { day: string; minutes: number };

/** 由各表按天预聚合（GROUP BY day）的行合并出日历摘要，避免 O(天数×事件数) 的过滤。 */
export function buildCalendarSummaries(input: {
  days: DayRecord[];
  assetCounts: DayCountRow[];
  studyMinutes: DayMinutesRow[];
  reviewCounts: DayCountRow[];
  mistakeCounts: DayCountRow[];
}): CalendarSummary[] {
  const assetsByDay = toCountMap(input.assetCounts);
  const minutesByDay = new Map(input.studyMinutes.map((row) => [row.day, row.minutes]));
  const reviewsByDay = toCountMap(input.reviewCounts);
  const mistakesByDay = toCountMap(input.mistakeCounts);
  return input.days
    .map((day) => ({
      date: day.date,
      plan: day.plan ?? "",
      assetCount: assetsByDay.get(day.date) ?? 0,
      studyMinutes: minutesByDay.get(day.date) ?? 0,
      reviewCount: reviewsByDay.get(day.date) ?? 0,
      mistakeCount: mistakesByDay.get(day.date) ?? 0,
      hasSummary: Boolean(day.summary?.trim()),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function toCountMap(rows: DayCountRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.day, row.count]));
}
