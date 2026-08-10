import type { DayTaskItem } from "@/lib/repo/task-read-model";

// 镜像 listTasks 的 ORDER BY（src/lib/repo/planner.ts）：
// 已排时刻在前 → 时刻升序 → 优先级 → 手动顺序 → id。
// 乐观插入的临时行必须落在服务端回流后的同一位置，否则对账瞬间会跳位。
export function compareDayTasks(a: DayTaskItem, b: DayTaskItem): number {
  const aUnscheduled = a.scheduled_start ? 0 : 1;
  const bUnscheduled = b.scheduled_start ? 0 : 1;
  if (aUnscheduled !== bUnscheduled) return aUnscheduled - bUnscheduled;
  if (a.scheduled_start && b.scheduled_start && a.scheduled_start !== b.scheduled_start) {
    return a.scheduled_start < b.scheduled_start ? -1 : 1;
  }
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.id.localeCompare(b.id);
}

export function sortDayTasks<T extends DayTaskItem>(tasks: T[]): T[] {
  return [...tasks].sort(compareDayTasks);
}
