import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { buildFallbackKnowledgeSeed } from "../knowledge-map";
import { ensurePlannerDefaults } from "./planner-defaults";

export const LEGACY_WORKSPACE_ID = "workspace:legacy";

export function ensureWorkspaceForUser(
  db: Database.Database,
  user: { id: string; displayName: string },
): { workspaceId: string } {
  const existing = db.prepare("SELECT id FROM workspaces WHERE owner_user_id = ?").get(user.id) as
    | { id: string }
    | undefined;
  if (existing) {
    ensurePlannerDefaults(db, { workspaceId: existing.id });
    return { workspaceId: existing.id };
  }

  return db.transaction(() => {
    const current = db.prepare("SELECT id FROM workspaces WHERE owner_user_id = ?").get(user.id) as
      | { id: string }
      | undefined;
    if (current) {
      ensurePlannerDefaults(db, { workspaceId: current.id });
      return { workspaceId: current.id };
    }

    const legacy = db.prepare("SELECT owner_user_id FROM workspaces WHERE id = ?").get(LEGACY_WORKSPACE_ID) as
      | { owner_user_id: string | null }
      | undefined;
    if (legacy && !legacy.owner_user_id) {
      db.prepare(`
        UPDATE workspaces
        SET owner_user_id = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND owner_user_id IS NULL
      `).run(user.id, user.displayName, LEGACY_WORKSPACE_ID);
      ensurePlannerDefaults(db, { workspaceId: LEGACY_WORKSPACE_ID });
      return { workspaceId: LEGACY_WORKSPACE_ID };
    }

    const workspaceId = `workspace:${randomUUID()}`;
    db.prepare(`
      INSERT INTO workspaces (id, owner_user_id, display_name)
      VALUES (?, ?, ?)
    `).run(workspaceId, user.id, user.displayName);
    cloneKnowledgeSeedForWorkspace(db, workspaceId);
    ensurePlannerDefaults(db, { workspaceId });
    return { workspaceId };
  })();
}

export function cloneKnowledgeSeedForWorkspace(db: Database.Database, workspaceId: string): void {
  const seed = buildFallbackKnowledgeSeed();
  const insertSubject = db.prepare(`
    INSERT INTO subjects (workspace_id, code, name, description)
    VALUES (@workspaceId, @code, @name, @description)
  `);
  const insertChapter = db.prepare(`
    INSERT INTO subject_chapters (workspace_id, id, subject_code, title, sort_order)
    VALUES (@workspaceId, @id, @subjectCode, @title, @sortOrder)
  `);
  const insertPoint = db.prepare(`
    INSERT INTO knowledge_points
      (workspace_id, id, subject_code, subject_name, submodule, tier, tier_name, title,
       exam, status, mastery, reviews, chapter_id, sort_order, created_at)
    VALUES
      (@workspaceId, @id, @subjectCode, @subjectName, @submodule, @tier, @tierName, @title,
       @exam, @status, @mastery, 0, @chapterId, @sortOrder, datetime('now'))
  `);

  for (const subject of seed.subjects) {
    insertSubject.run({ workspaceId, ...subject });
    const subjectPoints = seed.points.filter((point) => point.subjectCode === subject.code);
    const chapterOrder = new Map<string, number>();
    for (const point of subjectPoints) {
      if (!chapterOrder.has(point.submodule)) chapterOrder.set(point.submodule, chapterOrder.size + 1);
    }
    const chapterIds = new Map<string, string>();
    for (const [title, sortOrder] of chapterOrder) {
      const chapterId = `${workspaceId}:chapter:${subject.code}:${sortOrder}`;
      chapterIds.set(title, chapterId);
      insertChapter.run({ workspaceId, id: chapterId, subjectCode: subject.code, title, sortOrder });
    }
    subjectPoints.forEach((point, index) => {
      insertPoint.run({
        workspaceId,
        id: `${workspaceId}:${point.id}`,
        subjectCode: point.subjectCode,
        subjectName: point.subjectName,
        submodule: point.submodule,
        tier: point.tier,
        tierName: point.tierName,
        title: point.title,
        exam: point.exam ? 1 : 0,
        status: point.status,
        mastery: point.mastery,
        chapterId: chapterIds.get(point.submodule),
        sortOrder: index + 1,
      });
    });
  }
}
