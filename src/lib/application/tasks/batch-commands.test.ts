import { describe, expect, it } from "vitest";
import { createTestDb, createTestWorkspace } from "../../repo/testing";
import { createPlannerTask, getPlannerTask } from "../../repo/planner-tasks";
import { appendLearningEvidence, listLearningEvidence } from "../../repo/learning-evidence";
import { ensurePlannerDefaults, plannerDefaultId } from "../../repo/planner-defaults";
import { deleteTask } from "./commands";
import { batchTasks, purgeTaskTrash } from "./batch-commands";

describe("task batch application commands", () => {
  it("completes and reopens through evidence-writing commands with stable per-task keys", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const first = createFixtureTask(db, scope, "first", "First");
    const second = createFixtureTask(db, scope, "second", "Second");

    const completed = batchTasks(db, scope, {
      clientMutationId: "batch-complete",
      tasks: [first, second].map((task) => ({ id: task.id, expectedVersion: task.version })),
      patch: { status: "completed" },
    });

    expect(completed.conflicts).toEqual([]);
    expect(completed.entities.map((task) => task.status)).toEqual(["completed", "completed"]);
    expect(db.prepare(`
      SELECT task_id, idempotency_key FROM learning_evidence
      WHERE workspace_id = ? ORDER BY task_id
    `).all(scope.workspaceId)).toEqual([
      {
        task_id: first.id,
        idempotency_key: `batch:batch-complete:task:${first.id}:status:completed`,
      },
      {
        task_id: second.id,
        idempotency_key: `batch:batch-complete:task:${second.id}:status:completed`,
      },
    ].sort((a, b) => a.task_id.localeCompare(b.task_id)));

    const reopened = batchTasks(db, scope, {
      clientMutationId: "batch-reopen",
      tasks: completed.entities.map((task) => ({ id: task.id, expectedVersion: task.version })),
      patch: { status: "open" },
    });
    expect(reopened.entities.map((task) => task.status)).toEqual(["open", "open"]);
    expect(listLearningEvidence(db, scope, { taskId: first.id }).map((item) => item.outcome))
      .toEqual(["reopened", "completed"]);
  });

  it("does not commit any member when batch version preflight finds a conflict", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const first = createFixtureTask(db, scope, "atomic-first", "First");
    const second = createFixtureTask(db, scope, "atomic-second", "Second");

    const result = batchTasks(db, scope, {
      clientMutationId: "atomic-conflict",
      tasks: [
        { id: first.id, expectedVersion: first.version },
        { id: second.id, expectedVersion: second.version + 1 },
      ],
      patch: { status: "completed" },
    });

    expect(result.entities).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(getPlannerTask(db, scope, first.id)).toMatchObject({ status: "open", version: first.version });
    expect(listLearningEvidence(db, scope, { taskId: first.id })).toEqual([]);
  });

  it("rolls back earlier members when a later evidence write fails", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const first = createFixtureTask(db, scope, "rollback-first", "First");
    const second = createFixtureTask(db, scope, "rollback-second", "Second");
    appendLearningEvidence(db, scope, {
      taskId: first.id,
      completionCycle: 1,
      day: "2026-08-10",
      outcome: "seed",
      idempotencyKey: `batch:rollback-batch:task:${second.id}:status:completed`,
    });

    expect(() => batchTasks(db, scope, {
      clientMutationId: "rollback-batch",
      tasks: [first, second].map((task) => ({ id: task.id, expectedVersion: task.version })),
      patch: { status: "completed" },
    })).toThrow("学习证据幂等键已用于不同请求");

    expect(getPlannerTask(db, scope, first.id)).toMatchObject({ status: "open", version: first.version });
    expect(getPlannerTask(db, scope, second.id)).toMatchObject({ status: "open", version: second.version });
    expect(listLearningEvidence(db, scope, { taskId: first.id })).toHaveLength(1);
  });

  it("purges only safe trash and retains tasks with learning evidence", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const foreignScope = createTestWorkspace(db);
    const evidenced = createFixtureTask(db, scope, "evidenced", "Evidenced");
    const plain = createFixtureTask(db, scope, "plain", "Plain");
    const foreign = createFixtureTask(db, foreignScope, "foreign", "Foreign");
    const completed = batchTasks(db, scope, {
      clientMutationId: "complete-for-purge",
      tasks: [{ id: evidenced.id, expectedVersion: evidenced.version }],
      patch: { status: "completed" },
    }).entities[0];
    deleteTask(db, scope, {
      id: completed.id,
      expectedVersion: completed.version,
      clientMutationId: "delete-evidenced",
    });
    deleteTask(db, scope, {
      id: plain.id,
      expectedVersion: plain.version,
      clientMutationId: "delete-plain",
    });
    deleteTask(db, foreignScope, {
      id: foreign.id,
      expectedVersion: foreign.version,
      clientMutationId: "delete-foreign",
    });

    const result = purgeTaskTrash(db, scope, {
      deletedBefore: "9999-01-01T00:00:00.000Z",
      confirm: true,
    });

    expect(result).toEqual({ purged: 1, retained: 1, purgedTaskIds: [plain.id] });
    expect(getPlannerTask(db, scope, plain.id)).toBeNull();
    expect(getPlannerTask(db, scope, evidenced.id)).not.toBeNull();
    expect(getPlannerTask(db, foreignScope, foreign.id)).not.toBeNull();
    expect(listLearningEvidence(db, scope, { taskId: evidenced.id })).toHaveLength(1);
  });

  it("retains an ancestor when its evidenced child must remain", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const parent = createFixtureTask(db, scope, "parent", "Parent");
    const child = createFixtureTask(db, scope, "child", "Child", parent.id);
    const completedChild = batchTasks(db, scope, {
      clientMutationId: "complete-child",
      tasks: [{ id: child.id, expectedVersion: child.version }],
      patch: { status: "completed" },
    }).entities[0];
    deleteTask(db, scope, {
      id: completedChild.id,
      expectedVersion: completedChild.version,
      clientMutationId: "delete-child",
    });
    deleteTask(db, scope, {
      id: parent.id,
      expectedVersion: parent.version,
      clientMutationId: "delete-parent",
    });

    expect(purgeTaskTrash(db, scope, {
      deletedBefore: "9999-01-01T00:00:00.000Z",
      confirm: true,
    })).toEqual({ purged: 0, retained: 2, purgedTaskIds: [] });
    expect(getPlannerTask(db, scope, parent.id)).not.toBeNull();
    expect(getPlannerTask(db, scope, child.id)).not.toBeNull();
  });

  it("requires explicit purge confirmation and a valid cutoff", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    expect(() => purgeTaskTrash(db, scope, {
      deletedBefore: "not-a-date",
      confirm: true,
    })).toThrow("清理截止时间无效");
    expect(() => purgeTaskTrash(db, scope, {
      deletedBefore: "2026-08-10T00:00:00.000Z",
      confirm: false,
    })).toThrow("永久清理需明确确认");
  });
});

function createFixtureTask(
  db: ReturnType<typeof createTestDb>,
  scope: ReturnType<typeof createTestWorkspace>,
  clientMutationId: string,
  title: string,
  parentTaskId?: string,
) {
  ensurePlannerDefaults(db, scope);
  return createPlannerTask(db, scope, {
    clientMutationId,
    listId: plannerDefaultId(scope.workspaceId, "inbox"),
    title,
    parentTaskId,
  });
}
