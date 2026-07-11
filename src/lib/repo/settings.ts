import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey } from "../dates";

export type ExamCountdown = {
  name: string;
  date: string;
};

export type AppSettings = {
  examCountdowns: ExamCountdown[];
  dailyReviewLimit: number;
};

export const DEFAULT_DAILY_REVIEW_LIMIT = 12;

export function getSettings(db: Database.Database, scope: WorkspaceScope): AppSettings {
  const rows = db.prepare("SELECT key, value FROM app_settings WHERE workspace_id = ?").all(scope.workspaceId) as Array<{
    key: string;
    value: string;
  }>;
  const map = new Map(rows.map((row) => [row.key, row.value]));

  let examCountdowns: ExamCountdown[] = [];
  try {
    const parsed = JSON.parse(map.get("exam_countdowns") || "[]");
    if (Array.isArray(parsed)) {
      examCountdowns = parsed
        .filter((item) => item && typeof item.name === "string" && typeof item.date === "string")
        .map((item) => ({ name: item.name, date: item.date }));
    }
  } catch {
    examCountdowns = [];
  }

  const limit = Number(map.get("daily_review_limit"));
  return {
    examCountdowns,
    dailyReviewLimit: Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_DAILY_REVIEW_LIMIT,
  };
}

export function saveExamCountdowns(
  db: Database.Database,
  scope: WorkspaceScope,
  countdowns: ExamCountdown[],
): void {
  const cleaned = countdowns
    .map((item) => ({ name: item.name.trim(), date: item.date.trim() }))
    .filter((item) => item.name && item.date)
    .slice(0, 5);
  for (const item of cleaned) assertDateKey(item.date);
  setSetting(db, scope, "exam_countdowns", JSON.stringify(cleaned));
}

export function saveDailyReviewLimit(db: Database.Database, scope: WorkspaceScope, limit: number): void {
  const value = Math.round(Number(limit));
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error("每日复习上限需在 1-100 之间");
  setSetting(db, scope, "daily_review_limit", String(value));
}

function setSetting(db: Database.Database, scope: WorkspaceScope, key: string, value: string): void {
  db.prepare(`
    INSERT INTO app_settings (workspace_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value
  `).run(scope.workspaceId, key, value);
}
