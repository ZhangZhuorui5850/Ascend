import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { utcToZonedDateTime } from "../planner/time";
import type { PlannerTask } from "../planner/types";
import { listPlannerTasks } from "./planner-tasks";

export type CalendarTask = {
  id: string;
  version: number;
  day: string;
  title: string;
  subject_code: string | null;
  done: 0 | 1;
  priority: 1 | 2 | 3;
  estimated_minutes: number;
  scheduled_start: string | null;
};

/** Canonical Planner task read model consumed by Calendar. */
export function listCanonicalCalendarTasks(
  db: Database.Database,
  scope: WorkspaceScope,
  fallbackTimeZone: string,
): CalendarTask[] {
  return listPlannerTasks(db, scope)
    .filter((task) => task.status !== "canceled")
    .map((task) => projectPlannerTaskToCalendarTask(task, fallbackTimeZone));
}

export function projectPlannerTaskToCalendarTask(task: PlannerTask, fallbackTimeZone: string): CalendarTask {
  const scheduled = task.scheduled_start_at
    ? utcToZonedDateTime(task.scheduled_start_at, task.scheduled_timezone ?? fallbackTimeZone)
    : null;
  const due = task.due_at ? utcToZonedDateTime(task.due_at, task.due_timezone ?? fallbackTimeZone) : null;
  return {
    id: task.id,
    version: task.version,
    day: scheduled?.date ?? task.due_date ?? due?.date ?? "",
    title: task.title,
    subject_code: task.subject_code,
    done: task.status === "completed" ? 1 : 0,
    priority: task.priority,
    estimated_minutes: task.estimated_minutes,
    scheduled_start: task.scheduled_all_day ? null : (scheduled?.time.slice(0, 5) ?? null),
  };
}
