import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../../access-context";
import { shiftDateKey } from "../../dates";
import type {
  PlannerActionConflict,
  PlannerTask,
  PlannerTaskStatus,
} from "../../planner/types";
import { dateKeyInTimeZone } from "../../planner/time";
import { recordStudy } from "../learning/record-study";
import {
  appendLearningEvidence,
  getLearningTaskLink,
  type AppendLearningEvidenceInput,
  type UpsertLearningTaskLinkInput,
  upsertLearningTaskLink,
} from "../../repo/learning-evidence";
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
  retestTask?: PlannerTask;
  conflict?: PlannerActionConflict<PlannerTask>;
};

export type TaskLearningPatch = Omit<UpsertLearningTaskLinkInput, "taskId">;

export type CreateTaskCommand = Omit<CreatePlannerTaskInput, "listId"> & {
  listId?: string;
  learning?: TaskLearningPatch;
};

export type UpdateTaskCommand = UpdatePlannerTaskInput & {
  learning?: TaskLearningPatch;
};

export type TaskSchedule =
  | { kind: "none" }
  | {
      kind: "timed";
      startAt: string;
      endAt: string;
      timeZone: string;
    };

export type CompleteTaskEvidence = Omit<
  AppendLearningEvidenceInput,
  "taskId" | "completionCycle" | "day" | "idempotencyKey" | "correctsEvidenceId"
>;

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
    const { learning, ...taskInput } = input;
    const subjectCode = resolveLearningSubject(db, scope, input.subjectCode, learning?.knowledgePointId);
    const task = createPlannerTask(db, scope, {
      ...taskInput,
      subjectCode,
      listId: input.listId ?? plannerDefaultId(scope.workspaceId, "inbox"),
    });
    if (learning) upsertLearningTaskLink(db, scope, { ...learning, taskId: task.id });
    return task;
  })();
}

export function updateTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: UpdateTaskCommand,
): TaskCommandResult {
  return db.transaction(() => {
    const { learning, ...taskInput } = input;
    const current = requireActiveTask(db, scope, input.id);
    const currentLink = getLearningTaskLink(db, scope, input.id);
    const knowledgePointId = learning?.knowledgePointId !== undefined
      ? learning.knowledgePointId
      : input.subjectCode !== undefined
        ? currentLink?.knowledgePointId
        : undefined;
    const subjectCode = resolveLearningSubject(
      db,
      scope,
      input.subjectCode === undefined ? current.subject_code : input.subjectCode,
      knowledgePointId,
    );
    const normalizedInput = {
      ...taskInput,
      subjectCode: input.subjectCode !== undefined || learning?.knowledgePointId !== undefined
        ? subjectCode
        : undefined,
    };
    const isCompletion = input.status === "completed" && current.status !== "completed";
    const isReopen = input.status === "open" && current.status === "completed";
    if (isCompletion || isReopen) {
      const hasOtherPatch = Object.entries(normalizedInput).some(([key, value]) =>
        key !== "id" && key !== "expectedVersion" && key !== "status" && value !== undefined);
      let expectedVersion = input.expectedVersion;
      if (hasOtherPatch) {
        const intermediate = updatePlannerTask(db, scope, { ...normalizedInput, status: undefined });
        if (!intermediate.entity) return intermediate;
        expectedVersion = intermediate.entity.version;
      }
      if (learning) upsertLearningTaskLink(db, scope, { ...learning, taskId: input.id });
      return isCompletion
        ? completeTask(db, scope, { id: input.id, expectedVersion })
        : reopenTask(db, scope, { id: input.id, expectedVersion });
    }
    const hasTaskPatch = Object.entries(normalizedInput).some(([key, value]) =>
      key !== "id" && key !== "expectedVersion" && value !== undefined);
    const result: TaskCommandResult = hasTaskPatch
      ? updatePlannerTask(db, scope, normalizedInput)
      : { entity: current };
    if (!result.entity) return result;
    if (learning) upsertLearningTaskLink(db, scope, { ...learning, taskId: input.id });
    return result;
  })();
}

export function completeTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    id: string;
    expectedVersion: number;
    day?: string;
    clientMutationId?: string;
    evidence?: CompleteTaskEvidence;
    scheduleRetestAfterDays?: number;
  },
): TaskCommandResult {
  return db.transaction(() => {
    requireActiveTask(db, scope, input.id);
    const result = updatePlannerTask(db, scope, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      status: "completed",
    });
    if (!result.entity) return result;
    const completionCycle = nextCompletionCycle(db, scope, input.id);
    const mutationId = input.clientMutationId
      ?? `task-complete:${input.id}:version:${result.entity.version}`;
    const completionDay = input.day ?? currentWorkspaceDay(db, scope);
    recordStudy(db, scope, {
      taskId: input.id,
      completionCycle,
      day: completionDay,
      idempotencyKey: mutationId,
      title: result.entity.title,
      ...input.evidence,
      outcome: input.evidence?.outcome ?? "completed",
    });
    const retestTask = input.scheduleRetestAfterDays
      ? createCompletionRetest(db, scope, result.entity, {
          day: completionDay,
          delayDays: input.scheduleRetestAfterDays,
          clientMutationId: mutationId,
          verificationMethod: input.evidence?.verificationMethod,
        })
      : undefined;
    return { ...result, retestTask };
  })();
}

