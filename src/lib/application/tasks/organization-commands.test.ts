import { describe, expect, it } from "vitest";
import { createPlannerLabel, listPlannerTaskLabelIds } from "../../repo/planner-labels";
import { ensurePlannerDefaults } from "../../repo/planner-defaults";
import { listTaskLists } from "../../repo/planner-lists";
import { createPlannerTask, listPlannerTasks } from "../../repo/planner-tasks";
import { createTestDb, createTestWorkspace } from "../../repo/testing";
import { createRecurringTask, setTaskLabels } from "./organization-commands";

function setup() {
  const db = createTestDb();
  const scope = createTestWorkspace(db, { email: "task-organization@example.com" });
  ensurePlannerDefaults(db, scope);
  return { db, scope, listId: listTaskLists(db, scope)[0].id };
}

describe("task organization commands", () => {
  it("creates a recurring series and its first occurrence as one idempotent command", () => {
    const { db, scope, listId } = setup();
    const input = {
      clientMutationId: "series-command-1",
      rrule: "FREQ=DAILY;COUNT=2",
      timezone: "Asia/Shanghai",
      generationMode: "fixed_schedule" as const,
      firstOccurrenceAt: "2026-08-10T01:00:00.000Z",
      template: { listId, title: "晨间复习", estimatedMinutes: 30 },
    };

    const created = createRecurringTask(db, scope, input);
    const replay = createRecurringTask(db, scope, { ...input, template: { ...input.template, title: "重放" } });

    expect(replay.series.id).toBe(created.series.id);
    expect(replay.task.id).toBe(created.task.id);
    expect(listPlannerTasks(db, scope)).toHaveLength(1);
  });

  it("changes labels and task version atomically while rejecting stale versions", () => {
    const { db, scope, listId } = setup();
    const task = createPlannerTask(db, scope, {
      clientMutationId: "label-task",
      listId,
      title: "带标签任务",
    });
    const first = createPlannerLabel(db, scope, { name: "重点", colorToken: "cinnabar" });
    const second = createPlannerLabel(db, scope, { name: "复习", colorToken: "summit-blue" });

    const updated = setTaskLabels(db, scope, {
      taskId: task.id,
      expectedVersion: task.version,
      labelIds: [first.id, second.id, first.id],
    });
    expect(updated.version).toBe(task.version + 1);
    expect(listPlannerTaskLabelIds(db, scope)[task.id]).toEqual([first.id, second.id].sort());

    expect(() => setTaskLabels(db, scope, {
      taskId: task.id,
      expectedVersion: task.version,
      labelIds: [],
    })).toThrow("任务版本冲突");
    expect(listPlannerTaskLabelIds(db, scope)[task.id]).toEqual([first.id, second.id].sort());
  });
});
