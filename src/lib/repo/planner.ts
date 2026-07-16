import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey } from "../dates";
import { ensureDay } from "./days";

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
  return db.prepare(`
    SELECT id, day, title, subject_code, done, sort_order,
           priority, estimated_minutes, scheduled_start, notes
    FROM day_tasks
    WHERE workspace_id = @workspaceId AND day = @day
    ORDER BY CASE WHEN scheduled_start IS NULL THEN 1 ELSE 0 END ASC,
             scheduled_start ASC,
             priority ASC,
             sort_order ASC,
             id ASC
  `).all({ workspaceId: scope.workspaceId, day }) as DayTask[];
}

export function listCalendarTasks(db: Database.Database, scope: WorkspaceScope): DayTask[] {
  return db.prepare(`
    SELECT id, day, title, subject_code, done, sort_order,
           priority, estimated_minutes, scheduled_start, notes
    FROM day_tasks
    WHERE workspace_id = @workspaceId
    ORDER BY day ASC,
             CASE WHEN scheduled_start IS NULL THEN 1 ELSE 0 END ASC,
             scheduled_start ASC, priority ASC, sort_order ASC, id ASC
  `).all({ workspaceId: scope.workspaceId }) as DayTask[];
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
  const maxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) AS value
    FROM day_tasks WHERE workspace_id = ? AND day = ?
  `).get(scope.workspaceId, day) as { value: number };
  const result = db.prepare(`
    INSERT INTO day_tasks
      (workspace_id, day, title, subject_code, sort_order, priority, estimated_minutes, scheduled_start, notes)
    VALUES
      (@workspaceId, @day, @title, @subjectCode, @sortOrder, @priority, @estimatedMinutes, @scheduledStart, @notes)
  `).run({
    workspaceId: scope.workspaceId,
    day,
    title,
    subjectCode,
    sortOrder: maxOrder.value + 1,
    priority,
    estimatedMinutes,
    scheduledStart,
    notes,
  });
  return db.prepare(`
    SELECT id, day, title, subject_code, done, sort_order,
           priority, estimated_minutes, scheduled_start, notes
    FROM day_tasks WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, Number(result.lastInsertRowid)) as DayTask;
}

export function toggleTask(db: Database.Database, scope: WorkspaceScope, input: { id: number; done: boolean }): void {
  const result = db.prepare(`
    UPDATE day_tasks
    SET done = @done,
        done_at = CASE WHEN @done = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE workspace_id = @workspaceId AND id = @id
  `).run({ workspaceId: scope.workspaceId, id: input.id, done: input.done ? 1 : 0 });
  if (!result.changes) throw new Error("任务不存在");
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
  const task = db.prepare(`
    SELECT title, subject_code, priority, estimated_minutes, scheduled_start, notes
    FROM day_tasks WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.id) as
    | {
        title: string;
        subject_code: string | null;
        priority: number;
        estimated_minutes: number;
        scheduled_start: string | null;
        notes: string;
      }
    | undefined;
  if (!task) throw new Error("任务不存在");
  const title = input.title === undefined ? task.title : input.title.trim();
  if (!title) throw new Error("任务内容必填");
  const subjectCode = input.subjectCode === undefined
    ? task.subject_code
    : normalizeSubjectCode(db, scope, input.subjectCode || undefined);
  const priority = input.priority === undefined ? task.priority : normalizePriority(input.priority);
  const estimatedMinutes = input.estimatedMinutes === undefined
    ? task.estimated_minutes
    : normalizeEstimatedMinutes(input.estimatedMinutes);
  const scheduledStart = input.scheduledStart === undefined
    ? task.scheduled_start
    : normalizeScheduledStart(input.scheduledStart);
  const notes = input.notes === undefined ? task.notes : normalizeTaskNotes(input.notes);
  db.prepare(`
    UPDATE day_tasks
    SET title = ?, subject_code = ?, priority = ?, estimated_minutes = ?, scheduled_start = ?, notes = ?
    WHERE workspace_id = ? AND id = ?
  `).run(title, subjectCode, priority, estimatedMinutes, scheduledStart, notes, scope.workspaceId, input.id);
}

export function scheduleTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: number; day: string; scheduledStart?: string | null; estimatedMinutes?: number },
): { previousDay: string; day: string } {
  const day = assertDateKey(input.day);
  const task = db.prepare(`
    SELECT day, estimated_minutes FROM day_tasks WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.id) as { day: string; estimated_minutes: number } | undefined;
  if (!task) throw new Error("任务不存在");
  const scheduledStart = normalizeScheduledStart(input.scheduledStart);
  const estimatedMinutes = input.estimatedMinutes === undefined
    ? task.estimated_minutes
    : normalizeEstimatedMinutes(input.estimatedMinutes);
  ensureDay(db, scope, day);
  const maxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) AS value
    FROM day_tasks WHERE workspace_id = ? AND day = ? AND id != ?
  `).get(scope.workspaceId, day, input.id) as { value: number };
  db.prepare(`
    UPDATE day_tasks
    SET day = @day,
        scheduled_start = @scheduledStart,
        estimated_minutes = @estimatedMinutes,
        sort_order = CASE WHEN day = @day THEN sort_order ELSE @sortOrder END
    WHERE workspace_id = @workspaceId AND id = @id
  `).run({
    workspaceId: scope.workspaceId,
    id: input.id,
    day,
    scheduledStart,
    estimatedMinutes,
    sortOrder: maxOrder.value + 1,
  });
  return { previousDay: task.day, day };
}

export function deleteTask(db: Database.Database, scope: WorkspaceScope, id: number): void {
  db.prepare("DELETE FROM day_tasks WHERE workspace_id = ? AND id = ?").run(scope.workspaceId, id);
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
  const open = db.prepare(`
    SELECT id FROM day_tasks WHERE workspace_id = ? AND day = ? AND done = 0
  `).all(scope.workspaceId, fromDay) as Array<{ id: number }>;
  if (!open.length) return 0;
  const maxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) AS value
    FROM day_tasks WHERE workspace_id = ? AND day = ?
  `).get(scope.workspaceId, toDay) as { value: number };
  const move = db.prepare("UPDATE day_tasks SET day = ?, scheduled_start = NULL, sort_order = ? WHERE workspace_id = ? AND id = ?");
  const run = db.transaction(() => {
    open.forEach((task, index) => move.run(toDay, maxOrder.value + index + 1, scope.workspaceId, task.id));
  });
  run();
  return open.length;
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
