import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { WorkspaceScope } from "../access-context";
import { utcToZonedDateTime } from "../planner/time";
import { shiftDateKey } from "../dates";
import type {
  PlannerActionConflict,
  PlannerPriority,
  PlannerTask,
  PlannerTaskStatus,
} from "../planner/types";
import { plannerTaskDraftSchema } from "../planner/validation";
import type { DayTask } from "./planner";
import { advanceTaskSeriesAfterCompletion } from "./planner-series";
import { refreshEntityReminders } from "./planner-reminders";

export type CreatePlannerTaskInput = {
  clientMutationId: string;
  listId: string;
  title: string;
  parentTaskId?: string | null;
  notes?: string;
  subjectCode?: string | null;
  status?: PlannerTaskStatus;
  priority?: PlannerPriority;
  dueDate?: string | null;
  dueAt?: string | null;
  dueTimezone?: string | null;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  scheduledTimezone?: string | null;
  scheduledAllDay?: boolean;
  estimatedMinutes?: number;
  sortOrder?: number;
};

export type UpdatePlannerTaskInput = Omit<Partial<CreatePlannerTaskInput>, "clientMutationId"> & {
  id: string;
  expectedVersion: number;
};

export type PlannerTaskMutation = {
  entity?: PlannerTask;
  conflict?: PlannerActionConflict<PlannerTask>;
};

export type PlannerTaskView =
  | "inbox"
  | "today"
  | "upcoming"
  | "anytime"
  | "overdue"
  | "waiting"
  | "completed"
  | "trash"
  | "all";

export function listPlannerTasks(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { includeDeleted?: boolean } = {},
): PlannerTask[] {
  return db.prepare(`
    SELECT ${TASK_COLUMNS}
    FROM planner_tasks
    WHERE workspace_id = @workspaceId
      AND (@includeDeleted = 1 OR deleted_at IS NULL)
    ORDER BY
      CASE WHEN scheduled_start_at IS NULL THEN 1 ELSE 0 END ASC,
      scheduled_start_at ASC,
      CASE WHEN due_at IS NULL AND due_date IS NULL THEN 1 ELSE 0 END ASC,
      COALESCE(due_at, due_date) ASC,
      priority ASC, sort_order ASC, id ASC
  `).all({
    workspaceId: scope.workspaceId,
    includeDeleted: input.includeDeleted ? 1 : 0,
  }) as PlannerTask[];
}

export function listTaskView(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    view: PlannerTaskView;
    today: string;
    now?: string;
    listId?: string;
    limit?: number;
  },
): PlannerTask[] {
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 1000);
  const tasks = db.prepare(`
    SELECT ${TASK_COLUMNS}
    FROM planner_tasks
    WHERE workspace_id = @workspaceId
      AND (@listId IS NULL OR list_id = @listId)
    ORDER BY updated_at DESC, id ASC
    LIMIT 2000
  `).all({
    workspaceId: scope.workspaceId,
    listId: input.listId ?? null,
  }) as PlannerTask[];
  const inboxId = (db.prepare(`
    SELECT id FROM task_lists WHERE workspace_id = ? AND is_inbox = 1
  `).get(scope.workspaceId) as { id: string } | undefined)?.id;
  const now = new Date(input.now ?? new Date().toISOString());
  const upcomingEnd = shiftDateKey(input.today, 30);
  return tasks
    .filter((task) => taskMatchesView(task, input.view, {
      today: input.today,
      upcomingEnd,
      now,
      inboxId,
    }))
    .sort(comparePlannerTasks)
    .slice(0, limit);
}

