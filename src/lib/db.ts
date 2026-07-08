import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { extractKnowledgeSeed } from "./knowledge-map";
import { runMigrations } from "./migrations";

let db: Database.Database | null = null;

export function getDataRoot(): string {
  return process.env.ZGCA_DATA_ROOT ?? path.resolve(process.cwd(), "data");
}

export function getUploadRoot(): string {
  return process.env.ZGCA_UPLOAD_ROOT ?? path.join(getDataRoot(), "uploads");
}

export function getSourceRoot(): string {
  if (process.env.ZGCA_SOURCE_ROOT) return process.env.ZGCA_SOURCE_ROOT;

  const candidates = [
    path.resolve(process.cwd(), ".."),
    path.join(process.env.USERPROFILE || "", "OneDrive", "桌面", "zgca"),
    path.join(process.env.USERPROFILE || "", "Desktop", "zgca"),
  ];

  const found = candidates.find((candidate) => existsSync(path.join(candidate, "知识地图页面.html")));
  return found ?? candidates[0];
}

export function getDb(): Database.Database {
  const database = getDbHandle();
  seedKnowledgeMap(database);
  seedChapterHierarchy(database);
  return database;
}

export function getDbHandle(): Database.Database {
  if (db) return db;

  const dataRoot = getDataRoot();
  mkdirSync(dataRoot, { recursive: true });
  db = new Database(path.join(dataRoot, "workbench.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  initializeDatabase(db);
  runMigrations(db, { uploadRoot: getUploadRoot() });
  return db;
}

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
      next_review TEXT
    );

    CREATE TABLE IF NOT EXISTS subject_chapters (
      id TEXT PRIMARY KEY,
      subject_code TEXT NOT NULL,
      title TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
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

function seedKnowledgeMap(database: Database.Database): void {
  const existing = database.prepare("SELECT COUNT(*) AS count FROM knowledge_points").get() as { count: number };
  if (existing.count > 0) return;

  const htmlPath = path.join(getSourceRoot(), "知识地图页面.html");
  if (!existsSync(htmlPath)) {
    throw new Error(`Knowledge map HTML not found: ${htmlPath}`);
  }

  const seed = extractKnowledgeSeed(readFileSync(htmlPath, "utf8"));
  const insertSubject = database.prepare(
    "INSERT OR REPLACE INTO subjects (code, name, description) VALUES (@code, @name, @description)",
  );
  const insertPoint = database.prepare(`
    INSERT OR REPLACE INTO knowledge_points
      (id, subject_code, subject_name, submodule, tier, tier_name, title, exam, status, mastery)
    VALUES
      (@id, @subjectCode, @subjectName, @submodule, @tier, @tierName, @title, @exam, @status, @mastery)
  `);

  const transaction = database.transaction(() => {
    for (const subject of seed.subjects) insertSubject.run(subject);
    for (const point of seed.points) insertPoint.run({ ...point, exam: point.exam ? 1 : 0 });
  });
  transaction();
}

function seedChapterHierarchy(database: Database.Database): void {
  const points = database.prepare(`
    SELECT subject_code, submodule, title
    FROM knowledge_points
    ORDER BY subject_code ASC, submodule ASC, id ASC
  `).all() as Array<{ subject_code: string; submodule: string; title: string }>;
  if (!points.length) return;

  const insertChapter = database.prepare(`
    INSERT OR IGNORE INTO subject_chapters (id, subject_code, title, sort_order)
    VALUES (@id, @subjectCode, @title, @sortOrder)
  `);
  const insertTag = database.prepare(`
    INSERT OR IGNORE INTO knowledge_tags (id, chapter_id, name)
    VALUES (@id, @chapterId, @name)
  `);
  const seenChapters = new Map<string, number>();

  const transaction = database.transaction(() => {
    for (const point of points) {
      const chapterTitle = point.submodule || "未分章";
      const chapterId = `chapter:${point.subject_code}:${slugForSeed(chapterTitle)}`;
      const key = `${point.subject_code}:${chapterTitle}`;
      const sortOrder = seenChapters.get(point.subject_code) || 0;
      if (!seenChapters.has(key)) {
        insertChapter.run({
          id: chapterId,
          subjectCode: point.subject_code,
          title: chapterTitle,
          sortOrder: sortOrder + 1,
        });
        seenChapters.set(point.subject_code, sortOrder + 1);
        seenChapters.set(key, sortOrder + 1);
      }
      insertTag.run({
        id: `kt:${chapterId}:${slugForSeed(point.title)}`,
        chapterId,
        name: point.title,
      });
    }
  });
  transaction();
}

function slugForSeed(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase()).replaceAll("%", "");
}
