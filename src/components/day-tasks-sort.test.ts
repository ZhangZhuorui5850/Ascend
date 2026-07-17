import { describe, expect, it } from "vitest";
import type { DayTask } from "@/lib/repo/planner";
import { sortDayTasks } from "./day-tasks-sort";

function task(overrides: Partial<DayTask> & { id: number }): DayTask {
  return {
    day: "2026-07-17",
    title: `任务 ${overrides.id}`,
    subject_code: null,
    done: 0,
    sort_order: overrides.id,
    priority: 2,
    estimated_minutes: 30,
    scheduled_start: null,
    notes: "",
    ...overrides,
  };
}

describe("sortDayTasks mirrors listTasks ORDER BY", () => {
  it("puts scheduled tasks before unscheduled ones, ordered by start time", () => {
    const sorted = sortDayTasks([
      task({ id: 1 }),
      task({ id: 2, scheduled_start: "14:00" }),
      task({ id: 3, scheduled_start: "09:30" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([3, 2, 1]);
  });

  it("orders unscheduled tasks by priority, then sort_order, then id", () => {
    const sorted = sortDayTasks([
      task({ id: 1, priority: 3, sort_order: 1 }),
      task({ id: 2, priority: 1, sort_order: 9 }),
      task({ id: 3, priority: 2, sort_order: 5 }),
      task({ id: 4, priority: 2, sort_order: 2 }),
      task({ id: 6, priority: 2, sort_order: 2 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([2, 4, 6, 3, 1]);
  });

  it("lands an optimistic draft (max sort_order + 1, negative id) after peers of the same priority", () => {
    const existing = [
      task({ id: 1, priority: 2, sort_order: 1 }),
      task({ id: 2, priority: 2, sort_order: 2 }),
      task({ id: 3, priority: 3, sort_order: 3 }),
    ];
    const draft = task({ id: -1, priority: 2, sort_order: 3 });
    const sorted = sortDayTasks([...existing, draft]);
    expect(sorted.map((t) => t.id)).toEqual([1, 2, -1, 3]);
  });

  it("keeps three optimistic drafts in submission order", () => {
    const baseOrder = 7;
    const drafts = [-1, -2, -3].map((id, index) => task({
      id,
      priority: 2,
      sort_order: baseOrder + index + 1,
    }));
    expect(drafts.map((item) => item.sort_order)).toEqual([8, 9, 10]);
    expect(sortDayTasks(drafts).map((item) => item.id)).toEqual([-1, -2, -3]);
  });

  it("returns a new array and leaves the input untouched", () => {
    const input = [task({ id: 2 }), task({ id: 1 })];
    const sorted = sortDayTasks(input);
    expect(sorted).not.toBe(input);
    expect(input.map((t) => t.id)).toEqual([2, 1]);
  });
});
