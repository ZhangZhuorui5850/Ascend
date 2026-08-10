"use server";

import { revalidatePath } from "next/cache";
import {
  completeTask,
  createTask,
  deleteTask,
  reopenTask,
  rescheduleTask,
  updateTask,
  type CompleteTaskEvidence,
} from "@/lib/application/tasks/commands";
import { shiftDateKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import type { LearningActivityType } from "@/lib/learning/types";
import { addMinutesToInstant, localDateTimeToUtc } from "@/lib/planner/time";
import type { PlannerActionConflict, PlannerTask } from "@/lib/planner/types";
import { getLearningTaskLink } from "@/lib/repo/learning-evidence";
import { getPlannerTask } from "@/lib/repo/planner-tasks";
import { listDayTaskItems, type DayTaskItem } from "@/lib/repo/task-read-model";
import { requireWorkspace } from "@/lib/request-auth";

type DayTaskActionResult = {
  ok: boolean;
  task?: DayTaskItem;
  conflict?: PlannerActionConflict<PlannerTask>;
  error?: string;
};

type LearningLinkPatch = {
  linkExpectedVersion?: number;
  knowledgePointId?: string | null;
  activityType?: LearningActivityType;
  completionCriteria?: string;
  plannedVerificationMethod?: string;
  sourceType?: string;
  sourceId?: string | number;
};

export async function createDayTaskAction(input: {
  clientMutationId: string;
  day: string;
  title: string;
  subjectCode?: string | null;
  priority?: 1 | 2 | 3;
  estimatedMinutes?: number;
  scheduledStart?: string | null;
  notes?: string;
} & LearningLinkPatch): Promise<DayTaskActionResult> {
  try {
    const access = await requireWorkspace();
    const db = getDb();
    const timeZone = workspaceTimeZone(db, access.workspaceId);
    const subjectCode = resolveSubjectCode(db, access.workspaceId, input.subjectCode, input.knowledgePointId);
    const startAt = input.scheduledStart
      ? localDateTimeToUtc({ date: input.day, time: input.scheduledStart, timeZone })
      : null;
    const estimatedMinutes = input.estimatedMinutes ?? 30;
    const entity = createTask(db, access, {
      clientMutationId: input.clientMutationId,
      title: input.title,
      notes: input.notes,
      subjectCode,
      priority: input.priority,
      estimatedMinutes,
      dueDate: startAt ? null : input.day,
      scheduledStartAt: startAt,
      scheduledEndAt: startAt ? addMinutesToInstant(startAt, estimatedMinutes) : null,
      scheduledTimezone: startAt ? timeZone : null,
      learning: hasLearningPatch(input) ? {
        expectedVersion: 0,
        knowledgePointId: input.knowledgePointId,
        activityType: input.activityType,
        completionCriteria: input.completionCriteria,
        plannedVerificationMethod: input.plannedVerificationMethod,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      } : undefined,
    });
    const task = requireDayTask(db, access, input.day, entity.id);
    revalidateTaskViews(input.day);
    return { ok: true, task };
  } catch (error) {
    return failure(error);
  }
}

export async function updateDayTaskAction(input: {
  id: string;
  expectedVersion: number;
  day: string;
  title?: string;
  subjectCode?: string | null;
  priority?: 1 | 2 | 3;
  estimatedMinutes?: number;
  scheduledStart?: string | null;
  notes?: string;
} & LearningLinkPatch): Promise<DayTaskActionResult> {
  try {
    const access = await requireWorkspace();
    const db = getDb();
    const timeZone = workspaceTimeZone(db, access.workspaceId);
    const currentTask = getPlannerTask(db, access, input.id);
    if (!currentTask || currentTask.deleted_at) throw new Error("任务不存在");
    const currentLink = getLearningTaskLink(db, access, input.id);
    const knowledgePointId = input.knowledgePointId === undefined
      ? input.subjectCode === undefined
        ? undefined
        : keepPointForSubject(db, access.workspaceId, currentLink?.knowledgePointId ?? null, input.subjectCode)
      : input.knowledgePointId;
    const subjectCode = resolveSubjectCode(db, access.workspaceId, input.subjectCode, knowledgePointId);
    const scheduleProvided = input.scheduledStart !== undefined;
    const startAt = scheduleProvided && input.scheduledStart
      ? localDateTimeToUtc({ date: input.day, time: input.scheduledStart, timeZone })
      : scheduleProvided
        ? null
        : undefined;
    const learningProvided = hasLearningPatch(input) || knowledgePointId !== undefined;
    const result = updateTask(db, access, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      title: input.title,
      subjectCode,
      priority: input.priority,
      estimatedMinutes: input.estimatedMinutes,
      notes: input.notes,
      dueDate: scheduleProvided ? (startAt ? null : input.day) : undefined,
      scheduledStartAt: startAt,
      scheduledEndAt: startAt === undefined
        ? input.estimatedMinutes !== undefined && currentTask.scheduled_start_at
          ? addMinutesToInstant(currentTask.scheduled_start_at, input.estimatedMinutes)
          : undefined
        : startAt
          ? addMinutesToInstant(startAt, input.estimatedMinutes ?? mutationEstimatedMinutes(db, access.workspaceId, input.id))
          : null,
      scheduledTimezone: startAt === undefined ? undefined : startAt ? timeZone : null,
      learning: learningProvided ? {
        expectedVersion: input.linkExpectedVersion,
        knowledgePointId,
        activityType: input.activityType,
        completionCriteria: input.completionCriteria,
        plannedVerificationMethod: input.plannedVerificationMethod,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      } : undefined,
    });
    if (result.conflict) return conflict(result.conflict);
    revalidateTaskViews(input.day);
    return { ok: true, task: requireDayTask(db, access, input.day, input.id) };
  } catch (error) {
    return failure(error);
  }
}