export function getPlannerTask(
  db: Database.Database,
  scope: WorkspaceScope,
  id: string,
): PlannerTask | null {
  return (db.prepare(`
    SELECT ${TASK_COLUMNS}
    FROM planner_tasks WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as PlannerTask | undefined) ?? null;
}

export function createPlannerTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: CreatePlannerTaskInput,
): PlannerTask {
  const clientMutationId = input.clientMutationId.trim();
  if (!clientMutationId) throw new Error("clientMutationId 必填");
  const opId = plannerOperationId(scope.workspaceId, clientMutationId);
  return db.transaction(() => {
    const replay = db.prepare(`
      SELECT entity_id FROM entity_changes
      WHERE workspace_id = ? AND op_id = ? AND entity_type = 'planner_task'
    `).get(scope.workspaceId, opId) as { entity_id: string } | undefined;
    if (replay) {
      const existing = getPlannerTask(db, scope, replay.entity_id);
      if (!existing) throw new Error("幂等任务记录缺少实体");
      return existing;
    }

    const parsed = plannerTaskDraftSchema.parse(input);
    const parent = parsed.parentTaskId ? getPlannerTask(db, scope, parsed.parentTaskId) : null;
    if (parsed.parentTaskId && !parent) throw new Error("父任务不存在");
    const depth = parent ? parent.depth + 1 : 0;
    if (depth > 3) throw new Error("子任务最多三层");
    assertTaskList(db, scope, parsed.listId);
    const id = randomUUID();
    const sortOrder = input.sortOrder === undefined
      ? nextTaskSortOrder(db, scope, parsed.listId, parsed.parentTaskId ?? null)
      : normalizeSortOrder(input.sortOrder);
    const now = new Date().toISOString();
    const completedAt = parsed.status === "completed" ? now : null;
    const canceledAt = parsed.status === "canceled" ? now : null;
    db.prepare(`
      INSERT INTO planner_tasks
        (id, workspace_id, list_id, parent_task_id, depth, title, notes, subject_code,
         status, priority, due_date, due_at, due_timezone,
         scheduled_start_at, scheduled_end_at, scheduled_timezone, scheduled_all_day,
         estimated_minutes, sort_order, completed_at, canceled_at, version, created_at, updated_at)
      VALUES
        (@id, @workspaceId, @listId, @parentTaskId, @depth, @title, @notes, @subjectCode,
         @status, @priority, @dueDate, @dueAt, @dueTimezone,
         @scheduledStartAt, @scheduledEndAt, @scheduledTimezone, @scheduledAllDay,
         @estimatedMinutes, @sortOrder, @completedAt, @canceledAt, 1, @now, @now)
    `).run({
      id,
      workspaceId: scope.workspaceId,
      listId: parsed.listId,
      parentTaskId: parsed.parentTaskId ?? null,
      depth,
      title: parsed.title,
      notes: parsed.notes,
      subjectCode: parsed.subjectCode ?? null,
      status: parsed.status,
      priority: parsed.priority,
      dueDate: parsed.dueDate ?? null,
      dueAt: parsed.dueAt ?? null,
      dueTimezone: parsed.dueTimezone ?? null,
      scheduledStartAt: parsed.scheduledStartAt ?? null,
      scheduledEndAt: parsed.scheduledEndAt ?? null,
      scheduledTimezone: parsed.scheduledTimezone ?? null,
      scheduledAllDay: parsed.scheduledAllDay ? 1 : 0,
      estimatedMinutes: parsed.estimatedMinutes,
      sortOrder,
      completedAt,
      canceledAt,
      now,
    });
    const entity = getPlannerTask(db, scope, id)!;
    recordTaskChange(db, scope, {
      opId,
      entity,
      operation: "create",
      baseVersion: null,
      patch: input,
    });
    return entity;
  })();
}

export function updatePlannerTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: UpdatePlannerTaskInput,
): PlannerTaskMutation {
  return db.transaction(() => {
    const current = getPlannerTask(db, scope, input.id);
    if (!current) throw new Error("任务不存在");
    if (current.version !== input.expectedVersion) {
      return {
        conflict: {
          entityId: current.id,
          expectedVersion: input.expectedVersion,
          actualVersion: current.version,
          latest: current,
        },
      };
    }
    const draft = plannerTaskDraftSchema.parse({
      title: input.title ?? current.title,
      listId: input.listId ?? current.list_id,
      parentTaskId: input.parentTaskId === undefined ? current.parent_task_id : input.parentTaskId,
      notes: input.notes ?? current.notes,
      subjectCode: input.subjectCode === undefined ? current.subject_code : input.subjectCode,
      status: input.status ?? current.status,
      priority: input.priority ?? current.priority,
      dueDate: input.dueDate === undefined ? current.due_date : input.dueDate,
      dueAt: input.dueAt === undefined ? current.due_at : input.dueAt,
      dueTimezone: input.dueTimezone === undefined ? current.due_timezone : input.dueTimezone,
      scheduledStartAt: input.scheduledStartAt === undefined
        ? current.scheduled_start_at
        : input.scheduledStartAt,
      scheduledEndAt: input.scheduledEndAt === undefined ? current.scheduled_end_at : input.scheduledEndAt,
      scheduledTimezone: input.scheduledTimezone === undefined
        ? current.scheduled_timezone
        : input.scheduledTimezone,
      scheduledAllDay: input.scheduledAllDay ?? current.scheduled_all_day === 1,
      estimatedMinutes: input.estimatedMinutes ?? current.estimated_minutes,
    });
    assertTaskList(db, scope, draft.listId);
    const parent = draft.parentTaskId ? getPlannerTask(db, scope, draft.parentTaskId) : null;
    if (draft.parentTaskId && !parent) throw new Error("父任务不存在");
    if (parent?.id === current.id) throw new Error("任务不能成为自身子任务");
    const depth = parent ? parent.depth + 1 : 0;
    if (depth > 3) throw new Error("子任务最多三层");
    const now = new Date().toISOString();
    const completedAt = draft.status === "completed" ? (current.completed_at ?? now) : null;
    const canceledAt = draft.status === "canceled" ? (current.canceled_at ?? now) : null;
    const result = db.prepare(`
      UPDATE planner_tasks
      SET list_id = @listId, parent_task_id = @parentTaskId, depth = @depth,
          title = @title, notes = @notes, subject_code = @subjectCode,
          status = @status, priority = @priority,
          due_date = @dueDate, due_at = @dueAt, due_timezone = @dueTimezone,
          scheduled_start_at = @scheduledStartAt, scheduled_end_at = @scheduledEndAt,
          scheduled_timezone = @scheduledTimezone, scheduled_all_day = @scheduledAllDay,
          estimated_minutes = @estimatedMinutes, sort_order = @sortOrder, completed_at = @completedAt,
          canceled_at = @canceledAt, version = version + 1, updated_at = @now
      WHERE workspace_id = @workspaceId AND id = @id AND version = @expectedVersion
    `).run({
      workspaceId: scope.workspaceId,
      id: current.id,
      expectedVersion: input.expectedVersion,
      listId: draft.listId,
      parentTaskId: draft.parentTaskId ?? null,
      depth,
      title: draft.title,
      notes: draft.notes,
      subjectCode: draft.subjectCode ?? null,
      status: draft.status,
      priority: draft.priority,
      dueDate: draft.dueDate ?? null,
      dueAt: draft.dueAt ?? null,
      dueTimezone: draft.dueTimezone ?? null,
      scheduledStartAt: draft.scheduledStartAt ?? null,
      scheduledEndAt: draft.scheduledEndAt ?? null,
      scheduledTimezone: draft.scheduledTimezone ?? null,
      scheduledAllDay: draft.scheduledAllDay ? 1 : 0,
      estimatedMinutes: draft.estimatedMinutes,
      sortOrder: input.sortOrder ?? current.sort_order,
      completedAt,
      canceledAt,
      now,
    });
    if (!result.changes) {
      const latest = getPlannerTask(db, scope, current.id)!;
      return {
        conflict: {
          entityId: latest.id,
          expectedVersion: input.expectedVersion,
          actualVersion: latest.version,
          latest,
        },
      };
    }
    const entity = getPlannerTask(db, scope, current.id)!;
    recordTaskChange(db, scope, {
      opId: plannerOperationId(scope.workspaceId, `update:${current.id}:${entity.version}`),
      entity,
      operation: "update",
      baseVersion: input.expectedVersion,
      patch: input,
    });
    refreshEntityReminders(db, scope, { entityType: "task", entityId: entity.id });
    if (current.status !== "completed" && entity.status === "completed") {
      advanceTaskSeriesAfterCompletion(db, scope, entity);
    }
    return { entity };
  })();
}

export function softDeletePlannerTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; expectedVersion: number; clientMutationId: string },
): PlannerTaskMutation {
  return setPlannerTaskDeletedAt(db, scope, input, new Date().toISOString(), "delete");
}

export function restorePlannerTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; expectedVersion: number; clientMutationId: string },
): PlannerTaskMutation {
  return setPlannerTaskDeletedAt(db, scope, input, null, "restore");
}

export function batchUpdatePlannerTasks(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    clientMutationId: string;
    tasks: Array<{ id: string; expectedVersion: number }>;
    patch: {
      status?: PlannerTaskStatus;
      listId?: string;
      dueDate?: string | null;
      deleted?: boolean;
    };
  },
): { entities: PlannerTask[]; conflicts: Array<PlannerActionConflict<PlannerTask>> } {
  if (!input.tasks.length || input.tasks.length > 100) throw new Error("批量任务数量需在 1-100 之间");
  return db.transaction(() => {
    const entities: PlannerTask[] = [];
    const conflicts: Array<PlannerActionConflict<PlannerTask>> = [];
    input.tasks.forEach((item, index) => {
      const clientMutationId = `${input.clientMutationId}:${index}`;
      if (input.patch.deleted !== undefined) {
        const result = input.patch.deleted
          ? softDeletePlannerTask(db, scope, { ...item, clientMutationId })
          : restorePlannerTask(db, scope, { ...item, clientMutationId });
        if (result.entity) entities.push(result.entity);
        if (result.conflict) conflicts.push(result.conflict);
        return;
      }
      const result = updatePlannerTask(db, scope, {
        ...item,
        status: input.patch.status,
        listId: input.patch.listId,
        dueDate: input.patch.dueDate,
      });
      if (result.entity) entities.push(result.entity);
      if (result.conflict) conflicts.push(result.conflict);
    });
    return { entities, conflicts };
  })();
}

export function purgeDeletedPlannerTasks(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { deletedBefore: string; confirm: boolean },
): number {
  if (!input.confirm) throw new Error("永久清理需明确确认");
  return db.transaction(() => {
    const rows = db.prepare(`
      SELECT id FROM planner_tasks
      WHERE workspace_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?
      ORDER BY depth DESC, id ASC
    `).all(scope.workspaceId, input.deletedBefore) as Array<{ id: string }>;
    if (!rows.length) return 0;
    const removeChanges = db.prepare(`
      DELETE FROM entity_changes
      WHERE workspace_id = ? AND entity_type = 'planner_task' AND entity_id = ?
    `);
    const removeTask = db.prepare(`
      DELETE FROM planner_tasks WHERE workspace_id = ? AND id = ?
    `);
    for (const row of rows) {
      removeChanges.run(scope.workspaceId, row.id);
      removeTask.run(scope.workspaceId, row.id);
    }
    return rows.length;
  })();
}

export function listLegacyDayTaskProjection(
  db: Database.Database,
  scope: WorkspaceScope,
): DayTask[] {
  const rows = db.prepare(`
    SELECT ${TASK_COLUMNS}
    FROM planner_tasks
    WHERE workspace_id = ? AND legacy_day_task_id IS NOT NULL
    ORDER BY legacy_day_task_id ASC
  `).all(scope.workspaceId) as PlannerTask[];
  return rows.map((task) => projectPlannerTaskToDayTask(task, task.legacy_day_task_id!));
}

export function projectPlannerTaskToDayTask(task: PlannerTask, compatibilityId: number): DayTask {
  const scheduled = task.scheduled_start_at && task.scheduled_timezone
    ? utcToZonedDateTime(task.scheduled_start_at, task.scheduled_timezone)
    : null;
  return {
    id: compatibilityId,
    day: scheduled?.date ?? task.due_date ?? "",
    title: task.title,
    subject_code: task.subject_code,
    done: task.status === "completed" ? 1 : 0,
    sort_order: task.sort_order,
    priority: task.priority,
    estimated_minutes: task.estimated_minutes,
    scheduled_start: scheduled?.time.slice(0, 5) ?? null,
    notes: task.notes,
    knowledge_point_id: null,
    activity_type: "unspecified",
    completion_criteria: "",
    source_type: "",
    source_id: "",
    actual_minutes: null,
    completion_output: "",
    planned_verification_method: "",
    verification_method: "",
    verification_result: "",
    verification_outcome: "",
  };
}

const TASK_COLUMNS = `
  id, workspace_id, list_id, parent_task_id, depth, title, notes, subject_code,
  status, priority, due_date, due_at, due_timezone,
  scheduled_start_at, scheduled_end_at, scheduled_timezone, scheduled_all_day,
  estimated_minutes, series_id, occurrence_key, sort_order, deleted_at,
  completed_at, canceled_at, version, legacy_day_task_id, created_at, updated_at
`;

function assertTaskList(db: Database.Database, scope: WorkspaceScope, listId: string): void {
  const list = db.prepare("SELECT 1 FROM task_lists WHERE workspace_id = ? AND id = ? AND archived_at IS NULL")
    .get(scope.workspaceId, listId);
  if (!list) throw new Error("任务清单不存在");
}

function nextTaskSortOrder(
  db: Database.Database,
  scope: WorkspaceScope,
  listId: string,
  parentTaskId: string | null,
): number {
  return (db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS value
    FROM planner_tasks
    WHERE workspace_id = @workspaceId AND list_id = @listId
      AND parent_task_id IS @parentTaskId
  `).get({
    workspaceId: scope.workspaceId,
    listId,
    parentTaskId,
  }) as { value: number }).value;
}

