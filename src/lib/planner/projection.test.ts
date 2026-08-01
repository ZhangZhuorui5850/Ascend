import { describe, expect, it } from "vitest";
import { projectEventToFullCalendar, projectTaskToFullCalendar } from "./projection";
import type { CalendarEvent, PlannerTask } from "./types";

describe("FullCalendar Planner projections", () => {
  it("preserves exclusive end dates for all-day and multi-day events", () => {
    const projection = projectEventToFullCalendar(event({
      all_day: 1,
      start_date: "2026-08-01",
      end_date_exclusive: "2026-08-04",
      start_at: null,
      end_at: null,
      timezone: null,
    }));
    expect(projection).toMatchObject({
      start: "2026-08-01",
      end: "2026-08-04",
      allDay: true,
      extendedProps: { entityType: "event", entityId: "event-1" },
    });
  });

  it("keeps timed event instants unchanged", () => {
    const projection = projectEventToFullCalendar(event({
      start_at: "2026-07-31T01:00:00.000Z",
      end_at: "2026-07-31T02:30:00.000Z",
      timezone: "Asia/Shanghai",
    }));
    expect(projection).toMatchObject({
      start: "2026-07-31T01:00:00.000Z",
      end: "2026-07-31T02:30:00.000Z",
      allDay: false,
    });
  });

  it("projects scheduled tasks and leaves unscheduled tasks out of the timeline", () => {
    expect(projectTaskToFullCalendar(task())).toMatchObject({
      id: "task:task-1",
      start: "2026-07-31T01:00:00.000Z",
      end: "2026-07-31T02:00:00.000Z",
      extendedProps: { entityType: "task", completed: false },
    });
    expect(projectTaskToFullCalendar(task({
      scheduled_start_at: null,
      scheduled_end_at: null,
      scheduled_timezone: null,
    }))).toBeNull();
  });
});

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    workspace_id: "workspace-a",
    calendar_id: "calendar-a",
    title: "矩阵复习",
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
    ...overrides,
  };
}

function task(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    id: "task-1",
    workspace_id: "workspace-a",
    list_id: "list-a",
    parent_task_id: null,
    depth: 0,
    title: "完成矩阵题",
    notes: "",
    subject_code: null,
    status: "open",
    priority: 2,
    due_date: "2026-08-01",
    due_at: null,
    due_timezone: null,
    scheduled_start_at: "2026-07-31T01:00:00.000Z",
    scheduled_end_at: "2026-07-31T02:00:00.000Z",
    scheduled_timezone: "Asia/Shanghai",
    scheduled_all_day: 0,
    estimated_minutes: 60,
    series_id: null,
    occurrence_key: null,
    sort_order: 1,
    deleted_at: null,
    completed_at: null,
    canceled_at: null,
    version: 1,
    legacy_day_task_id: null,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}
