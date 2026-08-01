import type Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { RRule } from "rrule";
import type { WorkspaceScope } from "../access-context";
import {
  nextRecurrenceOccurrence,
  normalizeRRule,
} from "../planner/recurrence";
import type { PlannerTask, TaskSeries, TaskSeriesGenerationMode } from "../planner/types";
import { addMinutesToInstant, utcToZonedDateTime } from "../planner/time";

const templateSchema = z.object({
  listId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  notes: z.string().max(20_000).default(""),
  subjectCode: z.string().nullable().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  estimatedMinutes: z.number().int().min(5).max(1440).default(30),
});

type SeriesTemplate = z.infer<typeof templateSchema>;
type SeriesTemplateInput = z.input<typeof templateSchema>;

export function createTaskSeries(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    clientMutationId: string;
    rrule: string;
    timezone: string;
    generationMode: TaskSeriesGenerationMode;
    firstOccurrenceAt: string;
    template: SeriesTemplateInput;
  },
): { series: TaskSeries; task: PlannerTask } {
  const idempotencyKey = input.clientMutationId.trim();
  if (!idempotencyKey) throw new Error("clientMutationId 必填");
  const rrule = normalizeRRule(input.rrule);
  const template = templateSchema.parse(input.template);
  return db.transaction(() => {
    const replay = db.prepare(`
      SELECT * FROM task_series WHERE workspace_id = ? AND idempotency_key = ?
    `).get(scope.workspaceId, idempotencyKey) as TaskSeries | undefined;
    if (replay) {
      const task = db.prepare(`
        SELECT ${TASK_COLUMNS} FROM planner_tasks
        WHERE workspace_id = ? AND series_id = ?
        ORDER BY created_at ASC, id ASC LIMIT 1
      `).get(scope.workspaceId, replay.id) as PlannerTask | undefined;
      if (!task) throw new Error("重复任务系列缺少首个实例");
      return { series: replay, task };
    }
    assertTaskList(db, scope, template.listId);
    const firstOccurrenceAt = new Date(input.firstOccurrenceAt).toISOString();
    const localStart = utcToZonedDateTime(firstOccurrenceAt, input.timezone);
    const next = input.generationMode === "fixed_schedule"
      ? nextRecurrenceOccurrence({
          rrule,
          startDate: localStart.date,
          startTime: localStart.time,
          timeZone: input.timezone,
          after: firstOccurrenceAt,
        })?.startAt ?? null
      : null;
    const id = randomUUID();
    db.prepare(`
      INSERT INTO task_series
        (id, workspace_id, rrule, timezone, generation_mode, template_json,
         next_occurrence_at, active, generated_count, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
    `).run(
      id,
      scope.workspaceId,
      rrule,
      input.timezone,
      input.generationMode,
      JSON.stringify({ ...template, seriesStartAt: firstOccurrenceAt }),
      next,
      idempotencyKey,
    );
    const task = materializeTaskSeriesOccurrence(db, scope, getTaskSeries(db, scope, id)!, firstOccurrenceAt);
    return { series: getTaskSeries(db, scope, id)!, task };
  })();
}

