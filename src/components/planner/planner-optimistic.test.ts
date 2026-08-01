import { describe, expect, it } from "vitest";
import type { PlannerTask } from "@/lib/planner/types";
import {
  comparePlannerTasksClient,
  plannerOptimisticReducer,
  reconcilePlannerSelection,
} from "./planner-optimistic";

function task(id: string, patch: Partial<PlannerTask> = {}): PlannerTask {
  return {
    id,
    status: "open",
    priority: 2,
    sort_order: 0,
    scheduled_start_at: null,
    due_at: null,
    due_date: null,
    ...patch,
  } as PlannerTask;
}

describe("Planner Tasks optimistic state", () => {
  it("adds, replaces, patches, removes, and restores at the original index", () => {
    const initial = [task("a"), task("b"), task("c")];
    const added = plannerOptimisticReducer(initial, {
      type: "add",
      task: task("draft"),
      index: 1,
    });
    expect(added.map((item) => item.id)).toEqual(["a", "draft", "b", "c"]);

    const replaced = plannerOptimisticReducer(added, {
      type: "replace",
      temporaryId: "draft",
      task: task("real"),
    });
    expect(replaced.map((item) => item.id)).toEqual(["a", "real", "b", "c"]);

    const patched = plannerOptimisticReducer(replaced, {
      type: "patch",
      id: "b",
      patch: { status: "completed" },
    });
    expect(patched.find((item) => item.id === "b")?.status).toBe("completed");

    const removed = plannerOptimisticReducer(patched, { type: "remove", id: "b" });
    const restored = plannerOptimisticReducer(removed, {
      type: "restore",
      task: initial[1],
      index: 2,
    });
    expect(restored.map((item) => item.id)).toEqual(["a", "real", "b", "c"]);
  });

  it("mirrors repo order for time, priority, sort order, and id", () => {
    const items = [
      task("late", { due_date: "2026-08-02", priority: 1 }),
      task("free", { priority: 1 }),
      task("b", { due_date: "2026-08-01", priority: 2, sort_order: 1 }),
      task("a", { due_date: "2026-08-01", priority: 2, sort_order: 1 }),
    ];
    expect([...items].sort(comparePlannerTasksClient).map((item) => item.id))
      .toEqual(["a", "b", "late", "free"]);
  });

  it("deduplicates a created entity when the refreshed RSC arrives before draft replacement", () => {
    const refreshedDuringTransition = [task("draft"), task("real"), task("a")];
    const settled = plannerOptimisticReducer(refreshedDuringTransition, {
      type: "replace",
      temporaryId: "draft",
      task: task("real"),
    });
    expect(settled.map((item) => item.id)).toEqual(["real", "a"]);
  });

  it("keeps valid selection and chooses the nearest surviving task", () => {
    expect(reconcilePlannerSelection([task("a"), task("b")], "b", 1)).toBe("b");
    expect(reconcilePlannerSelection([task("a"), task("c")], "b", 1)).toBe("c");
    expect(reconcilePlannerSelection([], "b", 0)).toBeNull();
  });
});
