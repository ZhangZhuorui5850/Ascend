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
  mastery: number;
  next_review: string;
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
  assets: Array<{ id: number; original_name: string; mime_type: string; size: number; folder_path: string }>;
  sessions: Array<{ id: number; title: string; subject_code: string | null; duration_minutes: number; output: string }>;
  reviews: Array<{ id: number; knowledge_title: string | null; subject_code: string | null; score: number; note: string }>;
  mistakes: Array<{ id: number; title: string; cause: string; next_review: string | null; graduated: number }>;
};

export function ensureDay(db: Database.Database, scope: WorkspaceScope, date: string): void {
  assertDateKey(date);
  db.prepare("INSERT OR IGNORE INTO daily_entries (workspace_id, date) VALUES (?, ?)").run(scope.workspaceId, date);
}

export function getDay(
  db: Database.Database,
  scope: WorkspaceScope,
  date: string,
  options: { reviewLimit?: number } = {},
): DayData {
  assertDateKey(date);
  ensureDay(db, scope, date);
  const reviewLimit = Math.max(1, options.reviewLimit ?? 12);
  const params = { workspaceId: scope.workspaceId, date, limit: reviewLimit };
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
    SELECT r.id, r.score, r.note, k.title AS knowledge_title, k.subject_code
    FROM review_events r
    LEFT JOIN knowledge_points k ON k.id = r.knowledge_point_id AND k.workspace_id = r.workspace_id
    WHERE r.workspace_id = @workspaceId AND r.day = @date
    ORDER BY r.created_at DESC
  `).all(params) as DayData["reviews"];
  const mistakes = db.prepare(`
    SELECT id, title, cause, next_review, graduated
    FROM mistakes WHERE workspace_id = @workspaceId AND day = @date ORDER BY created_at DESC
  `).all(params) as DayData["mistakes"];
  const dueReviews = db.prepare(`
    SELECT id, title, subject_code, tier_name, mastery, next_review
    FROM knowledge_points
    WHERE workspace_id = @workspaceId AND next_review IS NOT NULL AND next_review <= @date
    ORDER BY tier ASC, next_review ASC
    LIMIT @limit
  `).all(params) as DueReview[];
  const dueReviewsTotal = (db.prepare(`
    SELECT COUNT(*) AS count FROM knowledge_points
    WHERE workspace_id = @workspaceId AND next_review IS NOT NULL AND next_review <= @date
  `).get(params) as { count: number }).count;
  const dueMistakes = db.prepare(`
    SELECT m.id, m.title, m.cause, m.knowledge_point_id, m.next_review, k.title AS knowledge_title
    FROM mistakes m
    LEFT JOIN knowledge_points k ON k.id = m.knowledge_point_id AND k.workspace_id = m.workspace_id
    WHERE m.workspace_id = @workspaceId
      AND m.graduated = 0 AND m.next_review IS NOT NULL AND m.next_review <= @date
    ORDER BY m.next_review ASC, m.created_at ASC
    LIMIT 12
  `).all(params) as DueMistake[];

  return {
    entry,
    tasks: listTasks(db, scope, date),
    notes: listNotes(db, scope, date),
    dueReviews,
    dueReviewsTotal,
    dueMistakes,
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
