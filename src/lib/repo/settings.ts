import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey } from "../dates";

export type ExamCountdown = {
  name: string;
  date: string;
  subjectCode?: string;
  targetScore?: number;
};

export type AppSettings = {
  examCountdowns: ExamCountdown[];
  dailyReviewLimit: number;
  learningGoal: string;
  weeklyMinutes: number;
  enabledSubjectCodes: string[];
  onboardingCompleted: boolean;
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
        .map((item) => ({
          name: item.name,
          date: item.date,
          ...(typeof item.subjectCode === "string" && item.subjectCode ? { subjectCode: item.subjectCode } : {}),
          ...(Number.isFinite(Number(item.targetScore)) && Number(item.targetScore) > 0
            ? { targetScore: Number(item.targetScore) }
            : {}),
        }));
    }
  } catch {
    examCountdowns = [];
  }

  const limit = Number(map.get("daily_review_limit"));
  const weeklyMinutes = Number(map.get("weekly_minutes"));
  let enabledSubjectCodes: string[] = [];
  try {
    const parsed = JSON.parse(map.get("enabled_subject_codes") || "[]");
    if (Array.isArray(parsed)) enabledSubjectCodes = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    enabledSubjectCodes = [];
  }
  const workspace = db.prepare(`
    SELECT onboarding_completed FROM workspaces WHERE id = ?
  `).get(scope.workspaceId) as { onboarding_completed: number } | undefined;
  return {
    examCountdowns,
    dailyReviewLimit: Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_DAILY_REVIEW_LIMIT,
    learningGoal: map.get("learning_goal") || "",
    weeklyMinutes: Number.isInteger(weeklyMinutes) && weeklyMinutes >= 30 ? weeklyMinutes : 300,
    enabledSubjectCodes,
    onboardingCompleted: Boolean(workspace?.onboarding_completed),
  };
}

export function saveExamCountdowns(
  db: Database.Database,
  scope: WorkspaceScope,
  countdowns: ExamCountdown[],
): void {
  const cleaned = countdowns
    .map((item) => ({
      name: item.name.trim(),
      date: item.date.trim(),
      subjectCode: item.subjectCode?.trim() || "",
      targetScore: item.targetScore === undefined ? undefined : Number(item.targetScore),
    }))
    .filter((item) => item.name && item.date)
    .slice(0, 5);
  const availableSubjects = new Set(
    (db.prepare("SELECT code FROM subjects WHERE workspace_id = ?").all(scope.workspaceId) as Array<{ code: string }>)
      .map((item) => item.code),
  );
  for (const item of cleaned) {
    assertDateKey(item.date);
    if (item.subjectCode && !availableSubjects.has(item.subjectCode)) throw new Error("考试关联科目不存在");
    if (item.targetScore !== undefined && (!Number.isFinite(item.targetScore) || item.targetScore <= 0 || item.targetScore > 1000)) {
      throw new Error("考试目标分数需在 1-1000 之间");
    }
  }
  setSetting(db, scope, "exam_countdowns", JSON.stringify(cleaned.map((item) => ({
    name: item.name,
    date: item.date,
    ...(item.subjectCode ? { subjectCode: item.subjectCode } : {}),
    ...(item.targetScore !== undefined ? { targetScore: item.targetScore } : {}),
  }))));
}

export function saveDailyReviewLimit(db: Database.Database, scope: WorkspaceScope, limit: number): void {
  const value = Math.round(Number(limit));
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error("每日复习上限需在 1-100 之间");
  setSetting(db, scope, "daily_review_limit", String(value));
}

export function saveLearningPreferences(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { learningGoal: string; weeklyMinutes: number; enabledSubjectCodes: string[] },
): void {
  const learningGoal = input.learningGoal.trim().slice(0, 120);
  if (!learningGoal) throw new Error("请填写当前学习目标");
  const weeklyMinutes = Math.round(Number(input.weeklyMinutes));
  if (!Number.isInteger(weeklyMinutes) || weeklyMinutes < 30 || weeklyMinutes > 10080) {
    throw new Error("每周学习时长需在 30-10080 分钟之间");
  }
  const available = new Set(
    (db.prepare("SELECT code FROM subjects WHERE workspace_id = ?").all(scope.workspaceId) as Array<{ code: string }>)
      .map((row) => row.code),
  );
  const enabledSubjectCodes = [...new Set(input.enabledSubjectCodes.map((code) => code.trim()).filter((code) => available.has(code)))];
  if (!enabledSubjectCodes.length) throw new Error("请至少选择一个当前科目");
  setSetting(db, scope, "learning_goal", learningGoal);
  setSetting(db, scope, "weekly_minutes", String(weeklyMinutes));
  setSetting(db, scope, "enabled_subject_codes", JSON.stringify(enabledSubjectCodes));
}

export function completeOnboarding(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    learningGoal: string;
    weeklyMinutes: number;
    enabledSubjectCodes: string[];
    examCountdowns: ExamCountdown[];
    dailyReviewLimit: number;
  },
): void {
  db.transaction(() => {
    saveLearningPreferences(db, scope, input);
    saveExamCountdowns(db, scope, input.examCountdowns);
    saveDailyReviewLimit(db, scope, input.dailyReviewLimit);
    db.prepare(`
      UPDATE workspaces SET onboarding_completed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(scope.workspaceId);
  })();
}

function setSetting(db: Database.Database, scope: WorkspaceScope, key: string, value: string): void {
  db.prepare(`
    INSERT INTO app_settings (workspace_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value
  `).run(scope.workspaceId, key, value);
}
