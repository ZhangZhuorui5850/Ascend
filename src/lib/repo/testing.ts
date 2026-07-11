import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { initializeDatabase } from "../db";
import { runMigrations } from "../migrations";
import { ensureWorkspaceForUser, LEGACY_WORKSPACE_ID } from "./workspaces";

/** 内存数据库，用于测试：与生产同一套建表 + 迁移流程。 */
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  initializeDatabase(db);
  runMigrations(db);
  return db;
}

export function createTestWorkspace(
  db: Database.Database,
  input: { userId?: string; email?: string; displayName?: string } = {},
): { userId: string; workspaceId: string } {
  const userId = input.userId ?? randomUUID();
  const displayName = input.displayName ?? "测试用户";
  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, role, status)
    VALUES (?, ?, 'test-password-hash', ?, 'user', 'active')
  `).run(userId, input.email ?? `${userId}@example.com`, displayName);
  const { workspaceId } = ensureWorkspaceForUser(db, { id: userId, displayName });
  return { userId, workspaceId };
}

export function seedSubjectWithChapter(
  db: Database.Database,
  scope: { workspaceId: string } = { workspaceId: LEGACY_WORKSPACE_ID },
) {
  db.prepare(`
    INSERT INTO subjects (workspace_id, code, name, description)
    VALUES (?, 'M1', '线性代数', '')
  `).run(scope.workspaceId);
  db.prepare(`
    INSERT INTO subject_chapters (workspace_id, id, subject_code, title, sort_order)
    VALUES (?, 'chapter:M1:matrix', 'M1', '矩阵', 1)
  `).run(scope.workspaceId);
  db.prepare(`
    INSERT INTO knowledge_points
      (workspace_id, id, subject_code, subject_name, submodule, tier, tier_name, title,
       exam, status, mastery, reviews, chapter_id, sort_order)
    VALUES
      (?, 'kp1', 'M1', '线性代数', '矩阵', 'r', '精通', '矩阵乘法',
       1, '未学', 0, 0, 'chapter:M1:matrix', 1)
  `).run(scope.workspaceId);
}