function normalizeSortOrder(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new Error("任务排序值无效");
  return value;
}

function plannerOperationId(workspaceId: string, clientMutationId: string): string {
  return `planner:${workspaceId}:${clientMutationId}`;
}

function setPlannerTaskDeletedAt(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; expectedVersion: number; clientMutationId: string },
  deletedAt: string | null,
  operation: "delete" | "restore",
): PlannerTaskMutation {
  const opId = plannerOperationId(scope.workspaceId, input.clientMutationId);
  return db.transaction(() => {
    const replay = db.prepare(`
      SELECT snapshot_json FROM entity_changes
      WHERE workspace_id = ? AND op_id = ? AND entity_type = 'planner_task'
    `).get(scope.workspaceId, opId) as { snapshot_json: string } | undefined;
    if (replay) return { entity: JSON.parse(replay.snapshot_json) as PlannerTask };
    const current = getPlannerTask(db, scope, input.id);
    if (!current) throw new Error("任务不存在");
    if (current.version !== input.expectedVersion) {
      return {
        conflict: {
          entityId: current.id,
          expectedVersion: input.expectedVersion,
          actualVersion: current.version,
          latest: current,
        },
      };
    }
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE planner_tasks
      SET deleted_at = ?, version = version + 1, updated_at = ?
      WHERE workspace_id = ? AND id = ? AND version = ?
    `).run(deletedAt, now, scope.workspaceId, current.id, input.expectedVersion);
    if (!result.changes) {
      const latest = getPlannerTask(db, scope, current.id)!;
      return {
        conflict: {
          entityId: latest.id,
          expectedVersion: input.expectedVersion,
          actualVersion: latest.version,
          latest,
        },
      };
    }
    const entity = getPlannerTask(db, scope, current.id)!;
    recordTaskChange(db, scope, {
      opId,
      entity,
      operation,
      baseVersion: input.expectedVersion,
      patch: { deletedAt },
    });
    return { entity };
  })();
}

function taskMatchesView(
  task: PlannerTask,
  view: PlannerTaskView,
  context: {
    today: string;
    upcomingEnd: string;
    now: Date;
    inboxId?: string;
  },
): boolean {
  if (view === "trash") return task.deleted_at !== null;
  if (task.deleted_at) return false;
  if (view === "completed") return task.status === "completed";
  if (view === "all") return true;
  if (view === "waiting") return task.status === "waiting";
  if (task.status !== "open" && task.status !== "waiting") return false;
  const dueDate = task.due_date
    ?? (task.due_at && task.due_timezone ? utcToZonedDateTime(task.due_at, task.due_timezone).date : null);
  const scheduledDate = task.scheduled_start_at && task.scheduled_timezone
    ? utcToZonedDateTime(task.scheduled_start_at, task.scheduled_timezone).date
    : null;
  if (view === "inbox") return task.list_id === context.inboxId;
  if (view === "today") return dueDate === context.today || scheduledDate === context.today;
  if (view === "upcoming") {
    return [dueDate, scheduledDate].some((date) =>
      date !== null && date > context.today && date <= context.upcomingEnd);
  }
  if (view === "anytime") return !dueDate && !scheduledDate;
  if (view === "overdue") {
    return (task.due_date !== null && task.due_date < context.today)
      || (task.due_at !== null && new Date(task.due_at) < context.now);
  }
  return false;
}

function comparePlannerTasks(a: PlannerTask, b: PlannerTask): number {
  const aTime = a.scheduled_start_at ?? a.due_at ?? a.due_date ?? "";
  const bTime = b.scheduled_start_at ?? b.due_at ?? b.due_date ?? "";
  if (aTime && !bTime) return -1;
  if (!aTime && bTime) return 1;
  return aTime.localeCompare(bTime)
    || a.priority - b.priority
    || a.sort_order - b.sort_order
    || a.id.localeCompare(b.id);
}

function recordTaskChange(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    opId: string;
    entity: PlannerTask;
    operation: string;
    baseVersion: number | null;
    patch: unknown;
  },
): void {
  db.prepare(`
    INSERT INTO entity_changes
      (workspace_id, op_id, entity_type, entity_id, op, base_version, patch_json, snapshot_json)
    VALUES (?, ?, 'planner_task', ?, ?, ?, ?, ?)
  `).run(
    scope.workspaceId,
    input.opId,
    input.entity.id,
    input.operation,
    input.baseVersion,
    JSON.stringify(input.patch),
    JSON.stringify(input.entity),
  );
}
