import type Database from "better-sqlite3";
import { assertDateKey } from "../dates";
import { nextReviewDate } from "../review-schedule";
import { ensureDay } from "./days";

export type MistakeListItem = {
  id: number;
  day: string;
  title: string;
  cause: string;
  next_review: string | null;
  graduated: number;
  subject_code: string | null;
  knowledge_point_id: string | null;
  knowledge_title: string | null;
};

export type MistakeBook = {
  due: MistakeListItem[];
  open: MistakeListItem[];
  graduated: MistakeListItem[];
};

export function createStudySession(
  db: Database.Database,
  input: { day: string; title: string; durationMinutes?: number; subjectCode?: string; knowledgePointId?: string; output?: string },
): void {
  const day = assertDateKey(input.day);
  const title = input.title.trim();
  if (!title) throw new Error("学习记录标题必填");
  ensureDay(db, day);
  db.prepare(`
    INSERT INTO study_sessions (day, subject_code, knowledge_point_id, title, duration_minutes, output)
    VALUES (@day, @subjectCode, @knowledgePointId, @title, @durationMinutes, @output)
  `).run({
    day,
    subjectCode: input.subjectCode?.trim() || null,
    knowledgePointId: input.knowledgePointId?.trim() || null,
    title,
    durationMinutes: Math.max(0, Math.round(Number(input.durationMinutes) || 0)),
    output: (input.output || "").trim(),
  });
}

export function createMistake(
  db: Database.Database,
  input: { day: string; title: string; cause?: string; subjectCode?: string; knowledgePointId?: string },
): void {
  const day = assertDateKey(input.day);
  const title = input.title.trim();
  if (!title) throw new Error("错题标题必填");
  const knowledgePointId = input.knowledgePointId?.trim() || null;
  ensureDay(db, day);
  db.prepare(`
    INSERT INTO mistakes (day, subject_code, knowledge_point_id, title, cause, next_review)
    VALUES (@day, @subjectCode, @knowledgePointId, @title, @cause, @nextReview)
  `).run({
    day,
    subjectCode: input.subjectCode?.trim() || null,
    knowledgePointId,
    title,
    cause: (input.cause || "").trim(),
    nextReview: nextReviewDate(day, 0),
  });
  if (knowledgePointId) applyMistakeOutcome(db, { knowledgePointId, day });
}

export function createReviewEvent(
  db: Database.Database,
  input: { day: string; knowledgePointId?: string; score: number; note?: string },
): void {
  const day = assertDateKey(input.day);
  const knowledgePointId = input.knowledgePointId?.trim() || null;
  const score = clamp(Math.round(Number(input.score) || 0), 0, 3);
  ensureDay(db, day);
  db.prepare(`
    INSERT INTO review_events (day, knowledge_point_id, score, note)
    VALUES (@day, @knowledgePointId, @score, @note)
  `).run({ day, knowledgePointId, score, note: (input.note || "").trim() });
  if (knowledgePointId) applyReviewOutcome(db, { knowledgePointId, day, score });
}

export function reattemptMistake(
  db: Database.Database,
  input: { id: number; day: string; score: number },
): { id: number; graduated: number; nextReview: string | null } {
  const day = assertDateKey(input.day);
  const mistake = db.prepare("SELECT id, knowledge_point_id FROM mistakes WHERE id = ?").get(input.id) as
    | { id: number; knowledge_point_id: string | null }
    | undefined;
  if (!mistake) throw new Error("错题不存在");

  const score = clamp(Math.round(Number(input.score) || 0), 0, 3);
  const graduated = score >= 2 ? 1 : 0;
  const nextReview = graduated ? null : nextReviewDate(day, 0);
  db.prepare("UPDATE mistakes SET graduated = @graduated, next_review = @nextReview WHERE id = @id").run({
    id: input.id,
    graduated,
    nextReview,
  });

  if (mistake.knowledge_point_id) {
    ensureDay(db, day);
    db.prepare(`
      INSERT INTO review_events (day, knowledge_point_id, score, note)
      VALUES (@day, @knowledgePointId, @score, '错题回炉')
    `).run({ day, knowledgePointId: mistake.knowledge_point_id, score });
    applyReviewOutcome(db, { knowledgePointId: mistake.knowledge_point_id, day, score });
  }

  return { id: input.id, graduated, nextReview };
}

export function getMistakeBook(db: Database.Database, today: string): MistakeBook {
  assertDateKey(today);
  const rows = db.prepare(`
    SELECT m.id, m.day, m.title, m.cause, m.next_review, m.graduated, m.subject_code,
           m.knowledge_point_id, k.title AS knowledge_title
    FROM mistakes m
    LEFT JOIN knowledge_points k ON k.id = m.knowledge_point_id
    ORDER BY m.created_at DESC
  `).all() as MistakeListItem[];

  const due: MistakeListItem[] = [];
  const open: MistakeListItem[] = [];
  const graduated: MistakeListItem[] = [];
  for (const row of rows) {
    if (row.graduated) graduated.push(row);
    else if (row.next_review && row.next_review <= today) due.push(row);
    else open.push(row);
  }
  due.sort((a, b) => (a.next_review || "").localeCompare(b.next_review || ""));
  return { due, open, graduated };
}

export function applyReviewOutcome(
  db: Database.Database,
  input: { knowledgePointId: string; day: string; score: number },
): void {
  const point = db.prepare("SELECT reviews, mastery FROM knowledge_points WHERE id = ?").get(input.knowledgePointId) as
    | { reviews: number; mastery: number }
    | undefined;
  if (!point) return;

  const reviews = point.reviews + 1;
  const mastery = clamp(point.mastery + reviewMasteryDelta(input.score), 0, 100);
  const status = mastery >= 80 ? "已掌握" : mastery > 0 ? "学习中" : "未学";
  const nextReview = nextReviewDate(input.day, input.score <= 1 ? 0 : reviews);

  db.prepare(`
    UPDATE knowledge_points
    SET reviews = @reviews,
        mastery = @mastery,
        last_review = @day,
        next_review = @nextReview,
        status = @status
    WHERE id = @knowledgePointId
  `).run({ ...input, reviews, mastery, status, nextReview });
}

export function applyMistakeOutcome(
  db: Database.Database,
  input: { knowledgePointId: string; day: string },
): void {
  const point = db.prepare("SELECT mastery FROM knowledge_points WHERE id = ?").get(input.knowledgePointId) as
    | { mastery: number }
    | undefined;
  if (!point) return;

  const mastery = clamp(point.mastery - 15, 0, 100);
  db.prepare(`
    UPDATE knowledge_points
    SET mastery = @mastery,
        status = @status,
        next_review = @nextReview
    WHERE id = @knowledgePointId
  `).run({
    knowledgePointId: input.knowledgePointId,
    mastery,
    status: mastery >= 80 ? "已掌握" : "学习中",
    nextReview: nextReviewDate(input.day, 0),
  });
}

function reviewMasteryDelta(score: number): number {
  if (score >= 3) return 16;
  if (score === 2) return 8;
  if (score === 1) return -4;
  return -12;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
