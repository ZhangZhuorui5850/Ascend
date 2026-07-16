import { describe, expect, it } from "vitest";
import { completeOnboarding, getSettings, saveLearningPreferences } from "./settings";
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
      examCountdowns: [{ name: "期末", date: "2026-12-20" }],
      dailyReviewLimit: 18,
    });

    expect(getSettings(db, scope)).toMatchObject({
      learningGoal: "完成线性代数一轮复习",
      weeklyMinutes: 420,
      enabledSubjectCodes: ["M1"],
      dailyReviewLimit: 18,
      onboardingCompleted: true,
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
});
