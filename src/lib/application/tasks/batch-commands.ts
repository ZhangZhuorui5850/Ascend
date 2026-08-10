import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../../access-context";
import type {
  PlannerActionConflict,
  PlannerTask,
  PlannerTaskStatus,
} from "../../planner/types";
import {
  getPlannerTask,
  purgeDeletedPlannerTasks,
} from "../../repo/planner-tasks";
import {
  changeTaskStatus,
  completeTask,
  deleteTask,
  reopenTask,
  restoreTask,
  updateTask,
} from "./commands";

export type BatchTaskCommandInput = {
  clientMutationId: string;
  tasks: Array<{ id: string; expectedVersion: number }>;
  patch: {
    status?: PlannerTaskStatus;
    listId?: string;
    dueDate?: string | null;
    deleted?: boolean;
  };
};

export type BatchTaskCommandResult = {
  entities: PlannerTask[];
  conflicts: Array<PlannerActionConflict<PlannerTask>>;
};

export type PurgeTaskTrashResult = {
  purged: number;
  retained: number;
  purgedTaskIds: string[];
};

/**
 * Applies a task batch as one application transaction.
 *
 * Versions are checked for the whole batch before the first write, so a stale
 * member cannot leave earlier members committed. Per-task mutation keys derive
 * from the caller's stable batch key and the canonical task ID, never position.
 */
export function batchTasks(
  db: Database.Database,
  scope: WorkspaceScope,
  input: BatchTaskCommandInput,
): BatchTaskCommandResult {
  assertBatchInput(input);
  return db.transaction(() => {
    const currentTasks = input.tasks.map((item) => {
      const current = getPlannerTask(db, scope, item.id);
      if (!current) throw new Error("任务不存在");
      return current;
    });
    const conflicts = currentTasks.flatMap((current, index) => {
      const expectedVersion = input.tasks[index].expectedVersion;
      return current.version === expectedVersion ? [] : [{
        entityId: current.id,
        expectedVersion,
        actualVersion: current.version,
        latest: current,
      }];
    });
    if (conflicts.length) return { entities: [], conflicts };

    const entities = currentTasks.map((current, index) => {
      const item = input.tasks[index];
      const key = batchTaskMutationKey(input.clientMutationId, current.id);
      if (input.patch.deleted !== undefined) {
        if ((current.deleted_at !== null) === input.patch.deleted) return current;
        const result = input.patch.deleted
          ? deleteTask(db, scope, { ...item, clientMutationId: `${key}:delete` })
          : restoreTask(db, scope, { ...item, clientMutationId: `${key}:restore` });
        return requireBatchEntity(result);
      }

      let entity = current;
      if (input.patch.listId !== undefined || input.patch.dueDate !== undefined) {
        entity = requireBatchEntity(updateTask(db, scope, {
          id: entity.id,
          expectedVersion: entity.version,
          listId: input.patch.listId,
          dueDate: input.patch.dueDate,
        }));
      }
      if (input.patch.status !== undefined && input.patch.status !== entity.status) {
        const statusInput = {
          id: entity.id,
          expectedVersion: entity.version,
          status: input.patch.status,
        };
        if (input.patch.status === "completed") {
          entity = requireBatchEntity(completeTask(db, scope, {
            ...statusInput,
            clientMutationId: `${key}:status:completed`,
          }));
        } else if (input.patch.status === "open" && entity.status === "completed") {
          entity = requireBatchEntity(reopenTask(db, scope, {
            ...statusInput,
            clientMutationId: `${key}:status:open`,
          }));
        } else {
          entity = requireBatchEntity(changeTaskStatus(db, scope, statusInput));
        }
      }
      return entity;
    });
    return { entities, conflicts: [] };
  })();
}

export function purgeTaskTrash(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { deletedBefore: string; confirm: boolean },
): PurgeTaskTrashResult {
  const deletedBefore = new Date(input.deletedBefore);
  if (Number.isNaN(deletedBefore.getTime())) throw new Error("清理截止时间无效");
  return db.transaction(() => purgeDeletedPlannerTasks(db, scope, {
    ...input,
    deletedBefore: deletedBefore.toISOString(),
  }))();
}

function assertBatchInput(input: BatchTaskCommandInput): void {
  const clientMutationId = input.clientMutationId.trim();
  if (!clientMutationId) throw new Error("clientMutationId 必填");
  if (clientMutationId.length > 120) throw new Error("clientMutationId 过长");
  if (!input.tasks.length || input.tasks.length > 100) {
    throw new Error("批量任务数量需在 1-100 之间");
  }
  if (new Set(input.tasks.map((task) => task.id)).size !== input.tasks.length) {
    throw new Error("批量任务不能包含重复项");
  }
  const patchFields = Object.values(input.patch).filter((value) => value !== undefined);
  if (!patchFields.length) throw new Error("批量操作缺少更改内容");
  if (input.patch.deleted !== undefined && patchFields.length > 1) {
    throw new Error("删除或恢复不能与其他批量更改同时执行");
  }
}

function batchTaskMutationKey(clientMutationId: string, taskId: string): string {
  return `batch:${clientMutationId.trim()}:task:${taskId}`;
}

function requireBatchEntity(result: {
  entity?: PlannerTask;
  conflict?: PlannerActionConflict<PlannerTask>;
}): PlannerTask {
  if (result.entity) return result.entity;
  if (result.conflict) throw new Error("批量任务版本冲突");
  throw new Error("批量任务操作未返回结果");
}
