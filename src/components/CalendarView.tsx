"use client";

import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
import type {
  CalendarEvent,
  PlannerCalendar,
  PlannerReminder,
} from "@/lib/planner/types";
import type { DayTask } from "@/lib/repo/planner";
import type { ExamCountdown } from "@/lib/repo/settings";

export function CalendarView(props: {
  tasks: DayTask[];
  exams: ExamCountdown[];
  plannerEvents: CalendarEvent[];
  calendars: PlannerCalendar[];
  timeZone: string;
  reminders: PlannerReminder[];
}) {
  return <CalendarWorkspace {...props} />;
}
