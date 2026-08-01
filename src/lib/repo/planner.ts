import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey } from "../dates";
import { addMinutesToInstant, localDateTimeToUtc } from "../planner/time";
import { ensureDay } from "./days";
import { ensurePlannerDefaults, plannerDefaultId } from "./planner-defaults";
import {
  createPlannerTask,
  projectPlannerTaskToDayTask,
  updatePlannerTask,
} from "./planner-tasks";
import type { PlannerTask } from "../planner/types";

export type DayTask = {
  id: number;
  day: string;
  title: string;
  subject_code: string | null;
  done: number;
  sort_order: number;
  priority: 1 | 2 | 3;
  estimated_minutes: number;
  scheduled_start: string | null;
  notes: string;
};

export type DayNote = {
  id: number;
  day: string;
  content: string;
  created_at: string;
};

export function listTasks(db: Database.Database, scope: WorkspaceScope, day: string): DayTask[] {
  assertDateKey(day);
  return listCompatibilityTasks(db, scope)
    .map((row) => projectPlannerTaskToDayTask(row, row.compatibility_id))
    .filter((task) => task.day === day)
    .sort(compareDayTaskProjection);
}

export function listCalendarTasks(db: Database.Database, scope: WorkspaceScope): DayTask[] {
  return listCompatibilityTasks(db, scope)
    .map((row) => projectPlannerTaskToDayTask(row, row.compatibility_id))
    .sort((a, b) => a.day.localeCompare(b.day) || compareDayTaskProjection(a, b));
}

export function addTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    day: string;
    title: string;
    subjectCode?: string;
    priority?: number;
    estimatedMinutes?: number;
    scheduledStart?: string | null;
    notes?: string;
  },
): DayTask {
  const day = assertDateKey(input.day);
  const title = input.title.trim();
  if (!title) throw new Error("任务内容必填");
  const subjectCode = normalizeSubjectCode(db, scope, input.subjectCode);
  const priority = normalizePriority(input.priority);
  const estimatedMinutes = normalizeEstimatedMinutes(input.estimatedMinutes);
  const scheduledStart = normalizeScheduledStart(input.scheduledStart);
  const notes = normalizeTaskNotes(input.notes);
  ensureDay(db, scope, day);
  ensurePlannerDefaults(db, scope);
  const sortOrder = listTasks(db, scope, day)
    .reduce((maximum, task) => Math.max(maximum, task.sort_order), 0) + 1;
  const workspace = getWorkspaceTimeZone(db, scope);
  const scheduledStartAt = scheduledStart
    ? localDateTimeToUtc({ date: day, time: scheduledStart, timeZone: workspace })
    : null;
  const created = createPlannerTask(db, scope, {
    clientMutationId: randomUUID(),
    listId: plannerDefaultId(scope.workspaceId, "inbox"),
    title,
    notes,
    subjectCode: subjectCode ?? undefined,
    priority,
    estimatedMinutes,
    dueDate: scheduledStartAt ? null : day,
    scheduledStartAt,
    scheduledEndAt: scheduledStartAt ? addMinutesToInstant(scheduledStartAt, estimatedMinutes) : null,
    scheduledTimezone: scheduledStartAt ? workspace : null,
    sortOrder,
  });
  const compatibilityId = getCompatibilityId(db, scope, created.id);
  return projectPlannerTaskToDayTask(created, compatibilityId);
}

export function toggleTask(db: Database.Database, scope: WorkspaceScope, input: { id: number; done: boolean }): void {
  const task = getCompatibilityTask(db, scope, input.id);
  const result = updatePlannerTask(db, scope, {
    id: task.id,
    expectedVersion: task.version,
    status: input.done ? "completed" : "open",
  });
  if (result.conflict) throw new Error("任务版本冲突");
}

