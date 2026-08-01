import type { EventInput } from "@fullcalendar/core";
import type { CalendarEvent, PlannerCalendar } from "@/lib/planner/types";
import type { DayTask } from "@/lib/repo/planner";
import type { ExamCountdown } from "@/lib/repo/settings";
import { utcToZonedDateTime } from "@/lib/planner/time";

export type CalendarEventMutation =
  | { type: "add"; event: CalendarEvent }
  | { type: "patch"; id: string; patch: Partial<CalendarEvent> }
  | { type: "remove"; id: string }
  | { type: "replace"; temporaryId: string; event: CalendarEvent }
  | { type: "restore"; event: CalendarEvent };

export type CalendarAgendaRow = {
  day: string;
  tasks: DayTask[];
  exams: ExamCountdown[];
  events: CalendarEvent[];
};

export function calendarEventReducer(
  state: CalendarEvent[],
  mutation: CalendarEventMutation,
): CalendarEvent[] {
  if (mutation.type === "add") {
    return state.some((event) => event.id === mutation.event.id)
      ? state
      : [...state, mutation.event];
  }
  if (mutation.type === "remove") {
    return state.filter((event) => event.id !== mutation.id);
  }
  if (mutation.type === "restore") {
    return state.map((event) => (
      event.id === mutation.event.id ? mutation.event : event
    ));
  }
  if (mutation.type === "replace") {
    const existing = state.filter((event) => (
      event.id !== mutation.event.id || event.id === mutation.temporaryId
    ));
    if (!existing.some((event) => event.id === mutation.temporaryId)) return state;
    return existing.map((event) => (
      event.id === mutation.temporaryId ? mutation.event : event
    ));
  }
  return state.map((event) => (
    event.id === mutation.id ? { ...event, ...mutation.patch } : event
  ));
}

export function buildCalendarEvents({
  calendars,
  exams,
  plannerEvents,
  tasks,
}: {
  calendars: PlannerCalendar[];
  exams: ExamCountdown[];
  plannerEvents: CalendarEvent[];
  tasks: DayTask[];
}): EventInput[] {
  const taskEvents: EventInput[] = tasks
    .filter((task) => Boolean(task.day))
    .map((task) => {
      const start = task.scheduled_start ? `${task.day}T${task.scheduled_start}:00` : task.day;
      const end = task.scheduled_start ? addMinutes(start, task.estimated_minutes) : undefined;
      return {
        id: `task-${task.id}`,
        title: `${task.subject_code ? `${task.subject_code} · ` : ""}${task.title}`,
        start,
        end,
        allDay: !task.scheduled_start,
        editable: !task.done,
        classNames: [
          "eventTask",
          `eventPriority${task.priority}`,
          task.done ? "eventTaskDone" : "",
        ].filter(Boolean),
        extendedProps: {
          entityType: "task",
          kind: "task",
          taskId: task.id,
          previousDay: task.day,
        },
      };
    });
  const plannerEventInputs: EventInput[] = plannerEvents.map((event) => {
    const calendar = calendars.find((item) => item.id === event.calendar_id);
    return {
      id: `event-${event.id}`,
      title: event.location ? `${event.title} · ${event.location}` : event.title,
      start: event.all_day ? event.start_date! : event.start_at!,
      end: event.all_day ? event.end_date_exclusive! : event.end_at!,
      allDay: Boolean(event.all_day),
      editable: event.version > 0,
      classNames: [
        "eventPlanner",
        `eventKind-${event.kind}`,
        event.busy_status === "free" ? "eventFree" : "",
        calendar ? `calendar-${calendar.color_token}` : "",
      ].filter(Boolean),
      extendedProps: {
        entityType: "event",
        eventId: event.id,
        kind: event.kind,
        version: event.version,
      },
    };
  });
  const examEvents: EventInput[] = exams
    .filter((exam) => Boolean(exam.date))
    .map((exam, index) => ({
      id: `exam-${index}`,
      title: `考试 · ${exam.name}${exam.targetScore ? ` · 目标 ${exam.targetScore}` : ""}`,
      date: exam.date,
      allDay: true,
      editable: false,
      classNames: ["eventMilestone"],
      extendedProps: { entityType: "milestone", kind: "exam" },
    }));
  return [...taskEvents, ...plannerEventInputs, ...examEvents];
}

export function collectAgendaDays(
  tasks: DayTask[],
  exams: ExamCountdown[],
  events: CalendarEvent[],
): string[] {
  return [...new Set([
    ...tasks.map((item) => item.day),
    ...exams.map((item) => item.date),
    ...events.map(calendarEventDay),
  ].filter((day): day is string => Boolean(day)))]
    .sort((a, b) => a.localeCompare(b));
}

export function buildCalendarAgendaRows({
  events,
  exams,
  tasks,
}: {
  events: CalendarEvent[];
  exams: ExamCountdown[];
  tasks: DayTask[];
}): CalendarAgendaRow[] {
  const rows = new Map<string, CalendarAgendaRow>();
  const rowFor = (day: string) => {
    const current = rows.get(day);
    if (current) return current;
    const row = { day, tasks: [], exams: [], events: [] };
    rows.set(day, row);
    return row;
  };

  for (const task of tasks) {
    if (task.day) rowFor(task.day).tasks.push(task);
  }
  for (const exam of exams) {
    if (exam.date) rowFor(exam.date).exams.push(exam);
  }
  for (const event of events) {
    if (!event.all_day) {
      const day = calendarEventDay(event);
      if (day) rowFor(day).events.push(event);
      continue;
    }
    if (!event.start_date) continue;
    const end = event.end_date_exclusive && event.end_date_exclusive > event.start_date
      ? event.end_date_exclusive
      : shiftDateKey(event.start_date, 1);
    let day = event.start_date;
    for (let offset = 0; day < end && offset < 366; offset += 1) {
      rowFor(day).events.push(event);
      day = shiftDateKey(day, 1);
    }
  }

  return [...rows.values()].sort((left, right) => left.day.localeCompare(right.day));
}

export function calendarEventDay(event: CalendarEvent): string | null {
  if (event.all_day) return event.start_date;
  if (!event.start_at) return null;
  return utcToZonedDateTime(event.start_at, event.timezone ?? "UTC").date;
}

export function createCalendarRangeGate(): {
  issue: () => number;
  accepts: (requestId: number) => boolean;
} {
  let latestRequestId = 0;
  return {
    issue() {
      latestRequestId += 1;
      return latestRequestId;
    },
    accepts(requestId) {
      return requestId === latestRequestId;
    },
  };
}

function shiftDateKey(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function addMinutes(start: string, minutes: number): string {
  const date = new Date(start);
  date.setMinutes(date.getMinutes() + minutes);
  return `${localDateKey(date)}T${localTimeKey(date)}:00`;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTimeKey(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
