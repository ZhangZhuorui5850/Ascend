import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { WorkspaceScope } from "../access-context";
import type { PlannerCalendar } from "../planner/types";

export function listPlannerCalendars(
  db: Database.Database,
  scope: WorkspaceScope,
): PlannerCalendar[] {
  return db.prepare(`
    SELECT id, workspace_id, name, color_token, is_default, visibility,
           sort_order, archived_at, created_at, updated_at
    FROM planner_calendars
    WHERE workspace_id = ? AND archived_at IS NULL
    ORDER BY is_default DESC, sort_order ASC, name COLLATE NOCASE ASC, id ASC
  `).all(scope.workspaceId) as PlannerCalendar[];
}

export function createPlannerCalendar(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { name: string; colorToken: string },
): PlannerCalendar {
  const name = input.name.trim();
  if (!name) throw new Error("日历名称必填");
  const id = randomUUID();
  const sortOrder = (db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS value
    FROM planner_calendars WHERE workspace_id = ?
  `).get(scope.workspaceId) as { value: number }).value;
  db.prepare(`
    INSERT INTO planner_calendars
      (id, workspace_id, name, color_token, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, scope.workspaceId, name, input.colorToken, sortOrder);
  return getPlannerCalendar(db, scope, id)!;
}

export function getPlannerCalendar(
  db: Database.Database,
  scope: WorkspaceScope,
  id: string,
): PlannerCalendar | null {
  return (db.prepare(`
    SELECT id, workspace_id, name, color_token, is_default, visibility,
           sort_order, archived_at, created_at, updated_at
    FROM planner_calendars WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as PlannerCalendar | undefined) ?? null;
}
