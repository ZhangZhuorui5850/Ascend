import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../../access-context";
import type {
  PlannerActionConflict,
  PlannerTask,
  PlannerTaskStatus,
} from "../../planner/types";
import { ensurePlannerDefaults, plannerDefaultId } from "../../repo/planner-defaults";
import {
  createPlannerTask,
  getPlannerTask,
  restorePlannerTask,
  softDeletePlannerTask,
  updatePlannerTask,
  type CreatePlannerTaskInput,
  type PlannerTaskMutation,
  type UpdatePlannerTaskInput,
} from "../../repo/planner-tasks";

export type TaskCommandResult = {
  entity?: PlannerTask;
  conflict?: PlannerActionConflict<PlannerTask>;
};

export type CreateTaskCommand = Omit<CreatePlannerTaskInput, "listId"> & {
  listId?: string;
};

export type TaskSchedule =
  | { kind: "none" }
  | {
      kind: "timed";
      startAt: string;
      endAt: string;
      timeZone: string;
    };

/**
 * Canonical task write boundary shared by Web actions and agent operations.
 *
 * This module deliberately knows nothing about Next.js, cookies, or UI models.
 * Cross-repository invariants belong here; repositories remain persistence APIs.
 */
export function createTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: CreateTaskCommand,
): PlannerTask {
  return db.transaction(() => {
    ensurePlannerDefaults(db, scope);
    assertSubjectOwnership(db, scope, input.subjectCode);
    return createPlannerTask(db, scope, {
      ...input,
      listId: input.listId ?? plannerDefaultId(scope.workspaceId, "inbox"),
    });
  })();
}

export function updateTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: UpdatePlannerTaskInput,
): TaskCommandResult {
  return db.transaction(() => {
    const current = requireActiveTask(db, scope, input.id);
    assertSubjectOwnership(
      db,
      scope,
      input.subjectCode === undefined ? current.subject_code : input.subjectCode,
    );
    return updatePlannerTask(db, scope, input);
  })();
}

export function completeTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; expectedVersion: number },
): TaskCommandResult {
  return changeTaskStatus(db, scope, { ...input, status: "completed" });
}

export function reopenTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; expectedVersion: number },
): TaskCommandResult {
  return changeTaskStatus(db, scope, { ...input, status: "open" });
}

export function changeTaskStatus(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; expectedVersion: number; status: PlannerTaskStatus },
): TaskCommandResult {
  return db.transaction(() => {
    requireActiveTask(db, scope, input.id);
    return updatePlannerTask(db, scope, input);
  })();
}

export function rescheduleTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    id: string;
    expectedVersion: number;
    schedule: TaskSchedule;
    dueDate?: string | null;
  },
): TaskCommandResult {
  return db.transaction(() => {
    requireActiveTask(db, scope, input.id);
    const schedulePatch = input.schedule.kind === "none"
      ? {
          scheduledStartAt: null,
          scheduledEndAt: null,
          scheduledTimezone: null,
          scheduledAllDay: false,
        }
      : {
          scheduledStartAt: input.schedule.startAt,
          scheduledEndAt: input.schedule.endAt,
          scheduledTimezone: input.schedule.timeZone,
          scheduledAllDay: false,
        };
    return updatePlannerTask(db, scope, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      dueDate: input.dueDate,
      ...schedulePatch,
    });
  })();
}

export function deleteTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; expectedVersion: number; clientMutationId: string },
): TaskCommandResult {
  // The repository checks the operation record before the entity state, which is
  // required for a retry to return its original snapshot after the first delete.
  return softDeletePlannerTask(db, scope, input);
}

export function restoreTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; expectedVersion: number; clientMutationId: string },
): TaskCommandResult {
  // Keep replay handling inside the repository for the same reason as delete.
  return restorePlannerTask(db, scope, input);
}

function requireActiveTask(
  db: Database.Database,
  scope: WorkspaceScope,
  id: string,
): PlannerTask {
  const task = getPlannerTask(db, scope, id);
  if (!task) throw new Error("任务不存在");
  if (task.deleted_at) throw new Error("任务已在回收站");
  return task;
}

function assertSubjectOwnership(
  db: Database.Database,
  scope: WorkspaceScope,
  subjectCode: string | null | undefined,
): void {
  if (!subjectCode) return;
  const subject = db.prepare(`
    SELECT 1 FROM subjects WHERE workspace_id = ? AND code = ?
  `).get(scope.workspaceId, subjectCode);
  if (!subject) throw new Error("科目不存在或不属于当前学习空间");
}

export function unwrapTaskMutation(result: PlannerTaskMutation): PlannerTask {
  if (result.entity) return result.entity;
  if (result.conflict) throw new Error("任务版本冲突");
  throw new Error("任务操作未返回结果");
}
