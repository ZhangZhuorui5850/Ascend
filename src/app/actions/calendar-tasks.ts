"use server";

import { revalidatePath } from "next/cache";
import { completeTask, createTask, deleteTask, reopenTask, rescheduleTask } from "@/lib/application/tasks/commands";
import { getDb } from "@/lib/db";
import { addMinutesToInstant, localDateTimeToUtc } from "@/lib/planner/time";
import type { PlannerActionConflict, PlannerTask } from "@/lib/planner/types";
import { projectPlannerTaskToCalendarTask, type CalendarTask } from "@/lib/repo/planner-calendar-tasks";
import { requireWorkspace } from "@/lib/request-auth";

type CalendarTaskActionResult = {
  ok: boolean;
  entity?: CalendarTask;
  conflict?: PlannerActionConflict<PlannerTask>;
  error?: string;
};

export async function createCalendarTaskAction(input: {
  clientMutationId: string;
  title: string;
  day: string;
}): Promise<CalendarTaskActionResult> {
  try {
    const access = await requireWorkspace();
    const db = getDb();
    const timeZone = workspaceTimeZone(db, access.workspaceId);
    const entity = createTask(db, access, {
      clientMutationId: input.clientMutationId,
      title: input.title,
      dueDate: input.day,
    });
    revalidateTaskViews();
    return { ok: true, entity: projectPlannerTaskToCalendarTask(entity, timeZone) };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleCalendarTaskAction(input: {
  id: string;
  expectedVersion: number;
  done: boolean;
}): Promise<CalendarTaskActionResult> {
  try {
    const access = await requireWorkspace();
    const db = getDb();
    const result = input.done ? completeTask(db, access, input) : reopenTask(db, access, input);
    if (result.conflict) return conflict(result.conflict);
    revalidateTaskViews();
    return {
      ok: true,
      entity: projectPlannerTaskToCalendarTask(result.entity!, workspaceTimeZone(db, access.workspaceId)),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function rescheduleCalendarTaskAction(input: {
  id: string;
  expectedVersion: number;
  day: string;
  scheduledStart: string | null;
  estimatedMinutes: number;
}): Promise<CalendarTaskActionResult> {
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
      estimatedMinutes: input.estimatedMinutes,
      schedule: startAt
        ? {
            kind: "timed",
            startAt,
            endAt: addMinutesToInstant(startAt, input.estimatedMinutes),
            timeZone,
          }
        : { kind: "none" },
      // A drop into an all-day cell is a due-date move; timed scheduling keeps Due independent.
      dueDate: startAt ? undefined : input.day,
    });
    if (result.conflict) return conflict(result.conflict);
    revalidateTaskViews();
    return {
      ok: true,
      entity: projectPlannerTaskToCalendarTask(result.entity!, timeZone),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCalendarTaskAction(input: {
  id: string;
  expectedVersion: number;
  clientMutationId: string;
}): Promise<CalendarTaskActionResult> {
  try {
    const access = await requireWorkspace();
    const db = getDb();
    const result = deleteTask(db, access, input);
    if (result.conflict) return conflict(result.conflict);
    revalidateTaskViews();
    return {
      ok: true,
      entity: projectPlannerTaskToCalendarTask(result.entity!, workspaceTimeZone(db, access.workspaceId)),
    };
  } catch (error) {
    return failure(error);
  }
}

function conflict(value: PlannerActionConflict<PlannerTask>): CalendarTaskActionResult {
  return { ok: false, conflict: value, error: "任务版本冲突" };
}

function failure(error: unknown): CalendarTaskActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "任务操作失败" };
}

function revalidateTaskViews(): void {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  revalidatePath("/day/[date]", "page");
}

function workspaceTimeZone(db: ReturnType<typeof getDb>, workspaceId: string): string {
  return (
    (db.prepare("SELECT timezone FROM workspaces WHERE id = ?").get(workspaceId) as { timezone: string } | undefined)
      ?.timezone ?? "Asia/Shanghai"
  );
}
