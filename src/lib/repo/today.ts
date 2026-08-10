import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";

export type DueKnowledgeReviewCandidate = {
  id: string;
  title: string;
  subject_code: string | null;
  next_review: string;
  exam: 0 | 1;
};

export type DueMistakeRetestCandidate = {
  id: number;
  title: string;
  subject_code: string | null;
  next_review: string;
};

export type TodayReviewSummary = {
  dueKnowledgePoints: number;
  dueMistakes: number;
  estimatedMinutes: number;
};

export function listDueKnowledgeReviews(
  db: Database.Database,
  scope: WorkspaceScope,
  day: string,
): DueKnowledgeReviewCandidate[] {
  return db.prepare(`
    SELECT id, title, subject_code, next_review, exam
    FROM knowledge_points
    WHERE workspace_id = ? AND next_review IS NOT NULL AND next_review <= ?
    ORDER BY next_review ASC, mastery ASC, id ASC
  `).all(scope.workspaceId, day) as DueKnowledgeReviewCandidate[];
}

export function listDueMistakeRetests(
  db: Database.Database,
  scope: WorkspaceScope,
  day: string,
): DueMistakeRetestCandidate[] {
  return db.prepare(`
    SELECT id, title, subject_code, next_review
    FROM mistakes
    WHERE workspace_id = ? AND graduated = 0
      AND next_review IS NOT NULL AND next_review <= ?
    ORDER BY next_review ASC, created_at ASC, id ASC
  `).all(scope.workspaceId, day) as DueMistakeRetestCandidate[];
}

export function getTodayReviewSummary(
  db: Database.Database,
  scope: WorkspaceScope,
  day: string,
): TodayReviewSummary {
  const knowledge = db.prepare(`
    SELECT COUNT(*) AS count
    FROM knowledge_points
    WHERE workspace_id = ? AND next_review IS NOT NULL AND next_review <= ?
  `).get(scope.workspaceId, day) as { count: number };
  const mistakes = db.prepare(`
    SELECT COUNT(*) AS count
    FROM mistakes
    WHERE workspace_id = ? AND graduated = 0
      AND next_review IS NOT NULL AND next_review <= ?
  `).get(scope.workspaceId, day) as { count: number };
  return {
    dueKnowledgePoints: knowledge.count,
    dueMistakes: mistakes.count,
    // First-version planning heuristic, intentionally not recorded as study time.
    estimatedMinutes: knowledge.count * 5 + mistakes.count * 8,
  };
}

export function getWorkspaceTimeZone(
  db: Database.Database,
  scope: WorkspaceScope,
): string {
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?")
    .get(scope.workspaceId) as { timezone: string } | undefined;
  if (!workspace) throw new Error("学习空间不存在");
  return workspace.timezone;
}
