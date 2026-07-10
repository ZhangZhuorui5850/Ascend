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
    SELECT id, day, title, subject_code, done, sort_order
    FROM day_tasks
    WHERE workspace_id = @workspaceId AND day = @day
    ORDER BY done ASC, sort_order ASC, id ASC
  `).all({ workspaceId: scope.workspaceId, day }) as DayTask[];
}

export function addTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { day: string; title: string; subjectCode?: string },
): DayTask {
  const day = assertDateKey(input.day);
  const title = input.title.trim();
  if (!title) throw new Error("任务内容必填");
  ensureDay(db, scope, day);
  const maxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) AS value
    FROM day_tasks WHERE workspace_id = ? AND day = ?
  `).get(scope.workspaceId, day) as { value: number };
  const result = db.prepare(`
    INSERT INTO day_tasks (workspace_id, day, title, subject_code, sort_order)
    VALUES (@workspaceId, @day, @title, @subjectCode, @sortOrder)
  `).run({
    workspaceId: scope.workspaceId,
    day,
    title,
    subjectCode: input.subjectCode?.trim() || null,
    sortOrder: maxOrder.value + 1,
  });
  return db.prepare(`
    SELECT id, day, title, subject_code, done, sort_order
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
  input: { id: number; title?: string; subjectCode?: string | null },
): void {
  const task = db.prepare(`
    SELECT title, subject_code FROM day_tasks WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.id) as
    | { title: string; subject_code: string | null }
    | undefined;
  if (!task) throw new Error("任务不存在");
  const title = input.title === undefined ? task.title : input.title.trim();
  if (!title) throw new Error("任务内容必填");
  const subjectCode = input.subjectCode === undefined ? task.subject_code : input.subjectCode?.trim() || null;
  db.prepare(`
    UPDATE day_tasks SET title = ?, subject_code = ? WHERE workspace_id = ? AND id = ?
  `).run(title, subjectCode, scope.workspaceId, input.id);
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
  const move = db.prepare("UPDATE day_tasks SET day = ?, sort_order = ? WHERE workspace_id = ? AND id = ?");
  const run = db.transaction(() => {
    open.forEach((task, index) => move.run(toDay, maxOrder.value + index + 1, scope.workspaceId, task.id));
  });
  run();
  return open.length;
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
