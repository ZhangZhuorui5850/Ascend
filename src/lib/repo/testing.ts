import Database from "better-sqlite3";
import { initializeDatabase } from "../db";
import { runMigrations } from "../migrations";

/** 内存数据库，用于测试：与生产同一套建表 + 迁移流程。 */
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  initializeDatabase(db);
  runMigrations(db);
  return db;
}

export function seedSubjectWithChapter(db: Database.Database) {
  db.prepare("INSERT INTO subjects (code, name, description) VALUES ('M1', '线性代数', '')").run();
  db.prepare(`
    INSERT INTO subject_chapters (id, subject_code, title, sort_order)
    VALUES ('chapter:M1:matrix', 'M1', '矩阵', 1)
  `).run();
  db.prepare(`
    INSERT INTO knowledge_points
      (id, subject_code, subject_name, submodule, tier, tier_name, title, exam, status, mastery, reviews, chapter_id, sort_order)
    VALUES
      ('kp1', 'M1', '线性代数', '矩阵', 'r', '精通', '矩阵乘法', 1, '未学', 0, 0, 'chapter:M1:matrix', 1)
  `).run();
}
