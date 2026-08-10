import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../../access-context";
import { assertDateKey } from "../../dates";
import type { PlannerTask } from "../../planner/types";
import { createSubject } from "../../repo/knowledge";
import { completeOnboarding, getSettings } from "../../repo/settings";
import { createTask } from "../tasks/commands";

export type CompleteOnboardingFlowInput = {
  clientMutationId: string;
  day: string;
  learningGoal: string;
  subject: { code: string; name?: string };
  firstTaskTitle: string;
};

export type CompleteOnboardingFlowResult = {
  task: PlannerTask;
  subjectCode: string;
};

/** Saves the minimal learning context and first real task in one transaction. */
export function completeOnboardingFlow(
  db: Database.Database,
  scope: WorkspaceScope,
  input: CompleteOnboardingFlowInput,
): CompleteOnboardingFlowResult {
  const day = assertDateKey(input.day);
  const subjectCode = input.subject.code.trim().toUpperCase();
  const subjectName = input.subject.name?.trim() || "";
  if (!subjectCode) throw new Error("请选择或创建一个学习科目");
  const goal = input.learningGoal.trim();
  if (!goal) throw new Error("请填写最近最重要的目标");
  const taskTitle = input.firstTaskTitle.trim();
  if (!taskTitle) throw new Error("请填写今天第一件要完成的事");
  return db.transaction(() => {
    const existing = db.prepare(`
      SELECT code, name FROM subjects WHERE workspace_id = ? AND code = ?
    `).get(scope.workspaceId, subjectCode) as { code: string; name: string } | undefined;
    if (!existing) {
      if (!subjectName) throw new Error("新科目名称必填");
      createSubject(db, scope, { code: subjectCode, name: subjectName });
    } else if (subjectName && subjectName !== existing.name) {
      throw new Error("科目编号已存在，请直接选择该科目");
    }
    const current = getSettings(db, scope);
    completeOnboarding(db, scope, {
      learningGoal: goal,
      weeklyMinutes: current.weeklyMinutes,
      enabledSubjectCodes: [subjectCode],
      examCountdowns: current.examCountdowns,
      dailyReviewLimit: current.dailyReviewLimit,
    });
    const task = createTask(db, scope, {
      clientMutationId: input.clientMutationId,
      title: taskTitle,
      subjectCode,
      dueDate: day,
      estimatedMinutes: 25,
      priority: 2,
    });
    return { task, subjectCode };
  })();
}
