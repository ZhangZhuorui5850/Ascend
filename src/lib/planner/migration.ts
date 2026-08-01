import type Database from "better-sqlite3";
import { listLegacyDayTaskProjection } from "../repo/planner-tasks";

export type PlannerMigrationIssue = {
  workspaceId: string;
  legacyTaskId?: number;
  field: string;
  expected: unknown;
  actual: unknown;
};

export type PlannerMigrationReport = {
  ok: boolean;
  workspaceCount: number;
  legacyTaskCount: number;
  migratedLegacyTaskCount: number;
  issues: PlannerMigrationIssue[];
};

export function verifyPlannerMigration(db: Database.Database): PlannerMigrationReport {
  const issues: PlannerMigrationIssue[] = [];
  const workspaces = db.prepare("SELECT id FROM workspaces ORDER BY id").all() as Array<{ id: string }>;
  const legacyTaskCount = (db.prepare("SELECT COUNT(*) AS count FROM day_tasks").get() as { count: number }).count;
  const migratedLegacyTaskCount = (db.prepare(`
    SELECT COUNT(*) AS count FROM planner_tasks WHERE legacy_day_task_id IS NOT NULL
  `).get() as { count: number }).count;

  for (const workspace of workspaces) {
    checkCount(db, issues, workspace.id, "inbox_count", 1, `
      SELECT COUNT(*) AS count FROM task_lists WHERE workspace_id = ? AND is_inbox = 1
    `);
    checkCount(db, issues, workspace.id, "default_calendar_count", 1, `
      SELECT COUNT(*) AS count FROM planner_calendars WHERE workspace_id = ? AND is_default = 1
    `);
    const legacy = db.prepare(`
      SELECT id, day, title, subject_code, done, sort_order, priority,
             estimated_minutes, scheduled_start, notes
      FROM day_tasks WHERE workspace_id = ? ORDER BY id ASC
    `).all(workspace.id) as Array<Record<string, unknown> & { id: number }>;
    const projected = listLegacyDayTaskProjection(db, { workspaceId: workspace.id });
    const projectedById = new Map(projected.map((task) => [task.id, task]));
    for (const expected of legacy) {
      const actual = projectedById.get(expected.id);
      if (!actual) {
        issues.push({
          workspaceId: workspace.id,
          legacyTaskId: expected.id,
          field: "row",
          expected: "present",
          actual: "missing",
        });
        continue;
      }
      for (const field of [
        "day",
        "title",
        "subject_code",
        "done",
        "sort_order",
        "priority",
        "estimated_minutes",
        "scheduled_start",
        "notes",
      ] as const) {
        if (expected[field] !== actual[field]) {
          issues.push({
            workspaceId: workspace.id,
            legacyTaskId: expected.id,
            field,
            expected: expected[field],
            actual: actual[field],
          });
        }
      }
    }
  }

  if (legacyTaskCount !== migratedLegacyTaskCount) {
    issues.push({
      workspaceId: "*",
      field: "legacy_task_count",
      expected: legacyTaskCount,
      actual: migratedLegacyTaskCount,
    });
  }
  return {
    ok: issues.length === 0,
    workspaceCount: workspaces.length,
    legacyTaskCount,
    migratedLegacyTaskCount,
    issues,
  };
}

function checkCount(
  db: Database.Database,
  issues: PlannerMigrationIssue[],
  workspaceId: string,
  field: string,
  expected: number,
  sql: string,
): void {
  const actual = (db.prepare(sql).get(workspaceId) as { count: number }).count;
  if (actual !== expected) issues.push({ workspaceId, field, expected, actual });
}
