import { describe, expect, it } from "vitest";
import {
  completeTask,
  createTask,
  deleteTask,
  reopenTask,
  rescheduleTask,
  restoreTask,
  updateTask,
} from "./commands";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "../../repo/testing";
import { plannerDefaultId } from "../../repo/planner-defaults";
import { getLearningTaskLink, listLearningEvidence } from "../../repo/learning-evidence";

describe("canonical task application commands", () => {
  it("creates in the canonical inbox and rejects a foreign subject", () => {
    const db = createTestDb();
    const local = createTestWorkspace(db);
    const foreign = createTestWorkspace(db);
    db.prepare(`
      INSERT INTO subjects (workspace_id, code, name, description)
      VALUES (?, 'FOREIGN', 'Foreign-only subject', '')
    `).run(foreign.workspaceId);

    expect(() => createTask(db, local, {
      clientMutationId: "foreign-subject",
      title: "非法跨空间任务",
      subjectCode: "FOREIGN",
    })).toThrow("科目不存在或不属于当前学习空间");

    const task = createTask(db, local, {
      clientMutationId: "canonical-create",
      title: "Canonical task",
    });
    expect(task).toMatchObject({ workspace_id: local.workspaceId, status: "open", version: 1 });
    expect(task.list_id).toBe(plannerDefaultId(local.workspaceId, "inbox"));
  });

  it("updates status, schedule, and recycle-bin state with optimistic versions", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const created = createTask(db, scope, {
      clientMutationId: "lifecycle",
      title: "Task lifecycle",
    });

    const scheduled = rescheduleTask(db, scope, {
      id: created.id,
      expectedVersion: created.version,
      dueDate: "2026-08-11",
      estimatedMinutes: 45,
      schedule: {
        kind: "timed",
        startAt: "2026-08-10T01:00:00.000Z",
        endAt: "2026-08-10T01:30:00.000Z",
        timeZone: "Asia/Shanghai",
      },
    }).entity!;
    expect(scheduled).toMatchObject({
      due_date: "2026-08-11",
      scheduled_start_at: "2026-08-10T01:00:00.000Z",
      scheduled_timezone: "Asia/Shanghai",
      estimated_minutes: 45,
      version: 2,
    });

    const completed = completeTask(db, scope, {
      id: scheduled.id,
      expectedVersion: scheduled.version,
      day: "2026-08-10",
      evidence: { actualMinutes: 35, output: "完成并核对" },
    }).entity!;
    expect(completed.status).toBe("completed");
    expect(listLearningEvidence(db, scope, { taskId: created.id })).toMatchObject([
      {
        completionCycle: 1,
        day: "2026-08-10",
        outcome: "completed",
        actualMinutes: 35,
        output: "完成并核对",
      },
    ]);
    const reopened = reopenTask(db, scope, {
      id: completed.id,
      expectedVersion: completed.version,
      day: "2026-08-10",
    }).entity!;
    expect(reopened.status).toBe("open");
    const completedAgain = completeTask(db, scope, {
      id: reopened.id,
      expectedVersion: reopened.version,
      day: "2026-08-11",
    }).entity!;
    expect(listLearningEvidence(db, scope, { taskId: created.id }).map((item) => ({
      cycle: item.completionCycle,
      outcome: item.outcome,
    }))).toEqual([
      { cycle: 2, outcome: "completed" },
      { cycle: 1, outcome: "reopened" },
      { cycle: 1, outcome: "completed" },
    ]);

    const deleted = deleteTask(db, scope, {
      id: completedAgain.id,
      expectedVersion: completedAgain.version,
      clientMutationId: "delete-lifecycle",
    }).entity!;
    expect(deleted.deleted_at).not.toBeNull();
    expect(deleteTask(db, scope, {
      id: completedAgain.id,
      expectedVersion: completedAgain.version,
      clientMutationId: "delete-lifecycle",
    }).entity).toEqual(deleted);
    expect(() => updateTask(db, scope, {
      id: deleted.id,
      expectedVersion: deleted.version,
      title: "cannot update trash",
    })).toThrow("任务已在回收站");

    const restored = restoreTask(db, scope, {
      id: deleted.id,
      expectedVersion: deleted.version,
      clientMutationId: "restore-lifecycle",
    }).entity!;
    expect(restored.deleted_at).toBeNull();
    expect(restoreTask(db, scope, {
      id: deleted.id,
      expectedVersion: deleted.version,
      clientMutationId: "restore-lifecycle",
    }).entity).toEqual(restored);
  });

  it("returns the repository conflict without partial mutation", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const task = createTask(db, scope, {
      clientMutationId: "conflict",
      title: "Original",
    });
    const first = updateTask(db, scope, {
      id: task.id,
      expectedVersion: task.version,
      title: "First",
    }).entity!;
    const stale = updateTask(db, scope, {
      id: task.id,
      expectedVersion: task.version,
      title: "Stale",
    });

    expect(stale.conflict).toMatchObject({ actualVersion: first.version });
    expect(stale.entity).toBeUndefined();
  });

  it("does not let the generic update path bypass completion evidence", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const task = createTask(db, scope, {
      clientMutationId: "generic-completion",
      title: "Complete through update",
    });

    const completed = updateTask(db, scope, {
      id: task.id,
      expectedVersion: task.version,
      title: "Updated and completed",
      status: "completed",
    }).entity!;

    expect(completed).toMatchObject({ title: "Updated and completed", status: "completed", version: 3 });
    expect(listLearningEvidence(db, scope, { taskId: task.id })).toMatchObject([
      { completionCycle: 1, outcome: "completed" },
    ]);
  });

  it("owns learning links and completion retests inside the canonical transaction", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    seedSubjectWithChapter(db, scope);
    const task = createTask(db, scope, {
      clientMutationId: "linked-create",
      title: "矩阵专项",
      dueDate: "2026-08-10",
      learning: {
        expectedVersion: 0,
        knowledgePointId: "kp1",
        activityType: "practice",
        sourceType: "weak_point",
        sourceId: "kp1-plan",
      },
    });
    expect(task.subject_code).toBe("M1");
    expect(getLearningTaskLink(db, scope, task.id)).toMatchObject({
      knowledgePointId: "kp1",
      activityType: "practice",
    });

    const completed = completeTask(db, scope, {
      id: task.id,
      expectedVersion: task.version,
      clientMutationId: "linked-complete",
      day: "2026-08-10",
      evidence: { output: "完成 20 题", verificationMethod: "闭卷小测" },
      scheduleRetestAfterDays: 3,
    });

    expect(completed.entity?.status).toBe("completed");
    expect(completed.retestTask).toMatchObject({ due_date: "2026-08-13", subject_code: "M1" });
    expect(getLearningTaskLink(db, scope, completed.retestTask!.id)).toMatchObject({
      knowledgePointId: "kp1",
      activityType: "recall",
      sourceType: "training_retest",
      sourceId: `${task.id}:${completed.entity!.version}`,
      plannedVerificationMethod: "闭卷小测",
    });
    expect(listLearningEvidence(db, scope, { taskId: task.id })).toMatchObject([
      { knowledgePointId: "kp1", activityType: "practice", output: "完成 20 题" },
    ]);
  });
});
