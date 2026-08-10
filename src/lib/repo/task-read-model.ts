import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey } from "../dates";
import type { PlannerTask, PlannerTaskStatus } from "../planner/types";
import { utcToZonedDateTime } from "../planner/time";
import { listPlannerTasks } from "./planner-tasks";

export type DayTaskItem = {
  id: string;
  version: number;
  legacy_day_task_id: number | null;
  day: string;
  title: string;
  subject_code: string | null;
  status: PlannerTaskStatus;
  done: 0 | 1;
  sort_order: number;
  priority: 1 | 2 | 3;
  estimated_minutes: number;
  scheduled_start: string | null;
  notes: string;
  knowledge_point_id: string | null;
  activity_type: string;
  completion_criteria: string;
  source_type: string;
  source_id: string;
  actual_minutes: number | null;
  completion_output: string;
  planned_verification_method: string;
  verification_method: string;
  verification_result: string;
  verification_outcome: "" | "improved" | "unchanged" | "regressed" | "unknown";
};

/**
 * Canonical Home/Day projection. It intentionally never manufactures a numeric
 * ID for Planner-only tasks: every consumer receives the Planner UUID/version.
 */
export function listDayTaskItems(
  db: Database.Database,
  scope: WorkspaceScope,
  day: string,
): DayTaskItem[] {
  assertDateKey(day);
  return listPlannerTasks(db, scope)
    .flatMap((task) => {
      const scheduled = localSchedule(task);
      const dueDay = localDueDay(task);
      if (scheduled?.date !== day && dueDay !== day) return [];
      return [projectDayTask(task, day, scheduled?.time.slice(0, 5) ?? null)];
    })
    .sort(compareDayTaskItems);
}

function projectDayTask(
  task: PlannerTask,
  day: string,
  scheduledStart: string | null,
): DayTaskItem {
  return {
    id: task.id,
    version: task.version,
    legacy_day_task_id: task.legacy_day_task_id,
    day,
    title: task.title,
    subject_code: task.subject_code,
    status: task.status,
    done: task.status === "completed" ? 1 : 0,
    sort_order: task.sort_order,
    priority: task.priority,
    estimated_minutes: task.estimated_minutes,
    scheduled_start: scheduledStart,
    notes: task.notes,
    knowledge_point_id: null,
    activity_type: "unspecified",
    completion_criteria: "",
    source_type: "",
    source_id: "",
    actual_minutes: null,
    completion_output: "",
    planned_verification_method: "",
    verification_method: "",
    verification_result: "",
    verification_outcome: "",
  };
}

function localSchedule(task: PlannerTask): { date: string; time: string } | null {
  return task.scheduled_start_at && task.scheduled_timezone
    ? utcToZonedDateTime(task.scheduled_start_at, task.scheduled_timezone)
    : null;
}

function localDueDay(task: PlannerTask): string | null {
  if (task.due_date) return task.due_date;
  return task.due_at && task.due_timezone
    ? utcToZonedDateTime(task.due_at, task.due_timezone).date
    : null;
}

function compareDayTaskItems(a: DayTaskItem, b: DayTaskItem): number {
  if (a.scheduled_start && !b.scheduled_start) return -1;
  if (!a.scheduled_start && b.scheduled_start) return 1;
  return (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? "")
    || a.priority - b.priority
    || a.sort_order - b.sort_order
    || a.id.localeCompare(b.id);
}