export function updateTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    id: number;
    title?: string;
    subjectCode?: string | null;
    priority?: number;
    estimatedMinutes?: number;
    scheduledStart?: string | null;
    notes?: string;
  },
): void {
  const task = getCompatibilityTask(db, scope, input.id);
  const title = input.title === undefined ? task.title : input.title.trim();
  if (!title) throw new Error("任务内容必填");
  const subjectCode = input.subjectCode === undefined
    ? task.subject_code
    : normalizeSubjectCode(db, scope, input.subjectCode || undefined);
  const priority = input.priority === undefined ? task.priority : normalizePriority(input.priority);
  const estimatedMinutes = input.estimatedMinutes === undefined
    ? task.estimated_minutes
    : normalizeEstimatedMinutes(input.estimatedMinutes);
  const currentProjection = projectPlannerTaskToDayTask(task, input.id);
  const scheduledStart = input.scheduledStart === undefined
    ? currentProjection.scheduled_start
    : normalizeScheduledStart(input.scheduledStart);
  const notes = input.notes === undefined ? task.notes : normalizeTaskNotes(input.notes);
  const workspace = getWorkspaceTimeZone(db, scope);
  const scheduledStartAt = scheduledStart
    ? localDateTimeToUtc({ date: currentProjection.day, time: scheduledStart, timeZone: workspace })
    : null;
  const result = updatePlannerTask(db, scope, {
    id: task.id,
    expectedVersion: task.version,
    title,
    subjectCode,
    priority,
    estimatedMinutes,
    notes,
    dueDate: scheduledStartAt ? null : currentProjection.day,
    scheduledStartAt,
    scheduledEndAt: scheduledStartAt ? addMinutesToInstant(scheduledStartAt, estimatedMinutes) : null,
    scheduledTimezone: scheduledStartAt ? workspace : null,
  });
  if (result.conflict) throw new Error("任务版本冲突");
}

export function scheduleTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: number; day: string; scheduledStart?: string | null; estimatedMinutes?: number },
): { previousDay: string; day: string } {
  const day = assertDateKey(input.day);
  const task = getCompatibilityTask(db, scope, input.id);
  const currentProjection = projectPlannerTaskToDayTask(task, input.id);
  const scheduledStart = normalizeScheduledStart(input.scheduledStart);
  const estimatedMinutes = input.estimatedMinutes === undefined
    ? task.estimated_minutes
    : normalizeEstimatedMinutes(input.estimatedMinutes);
  ensureDay(db, scope, day);
  const workspace = getWorkspaceTimeZone(db, scope);
  const scheduledStartAt = scheduledStart
    ? localDateTimeToUtc({ date: day, time: scheduledStart, timeZone: workspace })
    : null;
  const result = updatePlannerTask(db, scope, {
    id: task.id,
    expectedVersion: task.version,
    dueDate: scheduledStartAt ? null : day,
    scheduledStartAt,
    scheduledEndAt: scheduledStartAt ? addMinutesToInstant(scheduledStartAt, estimatedMinutes) : null,
    scheduledTimezone: scheduledStartAt ? workspace : null,
    estimatedMinutes,
  });
  if (result.conflict) throw new Error("任务版本冲突");
  return { previousDay: currentProjection.day, day };
}

export function deleteTask(db: Database.Database, scope: WorkspaceScope, id: number): void {
  const task = getCompatibilityTask(db, scope, id);
  const result = db.prepare(`
    UPDATE planner_tasks
    SET deleted_at = ?, version = version + 1, updated_at = ?
    WHERE workspace_id = ? AND id = ? AND version = ?
  `).run(new Date().toISOString(), new Date().toISOString(), scope.workspaceId, task.id, task.version);
  if (!result.changes) throw new Error("任务版本冲突");
}

/** 未完成的任务顺延到目标日期（跨天迁移）。 */
export function carryOverTasks(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { fromDay: string; toDay: string },
): number {
  const fromDay = assertDateKey(input.fromDay);
  const toDay = assertDateKey(input.toDay);
  if (fromDay === toDay) return 0;
  ensureDay(db, scope, toDay);
  const open = listTasks(db, scope, fromDay).filter((task) => !task.done);
  if (!open.length) return 0;
  const maxSortOrder = listTasks(db, scope, toDay)
    .reduce((maximum, task) => Math.max(maximum, task.sort_order), 0);
  const run = db.transaction(() => {
    open.forEach((item, index) => {
      const task = getCompatibilityTask(db, scope, item.id);
      const result = updatePlannerTask(db, scope, {
        id: task.id,
        expectedVersion: task.version,
        dueDate: toDay,
        scheduledStartAt: null,
        scheduledEndAt: null,
        scheduledTimezone: null,
        sortOrder: maxSortOrder + index + 1,
      });
      if (result.conflict) throw new Error("任务版本冲突");
    });
  });
  run();
  return open.length;
}

type CompatibilityPlannerTask = PlannerTask & { compatibility_id: number };

