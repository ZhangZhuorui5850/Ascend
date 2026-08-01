import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey } from "../dates";
import { listNotes, listTasks, type DayNote, type DayTask } from "./planner";

export type DayEntry = {
  date: string;
  plan: string;
  diary: string;
  summary: string;
  blockers: string;
  tomorrow: string;
  updated_at: string;
};

export const DAY_FIELDS = ["plan", "diary", "summary", "blockers", "tomorrow"] as const;
export type DayField = (typeof DAY_FIELDS)[number];

export type DueReview = {
  id: string;
  title: string;
  subject_code: string;
  tier_name: string;
  status: string;
  mastery: number;
  next_review: string;
  prompt: string;
  answer: string;
};

export type DueMistake = {
  id: number;
  title: string;
  cause: string;
  knowledge_point_id: string | null;
  knowledge_title: string | null;
  next_review: string;
};

export type DayData = {
  entry: DayEntry;
  tasks: DayTask[];
  notes: DayNote[];
  dueReviews: DueReview[];
  dueReviewsTotal: number;
  dueMistakes: DueMistake[];
  dueMistakesTotal: number;
  assets: Array<{ id: number; original_name: string; mime_type: string; size: number; folder_path: string }>;
  sessions: Array<{ id: number; title: string; subject_code: string | null; duration_minutes: number; output: string }>;
  reviews: Array<{
    id: number;
    knowledge_title: string | null;
    subject_code: string | null;
    score: number;
    note: string;
    event_type: "point_review" | "mistake_reattempt";
    attempt_mode: string;
    pre_confidence: number | null;
  }>;
  mistakes: Array<{ id: number; title: string; cause: string; next_review: string | null; graduated: number }>;
};

export function getTomorrowPlan(db: Database.Database, scope: WorkspaceScope, date: string): string {
  assertDateKey(date);
  const row = db
    .prepare("SELECT tomorrow FROM daily_entries WHERE workspace_id = ? AND date = ?")
    .get(scope.workspaceId, date) as { tomorrow: string } | undefined;
  return row?.tomorrow?.trim() ?? "";
}

export function ensureDay(db: Database.Database, scope: WorkspaceScope, date: string): void {
  assertDateKey(date);
  db.prepare("INSERT OR IGNORE INTO daily_entries (workspace_id, date) VALUES (?, ?)").run(scope.workspaceId, date);
}