type CompleteDayTaskInput = {
  id: string;
  expectedVersion: number;
  clientMutationId: string;
  day: string;
  evidence?: CompleteTaskEvidence;
  scheduleRetestAfterDays?: number;
};

export async function completeDayTaskAction(input: CompleteDayTaskInput): Promise<DayTaskActionResult> {
  return setDayTaskCompletion(input, true);
}

export async function reopenDayTaskAction(
  input: Omit<CompleteDayTaskInput, "evidence" | "scheduleRetestAfterDays">,
): Promise<DayTaskActionResult> {
  return setDayTaskCompletion(input, false);
}

export async function toggleDayTaskAction(
  input: CompleteDayTaskInput & { done: boolean },
): Promise<DayTaskActionResult> {
  return setDayTaskCompletion(input, input.done);
}

async function setDayTaskCompletion(input: CompleteDayTaskInput, done: boolean): Promise<DayTaskActionResult> {
  try {
    if (input.scheduleRetestAfterDays !== undefined && ![1, 3, 7].includes(input.scheduleRetestAfterDays)) {
      throw new Error("复测间隔无效");
    }
    const access = await requireWorkspace();
    const db = getDb();
    const result = done
      ? completeTask(db, access, {
          id: input.id,
          expectedVersion: input.expectedVersion,
          day: input.day,
          clientMutationId: input.clientMutationId,
          evidence: input.evidence,
          scheduleRetestAfterDays: input.scheduleRetestAfterDays,
        })
      : reopenTask(db, access, {
          id: input.id,
          expectedVersion: input.expectedVersion,
          day: input.day,
          clientMutationId: input.clientMutationId,
        });
    if (result.conflict) return conflict(result.conflict);
    revalidateTaskViews(input.day);
    if (done) {
      revalidatePath("/analytics");
      revalidatePath("/subjects");
      if (result.entity?.subject_code) revalidatePath(`/subjects/${result.entity.subject_code}`);
    }
    if (input.scheduleRetestAfterDays) revalidateTaskViews(shiftDateKey(input.day, input.scheduleRetestAfterDays));
    return { ok: true, task: requireDayTask(db, access, input.day, input.id) };
  } catch (error) {
    return failure(error);
  }
}

