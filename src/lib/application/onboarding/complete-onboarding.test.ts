import { describe, expect, it } from "vitest";
import { listPlannerTasks } from "../../repo/planner-tasks";
import { getSettings } from "../../repo/settings";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "../../repo/testing";
import { completeOnboardingFlow } from "./complete-onboarding";

describe("completeOnboardingFlow", () => {
  it("atomically saves the minimal setup and a real Today task", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    seedSubjectWithChapter(db, scope);

    const result = completeOnboardingFlow(db, scope, {
      clientMutationId: "onboarding-1",
      day: "2026-08-10",
      learningGoal: "完成线性代数一轮复习",
      subject: { code: "M1" },
      firstTaskTitle: "做 20 道矩阵练习",
    });

    expect(getSettings(db, scope)).toMatchObject({
      onboardingCompleted: true,
      learningGoal: "完成线性代数一轮复习",
      enabledSubjectCodes: ["M1"],
    });
    expect(result.task).toMatchObject({
      subject_code: "M1",
      due_date: "2026-08-10",
      estimated_minutes: 25,
      status: "open",
    });
  });

  it("can create the first subject and replay without duplicating the task", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const input = {
      clientMutationId: "onboarding-new-subject",
      day: "2026-08-10",
      learningGoal: "通过数据库课程",
      subject: { code: "DB", name: "数据库" },
      firstTaskTitle: "完成第一章练习",
    };

    expect(completeOnboardingFlow(db, scope, input).task.id)
      .toBe(completeOnboardingFlow(db, scope, input).task.id);
    expect(listPlannerTasks(db, scope)).toHaveLength(1);
    expect(db.prepare("SELECT name FROM subjects WHERE workspace_id = ? AND code = 'DB'").get(scope.workspaceId))
      .toEqual({ name: "数据库" });
  });

  it("rolls back settings and subject creation when canonical task validation fails", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);

    expect(() => completeOnboardingFlow(db, scope, {
      clientMutationId: "onboarding-invalid",
      day: "2026-08-10",
      learningGoal: "学习数据库",
      subject: { code: "DB", name: "数据库" },
      firstTaskTitle: "x".repeat(501),
    })).toThrow();
    expect(getSettings(db, scope).onboardingCompleted).toBe(false);
    expect(db.prepare("SELECT 1 FROM subjects WHERE workspace_id = ? AND code = 'DB'").get(scope.workspaceId))
      .toBeUndefined();
  });
});