export function getDay(
  db: Database.Database,
  scope: WorkspaceScope,
  date: string,
  options: {
    reviewLimit?: number;
    sprintSubjectCodes?: string[];
    includeReviewQueue?: boolean;
  } = {},
): DayData {
  assertDateKey(date);
  ensureDay(db, scope, date);
  const reviewLimit = Math.max(1, options.reviewLimit ?? 12);
  const params = { workspaceId: scope.workspaceId, date };
  const entry = db.prepare(`
    SELECT * FROM daily_entries WHERE workspace_id = @workspaceId AND date = @date
  `).get(params) as DayEntry;
  const assets = db.prepare(`
    SELECT id, original_name, mime_type, size, folder_path
    FROM assets WHERE workspace_id = @workspaceId AND day = @date ORDER BY created_at DESC
  `).all(params) as DayData["assets"];
  const sessions = db.prepare(`
    SELECT id, title, subject_code, duration_minutes, output
    FROM study_sessions WHERE workspace_id = @workspaceId AND day = @date ORDER BY created_at DESC
  `).all(params) as DayData["sessions"];
  const reviews = db.prepare(`
    SELECT r.id, r.score, r.note, r.event_type, r.attempt_mode, r.pre_confidence,
           k.title AS knowledge_title, k.subject_code
    FROM review_events r
    LEFT JOIN knowledge_points k ON k.id = r.knowledge_point_id AND k.workspace_id = r.workspace_id
    WHERE r.workspace_id = @workspaceId AND r.day = @date
    ORDER BY r.created_at DESC
  `).all(params) as DayData["reviews"];
  const mistakes = db.prepare(`
    SELECT id, title, cause, next_review, graduated
    FROM mistakes WHERE workspace_id = @workspaceId AND day = @date ORDER BY created_at DESC
  `).all(params) as DayData["mistakes"];
  if (options.includeReviewQueue === false) {
    return {
      entry,
      tasks: listTasks(db, scope, date),
      notes: listNotes(db, scope, date),
      dueReviews: [],
      dueReviewsTotal: 0,
      dueMistakes: [],
      dueMistakesTotal: 0,
      assets,
      sessions,
      reviews,
      mistakes,
    };
  }
  // review_events 是当日容量的统一完成凭证；错题回炉也会写入一条事件。
  const remainingCapacity = Math.max(0, reviewLimit - reviews.length);
  const sprintSubjectCodes = [...new Set(
    (options.sprintSubjectCodes ?? []).map((code) => code.trim()).filter(Boolean),
  )];
  const sprintParams = Object.fromEntries(
    sprintSubjectCodes.map((code, index) => [`sprintSubject${index}`, code]),
  );
  const sprintPlaceholders = sprintSubjectCodes.map((_, index) => `@sprintSubject${index}`).join(", ");
  const sprintPriority = sprintSubjectCodes.length
    ? `CASE WHEN exam = 1 AND subject_code IN (${sprintPlaceholders}) THEN 0 ELSE 1 END`
    : "1";
  const queueParams = { ...params, ...sprintParams, limit: remainingCapacity };
  const dueReviewCandidates = db.prepare(`
    SELECT id, title, subject_code, tier_name, status, mastery, next_review, prompt, answer,
           ${sprintPriority} AS sprint_priority,
           CASE tier WHEN 'r' THEN 1 WHEN 'y' THEN 2 ELSE 3 END AS queue_priority
    FROM knowledge_points
    WHERE workspace_id = @workspaceId AND next_review IS NOT NULL AND next_review <= @date
    ORDER BY sprint_priority,
             queue_priority,
             next_review ASC,
             mastery ASC
    LIMIT @limit
  `).all(queueParams) as Array<DueReview & { sprint_priority: number; queue_priority: number }>;
  const dueReviewsTotal = (db.prepare(`
    SELECT COUNT(*) AS count FROM knowledge_points
    WHERE workspace_id = @workspaceId AND next_review IS NOT NULL AND next_review <= @date
  `).get(params) as { count: number }).count;
  const dueMistakeCandidates = db.prepare(`
    SELECT m.id, m.title, m.cause, m.knowledge_point_id, m.next_review, k.title AS knowledge_title,
           1 AS sprint_priority, 1 AS queue_priority
    FROM mistakes m
    LEFT JOIN knowledge_points k ON k.id = m.knowledge_point_id AND k.workspace_id = m.workspace_id
    WHERE m.workspace_id = @workspaceId
      AND m.graduated = 0 AND m.next_review IS NOT NULL AND m.next_review <= @date
    ORDER BY m.next_review ASC, m.created_at ASC
    LIMIT @limit
  `).all(queueParams) as Array<DueMistake & { sprint_priority: number; queue_priority: number }>;
  const dueMistakesTotal = (db.prepare(`
    SELECT COUNT(*) AS count FROM mistakes
    WHERE workspace_id = @workspaceId
      AND graduated = 0 AND next_review IS NOT NULL AND next_review <= @date
  `).get(params) as { count: number }).count;
  const scheduled = [
    ...dueReviewCandidates.map((item) => ({ kind: "review" as const, item })),
    ...dueMistakeCandidates.map((item) => ({ kind: "mistake" as const, item })),
  ]
    .sort((a, b) =>
      a.item.sprint_priority - b.item.sprint_priority ||
      a.item.queue_priority - b.item.queue_priority ||
      a.item.next_review.localeCompare(b.item.next_review) ||
      (a.kind === b.kind ? 0 : a.kind === "mistake" ? -1 : 1) ||
      ("mastery" in a.item && "mastery" in b.item ? a.item.mastery - b.item.mastery : 0)
    )
    .slice(0, remainingCapacity);
  const dueReviews = scheduled
    .filter((candidate): candidate is { kind: "review"; item: (typeof dueReviewCandidates)[number] } =>
      candidate.kind === "review")
    .map((candidate) => candidate.item);
  const dueMistakes = scheduled
    .filter((candidate): candidate is { kind: "mistake"; item: (typeof dueMistakeCandidates)[number] } =>
      candidate.kind === "mistake")
    .map((candidate) => candidate.item);

  return {
    entry,
    tasks: listTasks(db, scope, date),
    notes: listNotes(db, scope, date),
    dueReviews,
    dueReviewsTotal,
    dueMistakes,
    dueMistakesTotal,
    assets,
    sessions,
    reviews,
    mistakes,
  };
}

export function updateDayEntry(
  db: Database.Database,
  scope: WorkspaceScope,
  date: string,
  input: Partial<Record<DayField, string>>,
): void {
  assertDateKey(date);
  ensureDay(db, scope, date);
  const current = db.prepare(`
    SELECT * FROM daily_entries WHERE workspace_id = ? AND date = ?
  `).get(scope.workspaceId, date) as DayEntry;
  const next: Record<string, string> = { workspaceId: scope.workspaceId, date };
  for (const field of DAY_FIELDS) {
    next[field] = input[field] === undefined ? current[field] : String(input[field]);
  }
  db.prepare(`
    UPDATE daily_entries
    SET plan = @plan,
        diary = @diary,
        summary = @summary,
        blockers = @blockers,
        tomorrow = @tomorrow,
        updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = @workspaceId AND date = @date
  `).run(next);
}
