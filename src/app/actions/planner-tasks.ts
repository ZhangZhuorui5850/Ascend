"use server";

import { revalidatePath } from "next/cache";
import { addMinutesToInstant, localDateTimeToUtc } from "@/lib/planner/time";
import type {
  PlannerActionConflict,
  PlannerTask,
  PlannerTaskStatus,
} from "@/lib/planner/types";
import {
  batchTasks,
  purgeTaskTrash,
} from "@/lib/application/tasks/batch-commands";
import {
  createTask,
  deleteTask,
  restoreTask,
  updateTask,
} from "@/lib/application/tasks/commands";
import {
  createRecurringTask,
  setTaskLabels,
} from "@/lib/application/tasks/organization-commands";
import { getDb } from "@/lib/db";
import { getPlannerTask } from "@/lib/repo/planner-tasks";
import { requireWorkspace } from "@/lib/request-auth";

type TaskActionResult = {
  ok: boolean;
  entity?: PlannerTask;
  entities?: PlannerTask[];
  conflict?: PlannerActionConflict<PlannerTask>;
  error?: string;
};

export async function createPlannerTaskSeriesAction(input: {
  clientMutationId: string;
  rrule: string;
  generationMode: "fixed_schedule" | "after_completion";
  listId: string;
  title: string;
  notes?: string;
  priority?: 1 | 2 | 3;
  estimatedMinutes?: number;
  firstDate: string;
  firstTime: string;
}): Promise<TaskActionResult> {
  try {
    const access = await requireWorkspace();
    const db = getDb();
    const timeZone = workspaceTimeZone(db, access.workspaceId);
    const result = createRecurringTask(db, access, {
      clientMutationId: input.clientMutationId,
      rrule: input.rrule,
      timezone: timeZone,
      generationMode: input.generationMode,
      firstOccurrenceAt: localDateTimeToUtc({
        date: input.firstDate,
        time: input.firstTime,
        timeZone,
      }),
      template: {
        listId: input.listId,
        title: input.title,
        notes: input.notes,
        priority: input.priority,
        estimatedMinutes: input.estimatedMinutes,
      },
    });
    revalidatePlannerViews(result.task);
    return { ok: true, entity: result.task };
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown): TaskActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "任务操作失败" };
}

function revalidatePlannerViews(entity?: PlannerTask): void {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  revalidatePath("/day/[date]", "page");
  if (entity?.subject_code) revalidatePath(`/subjects/${entity.subject_code}`);
}

export async function createPlannerTaskAction(input: {
  clientMutationId: string;
  listId: string;
  parentTaskId?: string | null;
  title: string;
  notes?: string;
  priority?: 1 | 2 | 3;
  dueDate?: string | null;
  scheduledDate?: string | null;
  scheduledStart?: string | null;
  estimatedMinutes?: number;
}): Promise<TaskActionResult> {
  try {
    const access = await requireWorkspace();
    const db = getDb();
    const timeZone = workspaceTimeZone(db, access.workspaceId);
    const scheduledStartAt = input.scheduledDate && input.scheduledStart
      ? localDateTimeToUtc({
          date: input.scheduledDate,
          time: input.scheduledStart,
          timeZone,
        })
      : null;
    const estimatedMinutes = input.estimatedMinutes ?? 30;
    const entity = createTask(db, access, {
      clientMutationId: input.clientMutationId,
      listId: input.listId,
      parentTaskId: input.parentTaskId,
      title: input.title,
      notes: input.notes,
      priority: input.priority,
      dueDate: input.dueDate,
      scheduledStartAt,
      scheduledEndAt: scheduledStartAt ? addMinutesToInstant(scheduledStartAt, estimatedMinutes) : null,
      scheduledTimezone: scheduledStartAt ? timeZone : null,
      estimatedMinutes,
    });
    revalidatePlannerViews(entity);
    return { ok: true, entity };
  } catch (error) {
    return failure(error);
  }
}

