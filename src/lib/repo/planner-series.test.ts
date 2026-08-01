import { describe, expect, it } from "vitest";
import { createTestDb, createTestWorkspace } from "./testing";
import { ensurePlannerDefaults } from "./planner-defaults";
import { listTaskLists } from "./planner-lists";
import {
  createTaskSeries,
  getTaskSeries,
} from "./planner-series";
import {
  listPlannerTasks,
  updatePlannerTask,
} from "./planner-tasks";

describe("Planner recurring task series", () => {
  it("generates one fixed-schedule instance ahead across DST with stable occurrence keys", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    ensurePlannerDefaults(db, scope);
    const result = createTaskSeries(db, scope, {
      clientMutationId: "series-fixed-1",
      rrule: "FREQ=DAILY;COUNT=2",
      timezone: "America/New_York",
      generationMode: "fixed_schedule",
      firstOccurrenceAt: "2026-03-07T14:00:00.000Z",
      template: {
        listId: listTaskLists(db, scope)[0].id,
        title: "每日晨间复习",
        estimatedMinutes: 30,
      },
    });
    expect(result.series.next_occurrence_at).toBe("2026-03-08T13:00:00.000Z");
    expect(listPlannerTasks(db, scope)).toHaveLength(1);

    updatePlannerTask(db, scope, {
      id: result.task.id,
      expectedVersion: result.task.version,
      status: "completed",
    });
    const tasks = listPlannerTasks(db, scope);
    expect(tasks).toHaveLength(2);
    expect(tasks.find((task) => task.status === "open")).toMatchObject({
      scheduled_start_at: "2026-03-08T13:00:00.000Z",
      occurrence_key: "2026-03-08T13:00:00.000Z",
      series_id: result.series.id,
    });
    expect(getTaskSeries(db, scope, result.series.id)?.generated_count).toBe(2);
  });

  it("replays series creation and waits for completion before generating after-completion work", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    ensurePlannerDefaults(db, scope);
    const input = {
      clientMutationId: "series-after-1",
      rrule: "FREQ=DAILY;COUNT=3",
      timezone: "Asia/Shanghai",
      generationMode: "after_completion" as const,
      firstOccurrenceAt: "2026-07-31T01:00:00.000Z",
      template: {
        listId: listTaskLists(db, scope)[0].id,
        title: "完成后再安排",
        estimatedMinutes: 45,
      },
    };
    const first = createTaskSeries(db, scope, input);
    const replay = createTaskSeries(db, scope, { ...input, template: { ...input.template, title: "重试" } });
    expect(replay.task.id).toBe(first.task.id);
    expect(listPlannerTasks(db, scope)).toHaveLength(1);
    updatePlannerTask(db, scope, {
      id: first.task.id,
      expectedVersion: first.task.version,
      status: "completed",
    });
    expect(listPlannerTasks(db, scope).filter((task) => task.status === "open")).toHaveLength(1);
  });
});
