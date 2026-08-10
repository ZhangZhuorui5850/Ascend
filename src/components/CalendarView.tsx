"use client";

import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
import type {
  CalendarEvent,
  PlannerCalendar,
  PlannerReminder,
} from "@/lib/planner/types";
import type { CalendarTask } from "@/lib/repo/planner-calendar-tasks";
import type { ExamCountdown } from "@/lib/repo/settings";

export function CalendarView(props: {
  tasks: CalendarTask[];
  exams: ExamCountdown[];
  plannerEvents: CalendarEvent[];
  calendars: PlannerCalendar[];
  timeZone: string;
  reminders: PlannerReminder[];
}) {
  return <CalendarWorkspace {...props} />;
}
