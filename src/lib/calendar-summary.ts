import type { CalendarSummary } from "./types";

type DayRecord = { date: string; plan?: string | null; summary?: string | null };
type DatedRecord = { id: number; day: string };
type StudySessionRecord = DatedRecord & { durationMinutes: number };

export function buildCalendarSummaries(input: {
  days: DayRecord[];
  assets: DatedRecord[];
  studySessions: StudySessionRecord[];
  reviewEvents: DatedRecord[];
  mistakes: DatedRecord[];
}): CalendarSummary[] {
  return input.days
    .map((day) => ({
      date: day.date,
      plan: day.plan ?? "",
      assetCount: input.assets.filter((asset) => asset.day === day.date).length,
      studyMinutes: input.studySessions
        .filter((session) => session.day === day.date)
        .reduce((total, session) => total + session.durationMinutes, 0),
      reviewCount: input.reviewEvents.filter((event) => event.day === day.date).length,
      mistakeCount: input.mistakes.filter((mistake) => mistake.day === day.date).length,
      hasSummary: Boolean(day.summary?.trim()),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}