export function getTaskSeries(
  db: Database.Database,
  scope: WorkspaceScope,
  id: string,
): TaskSeries | null {
  return (db.prepare(`
    SELECT id, workspace_id, rrule, timezone, generation_mode, template_json,
           next_occurrence_at, active, generated_count, idempotency_key, created_at, updated_at
    FROM task_series WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as TaskSeries | undefined) ?? null;
}

export function advanceTaskSeriesAfterCompletion(
  db: Database.Database,
  scope: WorkspaceScope,
  completedTask: PlannerTask,
): PlannerTask | null {
  if (!completedTask.series_id || !completedTask.completed_at) return null;
  const completedAt = completedTask.completed_at;
  return db.transaction(() => {
    const series = getTaskSeries(db, scope, completedTask.series_id!);
    if (!series || !series.active) return null;
    const existingOpen = db.prepare(`
      SELECT ${TASK_COLUMNS} FROM planner_tasks
      WHERE workspace_id = ? AND series_id = ? AND status = 'open' AND deleted_at IS NULL
      ORDER BY scheduled_start_at ASC, id ASC LIMIT 1
    `).get(scope.workspaceId, series.id) as PlannerTask | undefined;
    if (existingOpen) return existingOpen;
    const template = seriesTemplate(series);
    const countLimit = RRule.parseString(series.rrule).count;
    if (countLimit && series.generated_count >= countLimit) {
      db.prepare(`
        UPDATE task_series SET active = 0, next_occurrence_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ? AND id = ?
      `).run(scope.workspaceId, series.id);
      return null;
    }
    const occurrenceAt = series.generation_mode === "fixed_schedule"
      ? series.next_occurrence_at
      : nextAfterCompletion(series, template.seriesStartAt, completedAt);
    if (!occurrenceAt) {
      db.prepare(`
        UPDATE task_series SET active = 0, next_occurrence_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ? AND id = ?
      `).run(scope.workspaceId, series.id);
      return null;
    }
    const task = materializeTaskSeriesOccurrence(db, scope, series, occurrenceAt);
    const next = series.generation_mode === "fixed_schedule"
      ? nextAfterFixed(series, template.seriesStartAt, occurrenceAt)
      : null;
    db.prepare(`
      UPDATE task_series SET next_occurrence_at = ?, generated_count = generated_count + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ?
    `).run(next, scope.workspaceId, series.id);
    return task;
  })();
}

function materializeTaskSeriesOccurrence(
  db: Database.Database,
  scope: WorkspaceScope,
  series: TaskSeries,
  occurrenceAt: string,
): PlannerTask {
  const template = seriesTemplate(series);
  const id = stableOccurrenceId(scope.workspaceId, series.id, occurrenceAt);
  const endAt = addMinutesToInstant(occurrenceAt, template.estimatedMinutes);
  const sortOrder = (db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS value
    FROM planner_tasks WHERE workspace_id = ? AND list_id = ? AND parent_task_id IS NULL
  `).get(scope.workspaceId, template.listId) as { value: number }).value;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO planner_tasks
      (id, workspace_id, list_id, title, notes, subject_code, status, priority,
       scheduled_start_at, scheduled_end_at, scheduled_timezone, estimated_minutes,
       series_id, occurrence_key, sort_order, version, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id,
    scope.workspaceId,
    template.listId,
    template.title,
    template.notes,
    template.subjectCode ?? null,
    template.priority,
    occurrenceAt,
    endAt,
    series.timezone,
    template.estimatedMinutes,
    series.id,
    occurrenceAt,
    sortOrder,
    now,
    now,
  );
  const task = db.prepare(`
    SELECT ${TASK_COLUMNS} FROM planner_tasks WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as PlannerTask;
  db.prepare(`
    INSERT OR IGNORE INTO entity_changes
      (workspace_id, op_id, entity_type, entity_id, op, base_version, patch_json, snapshot_json)
    VALUES (?, ?, 'planner_task', ?, 'series-generate', NULL, '{}', ?)
  `).run(
    scope.workspaceId,
    `planner:${scope.workspaceId}:series:${series.id}:${occurrenceAt}`,
    task.id,
    JSON.stringify(task),
  );
  return task;
}

function nextAfterFixed(series: TaskSeries, seriesStartAt: string, after: string): string | null {
  const local = utcToZonedDateTime(seriesStartAt, series.timezone);
  return nextRecurrenceOccurrence({
    rrule: series.rrule,
    startDate: local.date,
    startTime: local.time,
    timeZone: series.timezone,
    after,
  })?.startAt ?? null;
}

function nextAfterCompletion(series: TaskSeries, seriesStartAt: string, completedAt: string): string | null {
  const completedLocal = utcToZonedDateTime(completedAt, series.timezone);
  const originalLocal = utcToZonedDateTime(seriesStartAt, series.timezone);
  return nextRecurrenceOccurrence({
    rrule: series.rrule,
    startDate: completedLocal.date,
    startTime: originalLocal.time,
    timeZone: series.timezone,
    after: completedAt,
  })?.startAt ?? null;
}

function seriesTemplate(series: TaskSeries): SeriesTemplate & { seriesStartAt: string } {
  const parsed = JSON.parse(series.template_json) as unknown;
  return templateSchema.extend({ seriesStartAt: z.iso.datetime({ offset: true }) }).parse(parsed);
}

function assertTaskList(db: Database.Database, scope: WorkspaceScope, id: string): void {
  const row = db.prepare(`
    SELECT 1 FROM task_lists WHERE workspace_id = ? AND id = ? AND archived_at IS NULL
  `).get(scope.workspaceId, id);
  if (!row) throw new Error("任务清单不存在");
}

function stableOccurrenceId(workspaceId: string, seriesId: string, occurrenceAt: string): string {
  const digest = createHash("sha256")
    .update(`${workspaceId}\u0000${seriesId}\u0000${occurrenceAt}`)
    .digest("hex")
    .slice(0, 32);
  return `${seriesId}:occurrence:${digest}`;
}

const TASK_COLUMNS = `
  id, workspace_id, list_id, parent_task_id, depth, title, notes, subject_code,
  status, priority, due_date, due_at, due_timezone, scheduled_start_at,
  scheduled_end_at, scheduled_timezone, scheduled_all_day, estimated_minutes,
  series_id, occurrence_key, sort_order, deleted_at, completed_at, canceled_at,
  version, legacy_day_task_id, created_at, updated_at
`;