export async function updatePlannerTaskAction(input: {
  id: string;
  expectedVersion: number;
  title?: string;
  notes?: string;
  listId?: string;
  status?: PlannerTaskStatus;
  priority?: 1 | 2 | 3;
  dueDate?: string | null;
  scheduledDate?: string | null;
  scheduledStart?: string | null;
  estimatedMinutes?: number;
}): Promise<TaskActionResult> {
  try {
    const access = await requireWorkspace();
    const db = getDb();
    const current = getPlannerTask(db, access, input.id);
    if (!current) throw new Error("任务不存在");
    const timeZone = workspaceTimeZone(db, access.workspaceId);
    const scheduleProvided = input.scheduledDate !== undefined || input.scheduledStart !== undefined;
    const scheduledStartAt = scheduleProvided && input.scheduledDate && input.scheduledStart
      ? localDateTimeToUtc({
          date: input.scheduledDate,
          time: input.scheduledStart,
          timeZone,
        })
      : scheduleProvided
        ? null
        : undefined;
    const estimatedMinutes = input.estimatedMinutes ?? current.estimated_minutes;
    const result = updateTask(db, access, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      title: input.title,
      notes: input.notes,
      listId: input.listId,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate,
      scheduledStartAt,
      scheduledEndAt: scheduledStartAt === undefined
        ? undefined
        : scheduledStartAt
          ? addMinutesToInstant(scheduledStartAt, estimatedMinutes)
          : null,
      scheduledTimezone: scheduledStartAt === undefined ? undefined : scheduledStartAt ? timeZone : null,
      estimatedMinutes: input.estimatedMinutes,
    });
    if (result.conflict) return { ok: false, conflict: result.conflict, error: "任务版本冲突" };
    revalidatePlannerViews(result.entity);
    return { ok: true, entity: result.entity };
  } catch (error) {
    return failure(error);
  }
}

export async function deletePlannerTaskAction(input: {
  id: string;
  expectedVersion: number;
  clientMutationId: string;
}): Promise<TaskActionResult> {
  try {
    const access = await requireWorkspace();
    const result = deleteTask(getDb(), access, input);
    if (result.conflict) return { ok: false, conflict: result.conflict, error: "任务版本冲突" };
    revalidatePlannerViews(result.entity);
    return { ok: true, entity: result.entity };
  } catch (error) {
    return failure(error);
  }
}

export async function restorePlannerTaskAction(input: {
  id: string;
  expectedVersion: number;
  clientMutationId: string;
}): Promise<TaskActionResult> {
  try {
    const access = await requireWorkspace();
    const result = restoreTask(getDb(), access, input);
    if (result.conflict) return { ok: false, conflict: result.conflict, error: "任务版本冲突" };
    revalidatePlannerViews(result.entity);
    return { ok: true, entity: result.entity };
  } catch (error) {
    return failure(error);
  }
}

export async function batchPlannerTasksAction(input: {
  clientMutationId: string;
  tasks: Array<{ id: string; expectedVersion: number }>;
  patch: {
    status?: PlannerTaskStatus;
    listId?: string;
    dueDate?: string | null;
    deleted?: boolean;
  };
}): Promise<TaskActionResult> {
  try {
    const access = await requireWorkspace();
    const result = batchTasks(getDb(), access, input);
    if (result.conflicts.length) {
      return { ok: false, conflict: result.conflicts[0], error: "任务版本冲突，批量操作未应用" };
    }
    revalidatePlannerViews(result.entities[0]);
    return { ok: true, entities: result.entities };
  } catch (error) {
    return failure(error);
  }
}

export async function purgePlannerTrashAction(input: {
  deletedBefore: string;
  confirm: boolean;
}): Promise<{
  ok: boolean;
  purged?: number;
  retained?: number;
  purgedTaskIds?: string[];
  error?: string;
}> {
  try {
    const access = await requireWorkspace();
    const result = purgeTaskTrash(getDb(), access, input);
    revalidatePlannerViews();
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "清理失败" };
  }
}

export async function updatePlannerTaskLabelsAction(input: {
  id: string;
  expectedVersion: number;
  labelIds: string[];
}): Promise<TaskActionResult> {
  try {
    const access = await requireWorkspace();
    const entity = setTaskLabels(getDb(), access, {
      taskId: input.id,
      expectedVersion: input.expectedVersion,
      labelIds: input.labelIds,
    });
    revalidatePlannerViews(entity);
    return { ok: true, entity };
  } catch (error) {
    return failure(error);
  }
}

function workspaceTimeZone(db: ReturnType<typeof getDb>, workspaceId: string): string {
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?")
    .get(workspaceId) as { timezone: string } | undefined;
  if (!workspace) throw new Error("学习空间不存在");
  return workspace.timezone;
}
