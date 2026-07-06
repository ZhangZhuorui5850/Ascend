import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { extractKnowledgeSeed } from "./knowledge-map";

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
  if (db) return db;

  const dataRoot = getDataRoot();
  mkdirSync(dataRoot, { recursive: true });
  db = new Database(path.join(dataRoot, "workbench.sqlite"));
  db.pragma("journal_mode = WAL");
  initializeDatabase(db);
  seedKnowledgeMap(db);
  return db;
}

function initializeDatabase(database: Database.Database): void {
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

    CREATE TABLE IF NOT EXISTS asset_links (
      asset_id INTEGER NOT NULL,
      subject_code TEXT,
      knowledge_point_id TEXT,
      PRIMARY KEY (asset_id, subject_code, knowledge_point_id)
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
