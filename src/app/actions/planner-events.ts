"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { localDateTimeToUtc } from "@/lib/planner/time";
import type {
  CalendarEvent,
  PlannerActionConflict,
  PlannerBusyStatus,
  PlannerEventKind,
} from "@/lib/planner/types";
import {
  createCalendarEvent,
  softDeleteCalendarEvent,
  updateCalendarEvent,
} from "@/lib/repo/planner-events";
import { requireWorkspace } from "@/lib/request-auth";

type EventActionResult = {
  ok: boolean;
  entity?: CalendarEvent;
  conflict?: PlannerActionConflict<CalendarEvent>;
  error?: string;
};

type EventCommonInput = {
  clientMutationId: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  kind?: PlannerEventKind;
  busyStatus?: PlannerBusyStatus;
  recurrenceRule?: string | null;
};

type CreateEventActionInput = EventCommonInput & (
  | { allDay: true; startDate: string; endDateExclusive: string }
  | {
      allDay: false;
      startDate: string;
      startTime: string;
      endDate: string;
      endTime: string;
    }
);

export async function createPlannerEventAction(input: CreateEventActionInput): Promise<EventActionResult> {
  try {
    const access = await requireWorkspace();
    const db = getDb();
    const timeZone = workspaceTimeZone(db, access.workspaceId);
    const common = {
      clientMutationId: input.clientMutationId,
      calendarId: input.calendarId,
      title: input.title,
      description: input.description,
      location: input.location,
      url: input.url,
      kind: input.kind,
      busyStatus: input.busyStatus,
      recurrenceRule: input.recurrenceRule,
    };
    const entity = input.allDay
      ? createCalendarEvent(db, access, {
          ...common,
          allDay: true,
          startDate: input.startDate,
          endDateExclusive: input.endDateExclusive,
        })
      : createCalendarEvent(db, access, {
          ...common,
          allDay: false,
          startAt: localDateTimeToUtc({
            date: input.startDate,
            time: input.startTime,
            timeZone,
          }),
          endAt: localDateTimeToUtc({
            date: input.endDate,
            time: input.endTime,
            timeZone,
          }),
          timezone: timeZone,
        });
    revalidateCalendar();
    return { ok: true, entity };
  } catch (error) {
    return failure(error);
  }
}

export async function updatePlannerEventAction(input: {
  id: string;
  expectedVersion: number;
  calendarId?: string;
  title?: string;
  description?: string;
  location?: string;
  url?: string;
  kind?: PlannerEventKind;
  busyStatus?: PlannerBusyStatus;
  allDay?: boolean;
  startAt?: string;
  endAt?: string;
  timezone?: string;
  startDate?: string;
  endDateExclusive?: string;
}): Promise<EventActionResult> {
  try {
    const access = await requireWorkspace();
    const result = updateCalendarEvent(getDb(), access, input);
    if (result.conflict) return { ok: false, conflict: result.conflict, error: "事件版本冲突" };
    revalidateCalendar();
    return { ok: true, entity: result.entity };
  } catch (error) {
    return failure(error);
  }
}

export async function deletePlannerEventAction(input: {
  id: string;
  expectedVersion: number;
  clientMutationId: string;
}): Promise<EventActionResult> {
  try {
    const access = await requireWorkspace();
    const result = softDeleteCalendarEvent(getDb(), access, input);
    if (result.conflict) return { ok: false, conflict: result.conflict, error: "事件版本冲突" };
    revalidateCalendar();
    return { ok: true, entity: result.entity };
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

function revalidateCalendar(): void {
  revalidatePath("/");
  revalidatePath("/calendar");
}

function failure(error: unknown): EventActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "事件操作失败" };
}