function listCompatibilityTasks(
  db: Database.Database,
  scope: WorkspaceScope,
): CompatibilityPlannerTask[] {
  return db.prepare(`
    SELECT rowid AS compatibility_id, *
    FROM planner_tasks
    WHERE workspace_id = ? AND deleted_at IS NULL
  `).all(scope.workspaceId) as CompatibilityPlannerTask[];
}

function getCompatibilityTask(
  db: Database.Database,
  scope: WorkspaceScope,
  compatibilityId: number,
): CompatibilityPlannerTask {
  const task = db.prepare(`
    SELECT rowid AS compatibility_id, *
    FROM planner_tasks
    WHERE workspace_id = ? AND rowid = ? AND deleted_at IS NULL
  `).get(scope.workspaceId, compatibilityId) as CompatibilityPlannerTask | undefined;
  if (!task) throw new Error("任务不存在");
  return task;
}

function getCompatibilityId(
  db: Database.Database,
  scope: WorkspaceScope,
  id: string,
): number {
  const row = db.prepare(`
    SELECT rowid AS compatibility_id FROM planner_tasks
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as { compatibility_id: number };
  return row.compatibility_id;
}

function getWorkspaceTimeZone(db: Database.Database, scope: WorkspaceScope): string {
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?")
    .get(scope.workspaceId) as { timezone: string } | undefined;
  if (!workspace) throw new Error("学习空间不存在");
  return workspace.timezone;
}

function compareDayTaskProjection(a: DayTask, b: DayTask): number {
  if (a.scheduled_start && !b.scheduled_start) return -1;
  if (!a.scheduled_start && b.scheduled_start) return 1;
  return (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? "")
    || a.priority - b.priority
    || a.sort_order - b.sort_order
    || a.id - b.id;
}

function normalizePriority(value: number | undefined): 1 | 2 | 3 {
  const priority = value === undefined ? 2 : Math.round(Number(value));
  if (priority !== 1 && priority !== 2 && priority !== 3) throw new Error("任务优先级需为高、中或低");
  return priority;
}

function normalizeEstimatedMinutes(value: number | undefined): number {
  const minutes = value === undefined ? 30 : Math.round(Number(value));
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) throw new Error("预计时长需在 5-480 分钟之间");
  return minutes;
}

function normalizeScheduledStart(value: string | null | undefined): string | null {
  const start = value?.trim() || "";
  if (!start) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) throw new Error("开始时间格式需为 HH:MM");
  return start;
}

function normalizeTaskNotes(value: string | undefined): string {
  return (value || "").trim().slice(0, 500);
}

function normalizeSubjectCode(
  db: Database.Database,
  scope: WorkspaceScope,
  value: string | undefined,
): string | null {
  const subjectCode = value?.trim() || "";
  if (!subjectCode) return null;
  const subject = db.prepare("SELECT 1 FROM subjects WHERE workspace_id = ? AND code = ?")
    .get(scope.workspaceId, subjectCode);
  if (!subject) throw new Error("科目不存在");
  return subjectCode;
}

export function listNotes(db: Database.Database, scope: WorkspaceScope, day: string): DayNote[] {
  assertDateKey(day);
  return db.prepare(`
    SELECT id, day, content, created_at
    FROM day_notes
    WHERE workspace_id = @workspaceId AND day = @day
    ORDER BY id ASC
  `).all({ workspaceId: scope.workspaceId, day }) as DayNote[];
}

export function addNote(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { day: string; content: string },
): DayNote {
  const day = assertDateKey(input.day);
  const content = input.content.trim();
  if (!content) throw new Error("随笔内容必填");
  ensureDay(db, scope, day);
  const result = db.prepare(`
    INSERT INTO day_notes (workspace_id, day, content) VALUES (?, ?, ?)
  `).run(scope.workspaceId, day, content);
  return db.prepare(`
    SELECT id, day, content, created_at FROM day_notes WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, Number(result.lastInsertRowid)) as DayNote;
}

export function updateNote(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: number; content: string },
): void {
  const content = input.content.trim();
  if (!content) throw new Error("随笔内容必填");
  const result = db.prepare(`
    UPDATE day_notes SET content = ? WHERE workspace_id = ? AND id = ?
  `).run(content, scope.workspaceId, input.id);
  if (!result.changes) throw new Error("随笔不存在");
}

export function deleteNote(db: Database.Database, scope: WorkspaceScope, id: number): void {
  db.prepare("DELETE FROM day_notes WHERE workspace_id = ? AND id = ?").run(scope.workspaceId, id);
}
