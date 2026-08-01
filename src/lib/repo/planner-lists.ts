import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { WorkspaceScope } from "../access-context";
import type { TaskList } from "../planner/types";
export { ensurePlannerDefaults } from "./planner-defaults";

export function listTaskLists(db: Database.Database, scope: WorkspaceScope): TaskList[] {
  return db.prepare(`
    SELECT id, workspace_id, name, color_token, icon, sort_order, is_inbox,
           archived_at, created_at, updated_at
    FROM task_lists
    WHERE workspace_id = ? AND archived_at IS NULL
    ORDER BY is_inbox DESC, sort_order ASC, name COLLATE NOCASE ASC, id ASC
  `).all(scope.workspaceId) as TaskList[];
}

export function createTaskList(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { name: string; colorToken: string; icon: string },
): TaskList {
  const name = input.name.trim();
  if (!name) throw new Error("清单名称必填");
  const id = randomUUID();
  const sortOrder = (db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS value
    FROM task_lists WHERE workspace_id = ?
  `).get(scope.workspaceId) as { value: number }).value;
  db.prepare(`
    INSERT INTO task_lists
      (id, workspace_id, name, color_token, icon, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, scope.workspaceId, name, input.colorToken, input.icon, sortOrder);
  return getTaskList(db, scope, id)!;
}

export function getTaskList(
  db: Database.Database,
  scope: WorkspaceScope,
  id: string,
): TaskList | null {
  return (db.prepare(`
    SELECT id, workspace_id, name, color_token, icon, sort_order, is_inbox,
           archived_at, created_at, updated_at
    FROM task_lists WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as TaskList | undefined) ?? null;
}
