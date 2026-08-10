import { describe, expect, it } from "vitest";
import { createTask } from "../tasks/commands";
import { createCalendarEvent } from "../../repo/planner-events";
import { ensurePlannerDefaults, plannerDefaultId } from "../../repo/planner-defaults";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "../../repo/testing";
import { getTodayReadModel } from "./read-model";

describe("getTodayReadModel", () => {
  it("combines scheduled tasks and events while keeping due-only tasks unscheduled", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    ensurePlannerDefaults(db, scope);
    const scheduled = createTask(db, scope, {
      clientMutationId: "today-scheduled",
      title: "定时练习",
      dueDate: "2026-08-10",
      scheduledStartAt: "2026-08-10T01:00:00.000Z",
      scheduledEndAt: "2026-08-10T01:25:00.000Z",
      scheduledTimezone: "Asia/Shanghai",
      estimatedMinutes: 25,
    });
    const dueOnly = createTask(db, scope, {
      clientMutationId: "today-due-only",
      title: "未排时练习",
      dueDate: "2026-08-10",
    });
    createCalendarEvent(db, scope, {
      clientMutationId: "today-event",
      calendarId: plannerDefaultId(scope.workspaceId, "personal-calendar"),
      title: "课程",
      allDay: false,
      startAt: "2026-08-10T02:00:00.000Z",
      endAt: "2026-08-10T03:00:00.000Z",
      timezone: "Asia/Shanghai",
    });

    const model = getTodayReadModel(db, scope, {
      day: "2026-08-10",
      now: "2026-08-10T00:30:00.000Z",
    });

    expect(model.scheduledItems.map((item) => [item.kind, item.title, item.startTime])).toEqual([
      ["task", "定时练习", "09:00"],
      ["event", "课程", "10:00"],
    ]);
    expect(model.unscheduledTasks).toMatchObject([{ id: dueOnly.id, title: "未排时练习" }]);
    expect(model.scheduledItems.filter((item) => item.id === scheduled.id)).toHaveLength(1);
  });

  it("ranks task, knowledge review, and mistake candidates from one workspace only", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const foreign = createTestWorkspace(db);
    seedSubjectWithChapter(db, scope);
    db.prepare("UPDATE knowledge_points SET next_review = '2026-08-10' WHERE workspace_id = ? AND id = 'kp1'")
      .run(scope.workspaceId);
    db.prepare("UPDATE knowledge_points SET next_review = '2026-07-01' WHERE workspace_id = ? AND id = 'kp1'")
      .run(foreign.workspaceId);
    db.prepare(`
      INSERT INTO mistakes (workspace_id, day, subject_code, title, next_review)
      VALUES (?, '2026-08-01', 'M1', '符号错误', '2026-08-10')
    `).run(scope.workspaceId);
    createTask(db, scope, {
      clientMutationId: "imminent",
      title: "马上开始的任务",
      scheduledStartAt: "2026-08-10T12:00:00.000Z",
      scheduledEndAt: "2026-08-10T12:25:00.000Z",
      scheduledTimezone: "Asia/Shanghai",
      estimatedMinutes: 25,
    });

    const model = getTodayReadModel(db, scope, {
      day: "2026-08-10",
      now: "2026-08-10T11:45:00.000Z",
      availableMinutes: 30,
    });

    expect(model.nextAction).toMatchObject({ kind: "task", title: "马上开始的任务" });
    expect(model.review).toEqual({ dueKnowledgePoints: 1, dueMistakes: 1, estimatedMinutes: 13 });
  });
});
