import type { CalendarTask } from "@/lib/repo/planner-calendar-tasks";

export type OptimisticCalendarTask = CalendarTask & { pending?: boolean };

export type CalendarTaskMutation =
  | { type: "add"; task: OptimisticCalendarTask }
  | { type: "patch"; id: string; patch: Partial<OptimisticCalendarTask> }
  | { type: "remove"; id: string }
  | { type: "replace"; temporaryId: string; task: CalendarTask }
  | { type: "restore"; task: OptimisticCalendarTask; index: number };

export function calendarTaskReducer(
  state: OptimisticCalendarTask[],
  mutation: CalendarTaskMutation,
): OptimisticCalendarTask[] {
  if (mutation.type === "add") return [...state, mutation.task];
  if (mutation.type === "remove") return state.filter((task) => task.id !== mutation.id);
  if (mutation.type === "replace") {
    return state.map((task) => (task.id === mutation.temporaryId ? mutation.task : task));
  }
  if (mutation.type === "restore") {
    const next = [...state];
    next.splice(Math.max(0, mutation.index), 0, mutation.task);
    return next;
  }
  return state.map((task) => (task.id === mutation.id ? { ...task, ...mutation.patch } : task));
}
