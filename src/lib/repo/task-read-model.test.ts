import { describe, expect, it } from "vitest";
import { createTask, completeTask } from "../application/tasks/commands";
import { addTask } from "./planner";
import { createTestDb, createTestWorkspace } from "./testing";
import { listDayTaskItems } from "./task-read-model";

describe("canonical day task read model", () => {
  it("shows Planner-only and mirrored legacy tasks with stable UUID identities", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const day = "2026-08-10";
    const plannerOnly = createTask(db, scope, {
      clientMutationId: "day-read-planner",
      title: "Planner only",
      dueDate: day,
    });
    const legacy = addTask(db, scope, { day, title: "Legacy mirrored" });

    expect(listDayTaskItems(db, scope, day).map((task) => ({
      id: task.id,
      legacyId: task.legacy_day_task_id,
      title: task.title,
    })).sort((a, b) => a.title.localeCompare(b.title))).toEqual([
      { id: expect.any(String), legacyId: legacy.id, title: "Legacy mirrored" },
      { id: plannerOnly.id, legacyId: null, title: "Planner only" },
    ]);
  });

  it("keeps completed tasks visible and resolves timed schedule dates by timezone", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const created = createTask(db, scope, {
      clientMutationId: "day-read-timed",
      title: "Timed",
      scheduledStartAt: "2026-08-09T16:30:00.000Z",
      scheduledEndAt: "2026-08-09T17:00:00.000Z",
      scheduledTimezone: "Asia/Shanghai",
    });
    completeTask(db, scope, { id: created.id, expectedVersion: created.version });

    expect(listDayTaskItems(db, scope, "2026-08-10")).toMatchObject([
      { id: created.id, done: 1, status: "completed", scheduled_start: "00:30" },
    ]);
    expect(listDayTaskItems(db, scope, "2026-08-09")).toEqual([]);
  });
});
