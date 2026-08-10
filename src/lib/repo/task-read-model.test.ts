import { describe, expect, it } from "vitest";
import { createTask, completeTask } from "../application/tasks/commands";
import { upsertLearningTaskLink } from "./learning-evidence";
import { addTask } from "./planner";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "./testing";
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

  it("keeps Due and Schedule independent in day reads", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const task = createTask(db, scope, {
      clientMutationId: "independent-due-schedule",
      title: "Due today, scheduled tomorrow",
      dueDate: "2026-08-10",
      scheduledStartAt: "2026-08-11T01:00:00.000Z",
      scheduledEndAt: "2026-08-11T01:30:00.000Z",
      scheduledTimezone: "Asia/Shanghai",
    });

    expect(listDayTaskItems(db, scope, "2026-08-10")).toMatchObject([
      { id: task.id, scheduled_start: null },
    ]);
    expect(listDayTaskItems(db, scope, "2026-08-11")).toMatchObject([
      { id: task.id, scheduled_start: "09:00" },
    ]);
  });

  it("projects the learning link and latest active completion evidence", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    seedSubjectWithChapter(db, scope);
    const task = createTask(db, scope, {
      clientMutationId: "day-read-learning",
      title: "学习证据投影",
      subjectCode: "M1",
      dueDate: "2026-08-10",
    });
    const link = upsertLearningTaskLink(db, scope, {
      taskId: task.id,
      knowledgePointId: "kp1",
      activityType: "practice",
      completionCriteria: "独立做对 8/10",
      plannedVerificationMethod: "闭卷小测",
    });
    completeTask(db, scope, {
      id: task.id,
      expectedVersion: task.version,
      day: "2026-08-10",
      evidence: {
        actualMinutes: 35,
        output: "完成 10 题",
        verificationMethod: "闭卷小测",
        verificationResult: "8/10",
        verificationOutcome: "improved",
      },
    });

    expect(listDayTaskItems(db, scope, "2026-08-10")).toMatchObject([{
      id: task.id,
      learning_link_version: link.version,
      knowledge_point_id: "kp1",
      activity_type: "practice",
      completion_criteria: "独立做对 8/10",
      planned_verification_method: "闭卷小测",
      actual_minutes: 35,
      completion_output: "完成 10 题",
      verification_result: "8/10",
      verification_outcome: "improved",
    }]);
  });
});
