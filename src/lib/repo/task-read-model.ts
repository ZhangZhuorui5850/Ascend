import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey } from "../dates";
import type { LearningActivityType } from "../learning/types";
import type { PlannerTask, PlannerTaskStatus } from "../planner/types";
import { utcToZonedDateTime } from "../planner/time";
import { listPlannerTasks } from "./planner-tasks";

export type DayTaskItem = {
  id: string;
  version: number;
  legacy_day_task_id: number | null;
  day: string;
  title: string;
  subject_code: string | null;
  status: PlannerTaskStatus;
  done: 0 | 1;
  sort_order: number;
  priority: 1 | 2 | 3;
  estimated_minutes: number;
  scheduled_start: string | null;
  notes: string;
  learning_link_version: number;
  knowledge_point_id: string | null;
  activity_type: LearningActivityType;
  completion_criteria: string;
  source_type: string;
  source_id: string;
  actual_minutes: number | null;
  completion_output: string;
  planned_verification_method: string;
  verification_method: string;
  verification_result: string;
  verification_outcome: "" | "improved" | "unchanged" | "regressed" | "unknown";
};

export type CanonicalTaskPlacement = {
  task: PlannerTask;
  day: string;
  scheduledStart: string | null;
};

type TaskTiming = Pick<
  PlannerTask,
  | "due_date"
  | "due_at"
  | "due_timezone"
  | "scheduled_start_at"
  | "scheduled_timezone"
  | "scheduled_all_day"
>;

/**
 * One-pass canonical placement read for consumers that aggregate many days.
 * Scheduled execution wins over Due for placement; deleted and canceled tasks
 * never enter read models.
 */
export function listCanonicalTaskPlacements(
  db: Database.Database,
  scope: WorkspaceScope,
): CanonicalTaskPlacement[] {
  return listPlannerTasks(db, scope)
    .filter((task) => task.status !== "canceled")
    .map((task) => ({ task, ...resolveTaskPlacement(task) }));
}

export function resolveTaskPlacement(task: TaskTiming): {
  day: string;
  scheduledStart: string | null;
} {
  const scheduled = localSchedule(task);
  return {
    day: scheduled?.date ?? localDueDay(task) ?? "",
    scheduledStart: task.scheduled_all_day === 1
      ? null
      : scheduled?.time.slice(0, 5) ?? null,
  };
}

/**
 * Canonical Home/Day projection. It intentionally never manufactures a numeric
 * ID for Planner-only tasks: every consumer receives the Planner UUID/version.
 */
export function listDayTaskItems(
  db: Database.Database,
  scope: WorkspaceScope,
  day: string,
): DayTaskItem[] {
  assertDateKey(day);
  const placements = listPlannerTasks(db, scope)
    .filter((task) => task.status !== "canceled")
    .flatMap((task) => {
      const scheduled = localSchedule(task);
      const dueDay = localDueDay(task);
      if (scheduled?.date !== day && dueDay !== day) return [];
      return [{
        task,
        scheduledStart: scheduled?.date === day && task.scheduled_all_day !== 1
          ? scheduled.time.slice(0, 5)
          : null,
      }];
    });
  const learning = loadLearningProjections(db, scope, placements.map(({ task }) => task.id));
  return placements
    .map(({ task, scheduledStart }) => projectDayTask(
      task,
      day,
      scheduledStart,
      learning.links.get(task.id),
      task.status === "completed" ? learning.evidence.get(task.id) : undefined,
    ))
    .sort(compareDayTaskItems);
}

type LinkProjection = {
  task_id: string;
  version: number;
  knowledge_point_id: string | null;
  activity_type: LearningActivityType;
  completion_criteria: string;
  planned_verification_method: string;
  source_type: string;
  source_id: string;
};

type EvidenceProjection = {
  task_id: string;
  actual_minutes: number | null;
  output: string;
  verification_method: string;
  verification_result: string;
  verification_outcome: DayTaskItem["verification_outcome"];
};

type EvidenceProjectionRow = Omit<EvidenceProjection, "verification_outcome"> & {
  verification_outcome: string;
};

