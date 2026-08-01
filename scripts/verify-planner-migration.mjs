import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

loadLocalEnv();

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const databasePath = path.resolve(
  process.argv[2]
    || path.join(process.env.ZGCA_DATA_ROOT || "data", "workbench.sqlite"),
);
if (!existsSync(databasePath)) throw new Error(`Database not found: ${databasePath}`);

const db = new Database(databasePath, { readonly: true, fileMustExist: true });
const issues = [];
const counts = {};

try {
  for (const table of [
    "task_lists",
    "planner_tasks",
    "planner_calendars",
    "calendar_events",
    "planner_labels",
    "planner_task_labels",
    "planner_event_labels",
    "task_series",
    "planner_reminders",
    "planner_notifications",
    "push_subscriptions",
  ]) {
    if (!tableExists(table)) issues.push({ type: "missing_table", table });
  }
  if (issues.some((issue) => issue.type === "missing_table")) {
    finish();
  } else {
    const migration = db.prepare(`
      SELECT version FROM schema_migrations WHERE version = '0018_planner_core'
    `).get();
    if (!migration) issues.push({ type: "missing_migration", version: "0018_planner_core" });
    const reminderMigration = db.prepare(`
      SELECT version FROM schema_migrations WHERE version = '0019_planner_recurrence_reminders'
    `).get();
    if (!reminderMigration) {
      issues.push({ type: "missing_migration", version: "0019_planner_recurrence_reminders" });
    }

    const workspaces = db.prepare("SELECT id, timezone FROM workspaces ORDER BY id").all();
    counts.workspaces = workspaces.length;
    for (const workspace of workspaces) {
      checkWorkspaceCount(workspace.id, "inbox", 1, `
        SELECT COUNT(*) AS count FROM task_lists
        WHERE workspace_id = ? AND is_inbox = 1
      `);
      checkWorkspaceCount(workspace.id, "default_calendar", 1, `
        SELECT COUNT(*) AS count FROM planner_calendars
        WHERE workspace_id = ? AND is_default = 1
      `);
      checkWorkspaceCount(workspace.id, "calendar_total", 2, `
        SELECT COUNT(*) AS count FROM planner_calendars
        WHERE workspace_id = ?
      `, "minimum");
    }

    const legacy = db.prepare(`
      SELECT d.workspace_id, d.id, d.day, d.title, d.subject_code, d.done, d.done_at,
             d.sort_order, d.priority, d.estimated_minutes, d.scheduled_start, d.notes,
             w.timezone,
             p.id AS planner_id, p.status, p.completed_at, p.due_date, p.due_at,
             p.scheduled_start_at, p.scheduled_end_at, p.scheduled_timezone,
             p.title AS planner_title, p.subject_code AS planner_subject_code,
             p.sort_order AS planner_sort_order, p.priority AS planner_priority,
             p.estimated_minutes AS planner_estimated_minutes, p.notes AS planner_notes
      FROM day_tasks d
      JOIN workspaces w ON w.id = d.workspace_id
      LEFT JOIN planner_tasks p
        ON p.workspace_id = d.workspace_id AND p.legacy_day_task_id = d.id
      ORDER BY d.workspace_id, d.id
    `).all();
    counts.legacyTasks = legacy.length;
    counts.migratedLegacyTasks = legacy.filter((row) => row.planner_id).length;
    for (const row of legacy) verifyLegacyRow(row);

    const duplicateMappings = db.prepare(`
      SELECT COUNT(*) AS count FROM (
        SELECT workspace_id, legacy_day_task_id
        FROM planner_tasks
        WHERE legacy_day_task_id IS NOT NULL
        GROUP BY workspace_id, legacy_day_task_id
        HAVING COUNT(*) > 1
      )
    `).get().count;
    counts.duplicateMappings = duplicateMappings;
    if (duplicateMappings) issues.push({ type: "duplicate_legacy_mapping", count: duplicateMappings });

    const triggerCount = db.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'trigger' AND name LIKE 'day_tasks_planner_v2_readonly_%'
    `).get().count;
    counts.readonlyTriggers = triggerCount;
    if (triggerCount !== 3) issues.push({ type: "readonly_trigger_count", expected: 3, actual: triggerCount });
    finish();
  }
} finally {
  db.close();
}

function verifyLegacyRow(row) {
  const identity = { workspaceId: row.workspace_id, legacyTaskId: row.id };
  if (!row.planner_id) {
    issues.push({ type: "missing_task", ...identity });
    return;
  }
  const pairs = [
    ["title", row.title, row.planner_title],
    ["subject_code", row.subject_code, row.planner_subject_code],
    ["sort_order", row.sort_order, row.planner_sort_order],
    ["priority", row.priority, row.planner_priority],
    ["estimated_minutes", row.estimated_minutes, row.planner_estimated_minutes],
    ["notes", row.notes, row.planner_notes],
    ["status", row.done ? "completed" : "open", row.status],
  ];
  for (const [field, expected, actual] of pairs) {
    if (expected !== actual) issues.push({ type: "field_mismatch", ...identity, field, expected, actual });
  }
  if (row.done_at && row.completed_at !== row.done_at) {
    issues.push({
      type: "field_mismatch",
      ...identity,
      field: "completed_at",
      expected: row.done_at,
      actual: row.completed_at,
    });
  }
  if (row.scheduled_start) {
    const local = localParts(row.scheduled_start_at, row.timezone);
    if (
      local.date !== row.day
      || local.time !== row.scheduled_start
      || row.scheduled_timezone !== row.timezone
      || row.due_date !== null
      || row.due_at !== null
    ) {
      issues.push({
        type: "scheduled_round_trip",
        ...identity,
        expected: { date: row.day, time: row.scheduled_start, timezone: row.timezone },
        actual: {
          date: local.date,
          time: local.time,
          timezone: row.scheduled_timezone,
          dueDate: row.due_date,
          dueAt: row.due_at,
        },
      });
    }
    const duration = (
      new Date(row.scheduled_end_at).getTime()
      - new Date(row.scheduled_start_at).getTime()
    ) / 60_000;
    if (duration !== row.estimated_minutes) {
      issues.push({
        type: "scheduled_duration",
        ...identity,
        expected: row.estimated_minutes,
        actual: duration,
      });
    }
  } else if (
    row.due_date !== row.day
    || row.due_at !== null
    || row.scheduled_start_at !== null
    || row.scheduled_end_at !== null
  ) {
    issues.push({
      type: "unscheduled_mapping",
      ...identity,
      expected: { dueDate: row.day },
      actual: {
        dueDate: row.due_date,
        dueAt: row.due_at,
        scheduledStartAt: row.scheduled_start_at,
        scheduledEndAt: row.scheduled_end_at,
      },
    });
  }
}

function localParts(value, timeZone) {
  if (!value) return { date: null, time: null };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function checkWorkspaceCount(workspaceId, entity, expected, sql, mode = "exact") {
  const actual = db.prepare(sql).get(workspaceId).count;
  counts[`${workspaceId}:${entity}`] = actual;
  const valid = mode === "minimum" ? actual >= expected : actual === expected;
  if (!valid) issues.push({ type: "workspace_default_count", workspaceId, entity, expected, actual, mode });
}

function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function finish() {
  const report = { ok: issues.length === 0, databasePath, counts, issues };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function loadLocalEnv() {
  const envPath = path.resolve(".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match || process.env[match[1].trim()]) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}
