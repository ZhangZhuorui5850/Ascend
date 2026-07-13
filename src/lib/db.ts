import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildFallbackKnowledgeSeed, extractKnowledgeSeed } from "./knowledge-map";
import { logError } from "./log";
import { backfillKnowledgeHierarchy, runMigrations } from "./migrations";
import { LEGACY_WORKSPACE_ID } from "./repo/workspaces";
import type { KnowledgeSeed } from "./types";

let db: Database.Database | null = null;

export function getDataRoot(): string {
  return process.env.ZGCA_DATA_ROOT ?? path.resolve(process.cwd(), "data");
}

export function getUploadRoot(): string {
  return process.env.ZGCA_UPLOAD_ROOT ?? path.join(getDataRoot(), "uploads");
}

export function getDb(): Database.Database {
  if (db) return db;

  const dataRoot = getDataRoot();
  mkdirSync(dataRoot, { recursive: true });
  db = new Database(path.join(dataRoot, "workbench.sqlite"));
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    db.pragma("synchronous = NORMAL");
    initializeDatabase(db);
    runMigrations(db, { uploadRoot: getUploadRoot() });
    seedKnowledgeMapIfEmpty(db);
  } catch (error) {
    // 初始化/迁移失败必须留下结构化日志再上抛，同时重置句柄避免复用半初始化的连接。
    logError("db.init", error, { dataRoot });
    db.close();
    db = null;
    throw error;
  }
  return db;
}

/** @deprecated 与 getDb 等价，保留兼容旧引用。 */
export const getDbHandle = getDb;

export function initializeDatabase(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_points (
      id TEXT PRIMARY KEY,
      subject_code TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      submodule TEXT NOT NULL,
      tier TEXT NOT NULL,
      tier_name TEXT NOT NULL,
      title TEXT NOT NULL,
      exam INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT '未学',
      mastery INTEGER NOT NULL DEFAULT 0,
      reviews INTEGER NOT NULL DEFAULT 0,
      last_review TEXT,
      next_review TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subject_chapters (
      id TEXT PRIMARY KEY,
      subject_code TEXT NOT NULL,
      title TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      parent_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(subject_code, title)
    );

    CREATE TABLE IF NOT EXISTS knowledge_tags (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(chapter_id, name)
    );

    CREATE TABLE IF NOT EXISTS daily_entries (
      date TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT '',
      diary TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      blockers TEXT NOT NULL DEFAULT '',
      tomorrow TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      original_name TEXT NOT NULL,
      safe_name TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'knowledge',
      folder_path TEXT NOT NULL DEFAULT '未归档',
      status TEXT NOT NULL DEFAULT '待整理',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS asset_tags (
      asset_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (asset_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS asset_knowledge_tags (
      asset_id INTEGER NOT NULL,
      knowledge_tag_id TEXT NOT NULL,
      PRIMARY KEY (asset_id, knowledge_tag_id)
    );

    CREATE TABLE IF NOT EXISTS asset_links (
      asset_id INTEGER NOT NULL,
      subject_code TEXT,
      chapter_id TEXT,
      knowledge_point_id TEXT,
      PRIMARY KEY (asset_id, subject_code, chapter_id, knowledge_point_id)
    );

    CREATE TABLE IF NOT EXISTS folders (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      subject_code TEXT,
      knowledge_point_id TEXT,
      title TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      output TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS review_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      knowledge_point_id TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mistakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      subject_code TEXT,
      knowledge_point_id TEXT,
      title TEXT NOT NULL,
      cause TEXT NOT NULL DEFAULT '',
      next_review TEXT,
      graduated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const columns = database.prepare("PRAGMA table_info(assets)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "status")) {
    database.exec("ALTER TABLE assets ADD COLUMN status TEXT NOT NULL DEFAULT '待整理'");
  }
  if (!columns.some((column) => column.name === "category")) {
    database.exec("ALTER TABLE assets ADD COLUMN category TEXT NOT NULL DEFAULT 'knowledge'");
  }
  if (!columns.some((column) => column.name === "folder_path")) {
    database.exec("ALTER TABLE assets ADD COLUMN folder_path TEXT NOT NULL DEFAULT '未归档'");
  }

  const assetLinkColumns = database.prepare("PRAGMA table_info(asset_links)").all() as Array<{ name: string }>;
  if (!assetLinkColumns.some((column) => column.name === "chapter_id")) {
    database.exec("ALTER TABLE asset_links ADD COLUMN chapter_id TEXT");
  }
}

function loadKnowledgeSeed(): KnowledgeSeed {
  const sourceRoot = process.env.ZGCA_SOURCE_ROOT;
  if (sourceRoot) {
    const htmlPath = path.join(sourceRoot, "知识地图页面.html");
    if (existsSync(htmlPath)) {
      try {
        return extractKnowledgeSeed(readFileSync(htmlPath, "utf8"));
      } catch {
        // fall through to the built-in seed
      }
    }
  }
  return buildFallbackKnowledgeSeed();
}

export function seedKnowledgeMapIfEmpty(database: Database.Database): void {
  const existing = database
    .prepare("SELECT COUNT(*) AS count FROM knowledge_points WHERE workspace_id = ?")
    .get(LEGACY_WORKSPACE_ID) as { count: number };
  if (existing.count > 0) return;

  const seed = loadKnowledgeSeed();
  const insertSubject = database.prepare(
    `INSERT OR REPLACE INTO subjects (workspace_id, code, name, description)
     VALUES (@workspaceId, @code, @name, @description)`,
  );
  const insertPoint = database.prepare(`
    INSERT OR REPLACE INTO knowledge_points
      (workspace_id, id, subject_code, subject_name, submodule, tier, tier_name, title, exam, status, mastery, created_at)
    VALUES
      (@workspaceId, @id, @subjectCode, @subjectName, @submodule, @tier, @tierName, @title, @exam, @status, @mastery, datetime('now'))
  `);

  const transaction = database.transaction(() => {
    for (const subject of seed.subjects) insertSubject.run({ workspaceId: LEGACY_WORKSPACE_ID, ...subject });
    for (const point of seed.points) {
      insertPoint.run({ workspaceId: LEGACY_WORKSPACE_ID, ...point, exam: point.exam ? 1 : 0 });
    }
  });
  transaction();
  backfillKnowledgeHierarchy(database);
}
