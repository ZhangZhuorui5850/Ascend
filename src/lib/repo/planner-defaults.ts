import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { syncLegacyExamCountdownEvents } from "./planner-events";
import type { ExamCountdown } from "./settings";

export function plannerDefaultId(
  workspaceId: string,
  entity: "inbox" | "personal-calendar" | "milestone-calendar",
): string {
  return `${workspaceId}:planner:${entity}`;
}

export function ensurePlannerDefaults(db: Database.Database, scope: WorkspaceScope): void {
  const insertList = db.prepare(`
    INSERT OR IGNORE INTO task_lists
      (id, workspace_id, name, color_token, icon, sort_order, is_inbox)
    VALUES
      (@id, @workspaceId, 'Inbox', 'cinnabar', 'Inbox', 0, 1)
  `);
  const insertCalendar = db.prepare(`
    INSERT OR IGNORE INTO planner_calendars
      (id, workspace_id, name, color_token, is_default, visibility, sort_order)
    VALUES
      (@id, @workspaceId, @name, @colorToken, @isDefault, 'visible', @sortOrder)
  `);
  insertList.run({
    id: plannerDefaultId(scope.workspaceId, "inbox"),
    workspaceId: scope.workspaceId,
  });
  insertCalendar.run({
    id: plannerDefaultId(scope.workspaceId, "personal-calendar"),
    workspaceId: scope.workspaceId,
    name: "个人日历",
    colorToken: "summit-blue",
    isDefault: 1,
    sortOrder: 0,
  });
  insertCalendar.run({
    id: plannerDefaultId(scope.workspaceId, "milestone-calendar"),
    workspaceId: scope.workspaceId,
    name: "学习里程碑",
    colorToken: "cinnabar",
    isDefault: 0,
    sortOrder: 1,
  });
  syncLegacyExamCountdownEvents(db, scope, readLegacyExamCountdowns(db, scope));
}

function readLegacyExamCountdowns(db: Database.Database, scope: WorkspaceScope): ExamCountdown[] {
  const row = db.prepare(`
    SELECT value FROM app_settings WHERE workspace_id = ? AND key = 'exam_countdowns'
  `).get(scope.workspaceId) as { value: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ExamCountdown => (
      Boolean(item)
      && typeof item.name === "string"
      && typeof item.date === "string"
    ));
  } catch {
    return [];
  }
}
