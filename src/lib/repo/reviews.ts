import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
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
  scope: WorkspaceScope,
  input: { day: string; title: string; durationMinutes?: number; subjectCode?: string; knowledgePointId?: string; output?: string },
): void {
  const day = assertDateKey(input.day);
  const title = input.title.trim();
  if (!title) throw new Error("学习记录标题必填");
  ensureDay(db, scope, day);
  db.prepare(`
    INSERT INTO study_sessions
      (workspace_id, day, subject_code, knowledge_point_id, title, duration_minutes, output)
    VALUES (@workspaceId, @day, @subjectCode, @knowledgePointId, @title, @durationMinutes, @output)
  `).run({
    workspaceId: scope.workspaceId,
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
  scope: WorkspaceScope,
  input: { day: string; title: string; cause?: string; subjectCode?: string; knowledgePointId?: string },
): { id: number } {
  const day = assertDateKey(input.day);
  const title = input.title.trim();
  if (!title) throw new Error("错题标题必填");
  const knowledgePointId = input.knowledgePointId?.trim() || null;
  ensureDay(db, scope, day);
  const result = db.prepare(`
    INSERT INTO mistakes (workspace_id, day, subject_code, knowledge_point_id, title, cause, next_review)
    VALUES (@workspaceId, @day, @subjectCode, @knowledgePointId, @title, @cause, @nextReview)
  `).run({
    workspaceId: scope.workspaceId,
    day,
    subjectCode: input.subjectCode?.trim() || null,
    knowledgePointId,
    title,
    cause: (input.cause || "").trim(),
    nextReview: nextReviewDate(day, 0),
  });
  if (knowledgePointId) applyMistakeOutcome(db, scope, { knowledgePointId, day });
  return { id: Number(result.lastInsertRowid) };
}

export function createReviewEvent(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { day: string; knowledgePointId?: string; score: number; note?: string },
): void {
  const day = assertDateKey(input.day);
  const knowledgePointId = input.knowledgePointId?.trim() || null;
  const score = clamp(Math.round(Number(input.score) || 0), 0, 3);
  ensureDay(db, scope, day);
  db.prepare(`
    INSERT INTO review_events (workspace_id, day, knowledge_point_id, score, note)
    VALUES (@workspaceId, @day, @knowledgePointId, @score, @note)
  `).run({ workspaceId: scope.workspaceId, day, knowledgePointId, score, note: (input.note || "").trim() });
  if (knowledgePointId) applyReviewOutcome(db, scope, { knowledgePointId, day, score });
}

export function reattemptMistake(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: number; day: string; score: number },
): { id: number; graduated: number; nextReview: string | null } {
  const day = assertDateKey(input.day);
  const mistake = db.prepare(`
    SELECT id, knowledge_point_id FROM mistakes WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.id) as
    | { id: number; knowledge_point_id: string | null }
    | undefined;
  if (!mistake) throw new Error("错题不存在");

  const score = clamp(Math.round(Number(input.score) || 0), 0, 3);
  const graduated = score >= 2 ? 1 : 0;
  const nextReview = graduated ? null : nextReviewDate(day, 0);
  db.prepare(`
    UPDATE mistakes SET graduated = @graduated, next_review = @nextReview
    WHERE workspace_id = @workspaceId AND id = @id
  `).run({
    workspaceId: scope.workspaceId,
    id: input.id,
    graduated,
    nextReview,
  });

  if (mistake.knowledge_point_id) {
    ensureDay(db, scope, day);
    db.prepare(`
      INSERT INTO review_events (workspace_id, day, knowledge_point_id, score, note)
      VALUES (@workspaceId, @day, @knowledgePointId, @score, '错题回炉')
    `).run({ workspaceId: scope.workspaceId, day, knowledgePointId: mistake.knowledge_point_id, score });
    applyReviewOutcome(db, scope, { knowledgePointId: mistake.knowledge_point_id, day, score });
  }

  return { id: input.id, graduated, nextReview };
}

export function getMistakeBook(db: Database.Database, scope: WorkspaceScope, today: string): MistakeBook {
  assertDateKey(today);
  const rows = db.prepare(`
    SELECT m.id, m.day, m.title, m.cause, m.next_review, m.graduated, m.subject_code,
           m.knowledge_point_id, k.title AS knowledge_title
    FROM mistakes m
    LEFT JOIN knowledge_points k ON k.id = m.knowledge_point_id AND k.workspace_id = m.workspace_id
    WHERE m.workspace_id = ?
    ORDER BY m.created_at DESC
  `).all(scope.workspaceId) as MistakeListItem[];

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
  scope: WorkspaceScope,
  input: { knowledgePointId: string; day: string; score: number },
): void {
  const point = db.prepare(`
    SELECT reviews, mastery FROM knowledge_points WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.knowledgePointId) as
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
    WHERE workspace_id = @workspaceId AND id = @knowledgePointId
  `).run({ workspaceId: scope.workspaceId, ...input, reviews, mastery, status, nextReview });
}

export function applyMistakeOutcome(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { knowledgePointId: string; day: string },
): void {
  const point = db.prepare("SELECT mastery FROM knowledge_points WHERE workspace_id = ? AND id = ?").get(
    scope.workspaceId,
    input.knowledgePointId,
  ) as
    | { mastery: number }
    | undefined;
  if (!point) return;

  const mastery = clamp(point.mastery - 15, 0, 100);
  db.prepare(`
    UPDATE knowledge_points
    SET mastery = @mastery,
        status = @status,
        next_review = @nextReview
    WHERE workspace_id = @workspaceId AND id = @knowledgePointId
  `).run({
    workspaceId: scope.workspaceId,
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
