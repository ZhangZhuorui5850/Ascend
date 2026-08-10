import { describe, expect, it } from "vitest";
import type { DayTaskItem } from "@/lib/repo/task-read-model";
import { sortDayTasks } from "./day-tasks-sort";

function task(overrides: Partial<DayTaskItem> & { id: string }): DayTaskItem {
  return {
    version: 1,
    legacy_day_task_id: null,
    day: "2026-07-17",
    title: `任务 ${overrides.id}`,
    subject_code: null,
    status: "open",
    done: 0,
    sort_order: 0,
    priority: 2,
    estimated_minutes: 30,
    scheduled_start: null,
    notes: "",
    learning_link_version: 0,
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
    ...overrides,
  };
}

describe("sortDayTasks mirrors listTasks ORDER BY", () => {
  it("puts scheduled tasks before unscheduled ones, ordered by start time", () => {
    const sorted = sortDayTasks([
      task({ id: "1" }),
      task({ id: "2", scheduled_start: "14:00" }),
      task({ id: "3", scheduled_start: "09:30" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["3", "2", "1"]);
  });

  it("orders unscheduled tasks by priority, then sort_order, then id", () => {
    const sorted = sortDayTasks([
      task({ id: "1", priority: 3, sort_order: 1 }),
      task({ id: "2", priority: 1, sort_order: 9 }),
      task({ id: "3", priority: 2, sort_order: 5 }),
      task({ id: "4", priority: 2, sort_order: 2 }),
      task({ id: "6", priority: 2, sort_order: 2 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["2", "4", "6", "3", "1"]);
  });

  it("lands an optimistic UUID draft after peers of the same priority", () => {
    const existing = [
      task({ id: "1", priority: 2, sort_order: 1 }),
      task({ id: "2", priority: 2, sort_order: 2 }),
      task({ id: "3", priority: 3, sort_order: 3 }),
    ];
    const draft = task({ id: "draft-a", priority: 2, sort_order: 3, version: 0 });
    const sorted = sortDayTasks([...existing, draft]);
    expect(sorted.map((t) => t.id)).toEqual(["1", "2", "draft-a", "3"]);
  });

  it("keeps three optimistic drafts in submission order", () => {
    const baseOrder = 7;
    const drafts = ["draft-a", "draft-b", "draft-c"].map((id, index) => task({
      id,
      version: 0,
      priority: 2,
      sort_order: baseOrder + index + 1,
    }));
    expect(drafts.map((item) => item.sort_order)).toEqual([8, 9, 10]);
    expect(sortDayTasks(drafts).map((item) => item.id)).toEqual(["draft-a", "draft-b", "draft-c"]);
  });

  it("returns a new array and leaves the input untouched", () => {
    const input = [task({ id: "2" }), task({ id: "1" })];
    const sorted = sortDayTasks(input);
    expect(sorted).not.toBe(input);
    expect(input.map((t) => t.id)).toEqual(["2", "1"]);
  });
});
