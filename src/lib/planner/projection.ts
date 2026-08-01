import type { CalendarEvent, FullCalendarPlannerEvent, PlannerTask } from "./types";

export function projectEventToFullCalendar(event: CalendarEvent): FullCalendarPlannerEvent {
  if (event.all_day) {
    if (!event.start_date || !event.end_date_exclusive) {
      throw new Error("All-day event requires date bounds");
    }
    return {
      id: `event:${event.id}`,
      title: event.title,
      start: event.start_date,
      end: event.end_date_exclusive,
      allDay: true,
      classNames: ["planner-event", `planner-event-${event.kind}`],
      extendedProps: { entityType: "event", entityId: event.id, kind: event.kind },
    };
  }
  if (!event.start_at || !event.end_at || !event.timezone) {
    throw new Error("Timed event requires instant bounds and time zone");
  }
  return {
    id: `event:${event.id}`,
    title: event.title,
    start: event.start_at,
    end: event.end_at,
    allDay: false,
    classNames: ["planner-event", `planner-event-${event.kind}`],
    extendedProps: { entityType: "event", entityId: event.id, kind: event.kind },
  };
}

export function projectTaskToFullCalendar(task: PlannerTask): FullCalendarPlannerEvent | null {
  if (!task.scheduled_start_at || !task.scheduled_end_at || !task.scheduled_timezone) return null;
  return {
    id: `task:${task.id}`,
    title: task.title,
    start: task.scheduled_start_at,
    end: task.scheduled_end_at,
    allDay: task.scheduled_all_day === 1,
    classNames: [
      "planner-task-block",
      task.status === "completed" ? "planner-task-completed" : "planner-task-open",
    ],
    extendedProps: {
      entityType: "task",
      entityId: task.id,
      completed: task.status === "completed",
    },
  };
}
