import type Database from "better-sqlite3";
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

export function ensureDay(db: Database.Database, date: string): void {
  assertDateKey(date);
  db.prepare("INSERT OR IGNORE INTO daily_entries (date) VALUES (?)").run(date);
}

export function getDay(db: Database.Database, date: string, options: { reviewLimit?: number } = {}): DayData {
  assertDateKey(date);
  ensureDay(db, date);
  const reviewLimit = Math.max(1, options.reviewLimit ?? 12);
  const entry = db.prepare("SELECT * FROM daily_entries WHERE date = ?").get(date) as DayEntry;
  const assets = db.prepare(`
    SELECT id, original_name, mime_type, size, folder_path
    FROM assets WHERE day = ? ORDER BY created_at DESC
  `).all(date) as DayData["assets"];
  const sessions = db.prepare(`
    SELECT id, title, subject_code, duration_minutes, output
    FROM study_sessions WHERE day = ? ORDER BY created_at DESC
  `).all(date) as DayData["sessions"];
  const reviews = db.prepare(`
    SELECT r.id, r.score, r.note, k.title AS knowledge_title, k.subject_code
    FROM review_events r
    LEFT JOIN knowledge_points k ON k.id = r.knowledge_point_id
    WHERE r.day = ?
    ORDER BY r.created_at DESC
  `).all(date) as DayData["reviews"];
  const mistakes = db.prepare(`
    SELECT id, title, cause, next_review, graduated
    FROM mistakes WHERE day = ? ORDER BY created_at DESC
  `).all(date) as DayData["mistakes"];
  const dueReviews = db.prepare(`
    SELECT id, title, subject_code, tier_name, mastery, next_review
    FROM knowledge_points
    WHERE next_review IS NOT NULL AND next_review <= @date
    ORDER BY tier ASC, next_review ASC
    LIMIT @limit
  `).all({ date, limit: reviewLimit }) as DueReview[];
  const dueReviewsTotal = (db.prepare(`
    SELECT COUNT(*) AS count FROM knowledge_points
    WHERE next_review IS NOT NULL AND next_review <= ?
  `).get(date) as { count: number }).count;
  const dueMistakes = db.prepare(`
    SELECT m.id, m.title, m.cause, m.knowledge_point_id, m.next_review, k.title AS knowledge_title
    FROM mistakes m
    LEFT JOIN knowledge_points k ON k.id = m.knowledge_point_id
    WHERE m.graduated = 0 AND m.next_review IS NOT NULL AND m.next_review <= ?
    ORDER BY m.next_review ASC, m.created_at ASC
    LIMIT 12
  `).all(date) as DueMistake[];

  return {
    entry,
    tasks: listTasks(db, date),
    notes: listNotes(db, date),
    dueReviews,
    dueReviewsTotal,
    dueMistakes,
    assets,
    sessions,
    reviews,
    mistakes,
  };
}

export function updateDayEntry(db: Database.Database, date: string, input: Partial<Record<DayField, string>>): void {
  assertDateKey(date);
  ensureDay(db, date);
  const current = db.prepare("SELECT * FROM daily_entries WHERE date = ?").get(date) as DayEntry;
  const next: Record<string, string> = { date };
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
    WHERE date = @date
  `).run(next);
}