export function reopenTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    id: string;
    expectedVersion: number;
    day?: string;
    clientMutationId?: string;
  },
): TaskCommandResult {
  return db.transaction(() => {
    requireActiveTask(db, scope, input.id);
    const result = updatePlannerTask(db, scope, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      status: "open",
    });
    if (!result.entity) return result;
    appendLearningEvidence(db, scope, {
      taskId: input.id,
      completionCycle: currentCompletionCycle(db, scope, input.id),
      day: input.day ?? currentWorkspaceDay(db, scope),
      idempotencyKey: input.clientMutationId
        ?? `task-reopen:${input.id}:version:${result.entity.version}`,
      outcome: "reopened",
    });
    return result;
  })();
}

export function changeTaskStatus(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; expectedVersion: number; status: PlannerTaskStatus },
): TaskCommandResult {
  if (input.status === "completed") {
    return completeTask(db, scope, input);
  }
  if (input.status === "open") {
    const current = requireActiveTask(db, scope, input.id);
    if (current.status === "completed") return reopenTask(db, scope, input);
  }
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
    estimatedMinutes?: number;
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
      estimatedMinutes: input.estimatedMinutes,
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

function resolveLearningSubject(
  db: Database.Database,
  scope: WorkspaceScope,
  subjectCode: string | null | undefined,
  knowledgePointId: string | null | undefined,
): string | null | undefined {
  if (knowledgePointId === undefined || knowledgePointId === null || !knowledgePointId.trim()) {
    assertSubjectOwnership(db, scope, subjectCode);
    return subjectCode;
  }
  const point = db.prepare(`
    SELECT subject_code FROM knowledge_points WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, knowledgePointId.trim()) as { subject_code: string } | undefined;
  if (!point) throw new Error("知识点不存在或不属于当前学习空间");
  if (subjectCode && subjectCode !== point.subject_code) throw new Error("任务学科与知识点不一致");
  return point.subject_code;
}

function createCompletionRetest(
  db: Database.Database,
  scope: WorkspaceScope,
  completed: PlannerTask,
  input: {
    day: string;
    delayDays: number;
    clientMutationId: string;
    verificationMethod?: string;
  },
): PlannerTask | undefined {
  if (![1, 3, 7].includes(input.delayDays)) throw new Error("复测间隔无效");
  const link = getLearningTaskLink(db, scope, completed.id);
  if (!link?.knowledgePointId) return undefined;
  return createTask(db, scope, {
    clientMutationId: `${input.clientMutationId}:retest:${input.delayDays}`,
    title: `复测：${completed.title}`,
    notes: `由任务「${completed.title}」完成后自动安排；先独立作答，再核对结果。`,
    subjectCode: completed.subject_code,
    priority: completed.priority,
    estimatedMinutes: 15,
    dueDate: shiftDateKey(input.day, input.delayDays),
    learning: {
      expectedVersion: 0,
      knowledgePointId: link.knowledgePointId,
      activityType: "recall",
      completionCriteria: "不看原答案完成一次短复测，并记录相对训练前是改善、持平还是退步。",
      plannedVerificationMethod: link.plannedVerificationMethod || input.verificationMethod || "同类小测",
      sourceType: "training_retest",
      sourceId: `${completed.id}:${completed.version}`,
    },
  });
}

function currentCompletionCycle(
  db: Database.Database,
  scope: WorkspaceScope,
  taskId: string,
): number {
  return Math.max(1, (db.prepare(`
    SELECT COALESCE(MAX(completion_cycle), 0) AS cycle
    FROM learning_evidence
    WHERE workspace_id = ? AND task_id = ?
  `).get(scope.workspaceId, taskId) as { cycle: number }).cycle);
}

function nextCompletionCycle(
  db: Database.Database,
  scope: WorkspaceScope,
  taskId: string,
): number {
  return currentCompletionCycle(db, scope, taskId) + (
    db.prepare(`
      SELECT 1 FROM learning_evidence
      WHERE workspace_id = ? AND task_id = ?
      LIMIT 1
    `).get(scope.workspaceId, taskId) ? 1 : 0
  );
}

function currentWorkspaceDay(
  db: Database.Database,
  scope: WorkspaceScope,
): string {
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?")
    .get(scope.workspaceId) as { timezone: string } | undefined;
  if (!workspace) throw new Error("学习空间不存在");
  return dateKeyInTimeZone(new Date(), workspace.timezone);
}

export function unwrapTaskMutation(result: PlannerTaskMutation): PlannerTask {
  if (result.entity) return result.entity;
  if (result.conflict) throw new Error("任务版本冲突");
  throw new Error("任务操作未返回结果");
}