function projectDayTask(
  task: PlannerTask,
  day: string,
  scheduledStart: string | null,
  link?: LinkProjection,
  evidence?: EvidenceProjection,
): DayTaskItem {
  return {
    id: task.id,
    version: task.version,
    legacy_day_task_id: task.legacy_day_task_id,
    day,
    title: task.title,
    subject_code: task.subject_code,
    status: task.status,
    done: task.status === "completed" ? 1 : 0,
    sort_order: task.sort_order,
    priority: task.priority,
    estimated_minutes: task.estimated_minutes,
    scheduled_start: scheduledStart,
    notes: task.notes,
    learning_link_version: link?.version ?? 0,
    knowledge_point_id: link?.knowledge_point_id ?? null,
    activity_type: link?.activity_type ?? "unspecified",
    completion_criteria: link?.completion_criteria ?? "",
    source_type: link?.source_type ?? "",
    source_id: link?.source_id ?? "",
    actual_minutes: evidence?.actual_minutes ?? null,
    completion_output: evidence?.output ?? "",
    planned_verification_method: link?.planned_verification_method ?? "",
    verification_method: evidence?.verification_method ?? "",
    verification_result: evidence?.verification_result ?? "",
    verification_outcome: evidence?.verification_outcome ?? "",
  };
}

function loadLearningProjections(
  db: Database.Database,
  scope: WorkspaceScope,
  taskIds: string[],
): { links: Map<string, LinkProjection>; evidence: Map<string, EvidenceProjection> } {
  if (!taskIds.length) return { links: new Map(), evidence: new Map() };
  const placeholders = taskIds.map(() => "?").join(", ");
  const params = [scope.workspaceId, ...taskIds];
  const links = db.prepare(`
    SELECT task_id, version, knowledge_point_id, activity_type,
           completion_criteria, planned_verification_method, source_type, source_id
    FROM learning_task_links
    WHERE workspace_id = ? AND task_id IN (${placeholders})
  `).all(...params) as LinkProjection[];
  const evidence = db.prepare(`
    SELECT task_id, actual_minutes, output, verification_method,
           verification_result, verification_outcome
    FROM (
      SELECT task_id, actual_minutes, output, verification_method,
             verification_result, verification_outcome,
             ROW_NUMBER() OVER (
               PARTITION BY task_id
               ORDER BY completion_cycle DESC, day DESC, created_at DESC, id DESC
             ) AS rank
      FROM learning_evidence
      WHERE workspace_id = ? AND task_id IN (${placeholders})
        AND outcome != 'reopened' AND voided_at IS NULL AND corrected_by IS NULL
    )
    WHERE rank = 1
  `).all(...params) as EvidenceProjectionRow[];
  return {
    links: new Map(links.map((link) => [link.task_id, link])),
    evidence: new Map(evidence.map((item) => [item.task_id, {
      ...item,
      verification_outcome: normalizeVerificationOutcome(item.verification_outcome),
    }])),
  };
}

function normalizeVerificationOutcome(value: string): DayTaskItem["verification_outcome"] {
  if (
    value === "improved"
    || value === "unchanged"
    || value === "regressed"
    || value === "unknown"
  ) return value;
  return "";
}

function localSchedule(task: TaskTiming): { date: string; time: string } | null {
  return task.scheduled_start_at && task.scheduled_timezone
    ? utcToZonedDateTime(task.scheduled_start_at, task.scheduled_timezone)
    : null;
}

function localDueDay(task: TaskTiming): string | null {
  if (task.due_date) return task.due_date;
  return task.due_at && task.due_timezone
    ? utcToZonedDateTime(task.due_at, task.due_timezone).date
    : null;
}

export function compareDayTaskItems(a: DayTaskItem, b: DayTaskItem): number {
  if (a.scheduled_start && !b.scheduled_start) return -1;
  if (!a.scheduled_start && b.scheduled_start) return 1;
  return (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? "")
    || a.priority - b.priority
    || a.sort_order - b.sort_order
    || a.id.localeCompare(b.id);
}
