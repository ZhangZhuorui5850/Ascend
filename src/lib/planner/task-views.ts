import { utcToZonedDateTime } from "@/lib/planner/time";
import type { PlannerTask } from "@/lib/planner/types";

export type PlannerTaskView =
  "inbox" | "today" | "upcoming" | "anytime" | "overdue" | "waiting" | "completed" | "trash" | "all";

export type PlannerTaskViewContext = {
  today: string;
  upcomingEnd: string;
  now: string;
  inboxId?: string;
};

export const PLANNER_TASK_VIEW_IDS = [
  "inbox",
  "today",
  "upcoming",
  "anytime",
  "overdue",
  "waiting",
  "completed",
  "trash",
  "all",
] as const satisfies readonly PlannerTaskView[];

export function isPlannerTaskView(value: string | undefined): value is PlannerTaskView {
  return PLANNER_TASK_VIEW_IDS.some((view) => view === value);
}

/**
 * Keep task-view semantics pure and shared by the server read model and the
 * mounted Tasks workspace. A view switch can therefore reuse the prefetched
 * task source without issuing another route request.
 */
export function filterPlannerTaskView(
  tasks: PlannerTask[],
  view: PlannerTaskView,
  context: PlannerTaskViewContext,
  input: { listId?: string; limit?: number } = {},
): PlannerTask[] {
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 1000);
  const now = new Date(context.now);

  return tasks
    .filter((task) => !input.listId || task.list_id === input.listId)
    .filter((task) => taskMatchesView(task, view, { ...context, now }))
    .sort(comparePlannerTasks)
    .slice(0, limit);
}

function taskMatchesView(
  task: PlannerTask,
  view: PlannerTaskView,
  context: Omit<PlannerTaskViewContext, "now"> & { now: Date },
): boolean {
  if (view === "trash") return task.deleted_at !== null;
  if (task.deleted_at) return false;
  if (view === "completed") return task.status === "completed";
  if (view === "all") return true;
  if (view === "waiting") return task.status === "waiting";
  if (task.status !== "open" && task.status !== "waiting") return false;

  const dueDate =
    task.due_date ??
    (task.due_at && task.due_timezone ? utcToZonedDateTime(task.due_at, task.due_timezone).date : null);
  const scheduledDate =
    task.scheduled_start_at && task.scheduled_timezone
      ? utcToZonedDateTime(task.scheduled_start_at, task.scheduled_timezone).date
      : null;

  if (view === "inbox") return task.list_id === context.inboxId;
  if (view === "today") return dueDate === context.today || scheduledDate === context.today;
  if (view === "upcoming") {
    return [dueDate, scheduledDate].some(
      (date) => date !== null && date > context.today && date <= context.upcomingEnd,
    );
  }
  if (view === "anytime") return !dueDate && !scheduledDate;
  if (view === "overdue") {
    return (
      (task.due_date !== null && task.due_date < context.today) ||
      (task.due_at !== null && new Date(task.due_at) < context.now)
    );
  }
  return false;
}

export function comparePlannerTasks(a: PlannerTask, b: PlannerTask): number {
  const aTime = a.scheduled_start_at ?? a.due_at ?? a.due_date ?? "";
  const bTime = b.scheduled_start_at ?? b.due_at ?? b.due_date ?? "";
  if (aTime && !bTime) return -1;
  if (!aTime && bTime) return 1;
  return (
    aTime.localeCompare(bTime) || a.priority - b.priority || a.sort_order - b.sort_order || a.id.localeCompare(b.id)
  );
}
