import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { WorkspaceScope } from "../access-context";
import type { PlannerLabel, PlannerTask } from "../planner/types";
import { getPlannerTask } from "./planner-tasks";

export function listPlannerLabels(
  db: Database.Database,
  scope: WorkspaceScope,
): PlannerLabel[] {
  return db.prepare(`
    SELECT id, workspace_id, name, color_token, created_at
    FROM planner_labels
    WHERE workspace_id = ?
    ORDER BY name COLLATE NOCASE ASC, id ASC
  `).all(scope.workspaceId) as PlannerLabel[];
}

export function createPlannerLabel(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { name: string; colorToken: string },
): PlannerLabel {
  const name = input.name.trim();
  if (!name) throw new Error("标签名称必填");
  const id = randomUUID();
  db.prepare(`
    INSERT INTO planner_labels (id, workspace_id, name, color_token)
    VALUES (?, ?, ?, ?)
  `).run(id, scope.workspaceId, name, input.colorToken);
  return db.prepare(`
    SELECT id, workspace_id, name, color_token, created_at
    FROM planner_labels WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as PlannerLabel;
}

export function listPlannerTaskLabelIds(
  db: Database.Database,
  scope: WorkspaceScope,
): Record<string, string[]> {
  const rows = db.prepare(`
    SELECT task_id, label_id FROM planner_task_labels
    WHERE workspace_id = ? ORDER BY task_id, label_id
  `).all(scope.workspaceId) as Array<{ task_id: string; label_id: string }>;
  const result: Record<string, string[]> = {};
  for (const row of rows) (result[row.task_id] ??= []).push(row.label_id);
  return result;
}

export function setPlannerTaskLabels(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { taskId: string; expectedVersion: number; labelIds: string[] },
): PlannerTask {
  return db.transaction(() => {
    const task = getPlannerTask(db, scope, input.taskId);
    if (!task) throw new Error("任务不存在");
    if (task.version !== input.expectedVersion) throw new Error("任务版本冲突");
    const ids = [...new Set(input.labelIds)];
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(", ");
      const count = (db.prepare(`
        SELECT COUNT(*) AS count FROM planner_labels
        WHERE workspace_id = ? AND id IN (${placeholders})
      `).get(scope.workspaceId, ...ids) as { count: number }).count;
      if (count !== ids.length) throw new Error("标签不存在");
    }
    db.prepare(`
      DELETE FROM planner_task_labels WHERE workspace_id = ? AND task_id = ?
    `).run(scope.workspaceId, task.id);
    const insert = db.prepare(`
      INSERT INTO planner_task_labels (workspace_id, task_id, label_id)
      VALUES (?, ?, ?)
    `);
    for (const id of ids) insert.run(scope.workspaceId, task.id, id);
    db.prepare(`
      UPDATE planner_tasks
      SET version = version + 1, updated_at = ?
      WHERE workspace_id = ? AND id = ? AND version = ?
    `).run(new Date().toISOString(), scope.workspaceId, task.id, input.expectedVersion);
    return getPlannerTask(db, scope, task.id)!;
  })();
}
