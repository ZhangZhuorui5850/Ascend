import { describe, expect, it } from "vitest";
import type { CalendarEvent, PlannerCalendar } from "@/lib/planner/types";
import type { CalendarTask } from "@/lib/repo/planner-calendar-tasks";
import type { ExamCountdown } from "@/lib/repo/settings";
import {
  buildCalendarAgendaRows,
  buildCalendarEvents,
  calendarEventReducer,
  calendarEventDay,
  collectAgendaDays,
  createCalendarRangeGate,
} from "./calendar-events";
import { calendarTaskReducer } from "./calendar-tasks";

function task(id: string, patch: Partial<CalendarTask> = {}): CalendarTask {
  return {
    id,
    version: 1,
    day: "2026-07-31",
    title: `任务 ${id}`,
    subject_code: null,
    done: 0,
    priority: 2,
    estimated_minutes: 30,
    scheduled_start: null,
    ...patch,
  };
}

function event(id: string, patch: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    workspace_id: "workspace-a",
    calendar_id: "calendar-a",
    title: `事件 ${id}`,
    description: "",
    location: "",
    url: "",
    subject_code: null,
    kind: "event",
    busy_status: "busy",
    start_at: "2026-07-31T01:00:00.000Z",
    end_at: "2026-07-31T02:00:00.000Z",
    timezone: "Asia/Shanghai",
    start_date: null,
    end_date_exclusive: null,
    all_day: 0,
    recurrence_rule: null,
    recurrence_until: null,
    recurring_event_id: null,
    original_start_at: null,
    exception_kind: null,
    migration_key: null,
    deleted_at: null,
    version: 1,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
    ...patch,
  };
}

const calendars = [{
  id: "calendar-a",
  workspace_id: "workspace-a",
  name: "学习",
  color_token: "cinnabar",
  is_default: 1,
  archived_at: null,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
}] as PlannerCalendar[];

describe("Calendar event projection and optimistic state", () => {
  it("skips a completely unscheduled task in the time canvas and keeps agenda sorting safe", () => {
    const unscheduled = task("task-unscheduled", { day: "" });
    const scheduled = task("task-scheduled", { day: "2026-08-01", scheduled_start: "09:00" });

    const projected = buildCalendarEvents({
      calendars,
      exams: [],
      plannerEvents: [],
      tasks: [unscheduled, scheduled],
    });

    expect(projected.map((item) => item.id)).toEqual(["task-task-scheduled"]);
    expect(collectAgendaDays([unscheduled, scheduled], [], [])).toEqual(["2026-08-01"]);
  });

  it("projects task, planner event, and milestone content with stable entity semantics", () => {
    const exams = [{ name: "省考", date: "2026-08-02", targetScore: 130 }] as ExamCountdown[];
    const projected = buildCalendarEvents({
      calendars,
      exams,
      plannerEvents: [event("event-a")],
      tasks: [task("task-a")],
    });

    expect(projected.map((item) => item.extendedProps?.entityType))
      .toEqual(["task", "event", "milestone"]);
    expect(projected[0].extendedProps).toMatchObject({
      taskId: "task-a",
      taskVersion: 1,
    });
  });

  it("groups timed events by their event timezone across UTC midnight", () => {
    expect(calendarEventDay(event("event-zone", {
      start_at: "2026-07-31T23:30:00.000Z",
      end_at: "2026-08-01T00:30:00.000Z",
      timezone: "Asia/Shanghai",
    }))).toBe("2026-08-01");
  });

  it("groups agenda entities in one pass and expands all-day spans", () => {
    const rows = buildCalendarAgendaRows({
      events: [
        event("timed"),
        event("all-day", {
          all_day: 1,
          start_at: null,
          end_at: null,
          start_date: "2026-08-01",
          end_date_exclusive: "2026-08-03",
        }),
      ],
      exams: [{ name: "省考", date: "2026-08-02", targetScore: 130 }] as ExamCountdown[],
      tasks: [task("task-a")],
    });

    expect(rows.map((row) => row.day)).toEqual([
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
    expect(rows[0].tasks).toHaveLength(1);
    expect(rows[1].events.map((item) => item.id)).toEqual(["all-day"]);
    expect(rows[2].events.map((item) => item.id)).toEqual(["all-day"]);
    expect(rows[2].exams).toHaveLength(1);
  });

  it("accepts only the newest visible-range response", () => {
    const gate = createCalendarRangeGate();
    const first = gate.issue();
    const second = gate.issue();

    expect(gate.accepts(first)).toBe(false);
    expect(gate.accepts(second)).toBe(true);
  });

  it("keeps canonical task identity and version through optimistic mutations", () => {
    const original = task("canonical-task", { version: 4 });
    const patched = calendarTaskReducer([original], {
      type: "patch",
      id: original.id,
      patch: { done: 1, version: 5 },
    });
    expect(patched[0]).toMatchObject({ id: "canonical-task", done: 1, version: 5 });

    const removed = calendarTaskReducer(patched, { type: "remove", id: original.id });
    expect(removed).toEqual([]);
    expect(calendarTaskReducer(removed, { type: "restore", task: original, index: 0 }))
      .toEqual([original]);
  });

  it("patches, restores, replaces drafts, and removes calendar entities", () => {
    const original = event("event-a");
    const patched = calendarEventReducer([original], {
      type: "patch",
      id: original.id,
      patch: { title: "已改期" },
    });
    expect(patched[0].title).toBe("已改期");

    const restored = calendarEventReducer(patched, { type: "restore", event: original });
    expect(restored[0]).toEqual(original);

    const withDraft = calendarEventReducer(restored, {
      type: "add",
      event: event("draft:event"),
    });
    const replaced = calendarEventReducer(withDraft, {
      type: "replace",
      temporaryId: "draft:event",
      event: event("event-b"),
    });
    expect(replaced.map((item) => item.id)).toEqual(["event-a", "event-b"]);
    expect(calendarEventReducer(replaced, { type: "remove", id: "event-b" }))
      .toEqual([original]);
  });
});