export async function rescheduleDayTaskAction(input: {
  id: string;
  expectedVersion: number;
  day: string;
  scheduledStart: string | null;
  estimatedMinutes: number;
}): Promise<DayTaskActionResult> {
  try {
    const access = await requireWorkspace();
    const db = getDb();
    const timeZone = workspaceTimeZone(db, access.workspaceId);
    const startAt = input.scheduledStart
      ? localDateTimeToUtc({ date: input.day, time: input.scheduledStart, timeZone })
      : null;
    const result = rescheduleTask(db, access, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      dueDate: startAt ? null : input.day,
      estimatedMinutes: input.estimatedMinutes,
      schedule: startAt
        ? {
            kind: "timed",
            startAt,
            endAt: addMinutesToInstant(startAt, input.estimatedMinutes),
            timeZone,
          }
        : { kind: "none" },
    });
    if (result.conflict) return conflict(result.conflict);
    revalidateTaskViews(input.day);
    return { ok: true, task: requireDayTask(db, access, input.day, input.id) };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteDayTaskAction(input: {
  id: string;
  expectedVersion: number;
  clientMutationId: string;
  day: string;
}): Promise<DayTaskActionResult> {
  try {
    const access = await requireWorkspace();
    const result = deleteTask(getDb(), access, input);
    if (result.conflict) return conflict(result.conflict);
    revalidateTaskViews(input.day);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function carryDayTasksAction(input: {
  fromDay: string;
  toDay: string;
}): Promise<DayTaskActionResult & { moved?: number }> {
  try {
    if (input.fromDay === input.toDay) return { ok: true, moved: 0 };
    const access = await requireWorkspace();
    const db = getDb();
    const open = listDayTaskItems(db, access, input.fromDay).filter((task) => !task.done);
    db.transaction(() => {
      for (const task of open) {
        const result = rescheduleTask(db, access, {
          id: task.id,
          expectedVersion: task.version,
          dueDate: input.toDay,
          estimatedMinutes: task.estimated_minutes,
          schedule: { kind: "none" },
        });
        if (result.conflict) throw new Error(`任务「${task.title}」版本冲突`);
      }
    })();
    revalidateTaskViews(input.fromDay, input.toDay);
    return { ok: true, moved: open.length };
  } catch (error) {
    return failure(error);
  }
}

function requireDayTask(
  db: ReturnType<typeof getDb>,
  scope: { workspaceId: string },
  day: string,
  id: string,
): DayTaskItem {
  const task = listDayTaskItems(db, scope, day).find((item) => item.id === id);
  if (!task) throw new Error("任务不在当前日期");
  return task;
}

function hasLearningPatch(input: LearningLinkPatch): boolean {
  return input.knowledgePointId !== undefined
    || input.activityType !== undefined
    || input.completionCriteria !== undefined
    || input.plannedVerificationMethod !== undefined
    || input.sourceType !== undefined
    || input.sourceId !== undefined;
}

function resolveSubjectCode(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  subjectCode: string | null | undefined,
  knowledgePointId: string | null | undefined,
): string | null | undefined {
  if (!knowledgePointId) return subjectCode;
  const point = db.prepare(`
    SELECT subject_code FROM knowledge_points WHERE workspace_id = ? AND id = ?
  `).get(workspaceId, knowledgePointId) as { subject_code: string } | undefined;
  if (!point) throw new Error("知识点不存在");
  return point.subject_code;
}

function keepPointForSubject(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  knowledgePointId: string | null,
  subjectCode: string | null | undefined,
): string | null | undefined {
  if (!knowledgePointId || !subjectCode) return null;
  const point = db.prepare(`
    SELECT subject_code FROM knowledge_points WHERE workspace_id = ? AND id = ?
  `).get(workspaceId, knowledgePointId) as { subject_code: string } | undefined;
  return point?.subject_code === subjectCode ? knowledgePointId : null;
}

function mutationEstimatedMinutes(db: ReturnType<typeof getDb>, workspaceId: string, id: string): number {
  const task = db.prepare(`
    SELECT estimated_minutes FROM planner_tasks WHERE workspace_id = ? AND id = ?
  `).get(workspaceId, id) as { estimated_minutes: number } | undefined;
  if (!task) throw new Error("任务不存在");
  return task.estimated_minutes;
}

function workspaceTimeZone(db: ReturnType<typeof getDb>, workspaceId: string): string {
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?")
    .get(workspaceId) as { timezone: string } | undefined;
  if (!workspace) throw new Error("学习空间不存在");
  return workspace.timezone;
}

function revalidateTaskViews(...days: string[]): void {
  for (const day of new Set(days)) revalidatePath(`/day/${day}`);
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/calendar");
}

function conflict(value: PlannerActionConflict<PlannerTask>): DayTaskActionResult {
  return { ok: false, conflict: value, error: "任务版本冲突，请重试" };
}

function failure(error: unknown): DayTaskActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "任务操作失败" };
}
