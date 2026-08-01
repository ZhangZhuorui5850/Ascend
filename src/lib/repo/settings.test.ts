import { describe, expect, it } from "vitest";
import { completeOnboarding, getSettings, saveLearningPreferences, saveSettings } from "./settings";
import { createTestDb, seedSubjectWithChapter } from "./testing";
import { LEGACY_WORKSPACE_ID } from "./workspaces";

const scope = { workspaceId: LEGACY_WORKSPACE_ID };

describe("settings repo", () => {
  it("persists learning preferences and completes onboarding atomically", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    expect(getSettings(db, scope).onboardingCompleted).toBe(false);

    completeOnboarding(db, scope, {
      learningGoal: "完成线性代数一轮复习",
      weeklyMinutes: 420,
      enabledSubjectCodes: ["M1"],
      examCountdowns: [{ name: "期末", date: "2026-12-20", subjectCode: "M1", targetScore: 120 }],
      dailyReviewLimit: 18,
    });

    expect(getSettings(db, scope)).toMatchObject({
      learningGoal: "完成线性代数一轮复习",
      weeklyMinutes: 420,
      enabledSubjectCodes: ["M1"],
      dailyReviewLimit: 18,
      onboardingCompleted: true,
      examCountdowns: [{ name: "期末", date: "2026-12-20", subjectCode: "M1", targetScore: 120 }],
    });
  });

  it("rejects unknown enabled subjects", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    expect(() => saveLearningPreferences(db, scope, {
      learningGoal: "学习",
      weeklyMinutes: 300,
      enabledSubjectCodes: ["UNKNOWN"],
    })).toThrow("请至少选择一个当前科目");
  });

  it("rolls back every ordinary setting when a later field fails validation", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    saveSettings(db, scope, {
      learningGoal: "旧目标",
      weeklyMinutes: 300,
      enabledSubjectCodes: ["M1"],
      examCountdowns: [{ name: "旧考试", date: "2026-12-01", subjectCode: "M1" }],
      dailyReviewLimit: 12,
    });

    expect(() => saveSettings(db, scope, {
      learningGoal: "不应保存的新目标",
      weeklyMinutes: 600,
      enabledSubjectCodes: ["M1"],
      examCountdowns: [{ name: "不应保存的新考试", date: "2026-12-20", subjectCode: "M1" }],
      dailyReviewLimit: 0,
    })).toThrow("每日复习上限");

    expect(getSettings(db, scope)).toMatchObject({
      learningGoal: "旧目标",
      weeklyMinutes: 300,
      dailyReviewLimit: 12,
      examCountdowns: [{ name: "旧考试", date: "2026-12-01", subjectCode: "M1" }],
    });
  });
});
