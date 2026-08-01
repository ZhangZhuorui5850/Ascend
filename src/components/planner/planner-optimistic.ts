import type { PlannerTask } from "@/lib/planner/types";

export type PlannerOptimisticMutation =
  | { type: "add"; task: PlannerTask; index?: number }
  | { type: "patch"; id: string; patch: Partial<PlannerTask> }
  | { type: "remove"; id: string }
  | { type: "replace"; temporaryId: string; task: PlannerTask }
  | { type: "restore"; task: PlannerTask; index: number };

export function plannerOptimisticReducer(
  state: PlannerTask[],
  mutation: PlannerOptimisticMutation,
): PlannerTask[] {
  if (mutation.type === "add" || mutation.type === "restore") {
    if (state.some((task) => task.id === mutation.task.id)) return state;
    const index = mutation.type === "restore"
      ? mutation.index
      : mutation.index ?? 0;
    return [
      ...state.slice(0, Math.max(0, index)),
      mutation.task,
      ...state.slice(Math.max(0, index)),
    ];
  }
  if (mutation.type === "remove") {
    return state.filter((task) => task.id !== mutation.id);
  }
  if (mutation.type === "replace") {
    const withoutSettledEntity = state.filter((task) => (
      task.id !== mutation.task.id || task.id === mutation.temporaryId
    ));
    if (!withoutSettledEntity.some((task) => task.id === mutation.temporaryId)) {
      return state;
    }
    return withoutSettledEntity.map((task) => (
      task.id === mutation.temporaryId ? mutation.task : task
    ));
  }
  return state.map((task) => (
    task.id === mutation.id ? { ...task, ...mutation.patch } : task
  ));
}

export function comparePlannerTasksClient(
  a: PlannerTask,
  b: PlannerTask,
): number {
  const aTime = a.scheduled_start_at ?? a.due_at ?? a.due_date ?? "";
  const bTime = b.scheduled_start_at ?? b.due_at ?? b.due_date ?? "";
  if (aTime && !bTime) return -1;
  if (!aTime && bTime) return 1;
  return aTime.localeCompare(bTime)
    || a.priority - b.priority
    || a.sort_order - b.sort_order
    || a.id.localeCompare(b.id);
}

export function reconcilePlannerSelection(
  tasks: PlannerTask[],
  selectedId: string | null,
  previousIndex: number,
): string | null {
  if (selectedId && tasks.some((task) => task.id === selectedId)) {
    return selectedId;
  }
  if (!tasks.length) return null;
  return tasks[Math.min(Math.max(previousIndex, 0), tasks.length - 1)]?.id
    ?? tasks[0].id;
}
