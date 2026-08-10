import { describe, expect, it } from "vitest";
import { completeTask } from "../application/tasks/commands";
import { getDay } from "./days";
import { ensurePlannerDefaults, plannerDefaultId } from "./planner-defaults";
import { listCanonicalCalendarTasks } from "./planner-calendar-tasks";
import { createPlannerTask } from "./planner-tasks";
import { addTask, listTasks } from "./planner";
import { listDayTaskItems } from "./task-read-model";
import { createTestDb, createTestWorkspace } from "./testing";

describe("Planner canonical task consistency across surfaces", () => {
  it("uses the canonical Calendar task identity when SQLite rowids collide with legacy IDs", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    ensurePlannerDefaults(db, scope);

    // Creating v2 first gives it rowid 1. The first legacy task independently gets id 1.
    const canonicalTask = createPlannerTask(db, scope, {
      clientMutationId: "calendar-collision-v2",
      listId: plannerDefaultId(scope.workspaceId, "inbox"),
      title: "Planner v2 任务",
      dueDate: "2026-08-10",
    });
    const legacyTask = addTask(db, scope, {
      day: "2026-08-10",
      title: "不应被 Calendar 操作的 legacy 任务",
    });
    const plannerRow = db.prepare("SELECT rowid FROM planner_tasks WHERE id = ?").get(canonicalTask.id) as {
      rowid: number;
    };
    const calendarTask = listCanonicalCalendarTasks(db, scope, "Asia/Shanghai").find(
      (task) => task.title === canonicalTask.title,
    );

    expect(plannerRow.rowid).toBe(legacyTask.id);
    expect(calendarTask).toMatchObject({
      id: canonicalTask.id,
      version: canonicalTask.version,
    });

    const result = completeTask(db, scope, {
      id: calendarTask!.id,
      expectedVersion: calendarTask!.version,
    });

    expect({
      canonicalStatus: result.entity?.status,
      unrelatedLegacyDone: listTasks(db, scope, legacyTask.day).find((task) => task.id === legacyTask.id)?.done,
    }).toEqual({
      canonicalStatus: "completed",
      unrelatedLegacyDone: 0,
    });
  });

  it("makes a v2-created task visible in both Home and Day read models", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const day = "2026-08-10";
    ensurePlannerDefaults(db, scope);

    const canonicalTask = createPlannerTask(db, scope, {
      clientMutationId: "cross-surface-v2-create",
      listId: plannerDefaultId(scope.workspaceId, "inbox"),
      title: "跨视图可见的 canonical 任务",
      dueDate: day,
    });

    // Home and Day share the canonical UUID/version projection.
    expect({
      homeTasks: listDayTaskItems(db, scope, day).map((task) => ({ id: task.id, version: task.version })),
      dayTasks: getDay(db, scope, day, { includeReviewQueue: false }).tasks.map((task) => ({
        id: task.id,
        version: task.version,
      })),
    }).toEqual({
      homeTasks: [{ id: canonicalTask.id, version: canonicalTask.version }],
      dayTasks: [{ id: canonicalTask.id, version: canonicalTask.version }],
    });
  });
});
