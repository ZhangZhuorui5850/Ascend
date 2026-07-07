import type Database from "better-sqlite3";
import { storeUploadedFile } from "./assets";
import type { CalendarSummary } from "./types";
import { buildCalendarSummaries } from "./calendar-summary";
import { assertDateKey, todayKey } from "./dates";
import { getDb } from "./db";
import { nextReviewDate } from "./review-schedule";
import { applyViewFilters, DEFAULT_VIEWS, getDefaultViewBySlug, type DataRow, type SavedView } from "./views";

export function ensureDay(date: string) {
  assertDateKey(date);
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO daily_entries (date) VALUES (?)").run(date);
  return getDay(date);
}

export function getDay(date: string) {
  assertDateKey(date);
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO daily_entries (date) VALUES (?)").run(date);
  const entry = db.prepare("SELECT * FROM daily_entries WHERE date = ?").get(date) as Record<string, string>;
  const drafts = db.prepare(`
    SELECT field, content
    FROM drafts
    WHERE scope_type = 'day' AND scope_id = ? AND status = 'active'
  `).all(date) as Array<{ field: string; content: string }>;
  for (const draft of drafts) {
    if (["plan", "diary", "summary", "blockers", "tomorrow"].includes(draft.field)) {
      entry[draft.field] = draft.content;
    }
  }
  const assets = db.prepare("SELECT * FROM assets WHERE day = ? ORDER BY created_at DESC").all(date);
  const sessions = db.prepare("SELECT * FROM study_sessions WHERE day = ? ORDER BY created_at DESC").all(date);
  const reviews = db.prepare(`
    SELECT r.*, k.title AS knowledge_title, k.subject_code
    FROM review_events r
    LEFT JOIN knowledge_points k ON k.id = r.knowledge_point_id
    WHERE r.day = ?
    ORDER BY r.created_at DESC
  `).all(date);
  const mistakes = db.prepare("SELECT * FROM mistakes WHERE day = ? ORDER BY created_at DESC").all(date);
  return { entry, assets, sessions, reviews, mistakes };
}

export function updateDay(date: string, input: Record<string, unknown>) {
  assertDateKey(date);
  const db = getDb();
  ensureDay(date);
  const nextEntry = {
    date,
    plan: String(input.plan ?? ""),
    diary: String(input.diary ?? ""),
    summary: String(input.summary ?? ""),
    blockers: String(input.blockers ?? ""),
    tomorrow: String(input.tomorrow ?? ""),
  };
  db.prepare(`
    UPDATE daily_entries
    SET plan = @plan,
        diary = @diary,
        summary = @summary,
        blockers = @blockers,
        tomorrow = @tomorrow,
        updated_at = CURRENT_TIMESTAMP
    WHERE date = @date
  `).run(nextEntry);
  markCommittedDayDraftsWithDb(db, date, nextEntry);
  return getDay(date);
}

export function markCommittedDayDraftsWithDb(
  database: Database.Database,
  date: string,
  input: Record<string, string>,
) {
  const commitMatchingDraft = database.prepare(`
    UPDATE drafts
    SET status = 'committed'
    WHERE scope_type = 'day'
      AND scope_id = @date
      AND field = @field
      AND content = @content
  `);
  const transaction = database.transaction(() => {
    for (const field of ["plan", "diary", "summary", "blockers", "tomorrow"]) {
      commitMatchingDraft.run({ date, field, content: input[field] ?? "" });
    }
  });
  transaction();
}

export function getDashboard() {
  const db = getDb();
  const today = todayKey();
  ensureDay(today);
  const pointStats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = '已掌握' THEN 1 ELSE 0 END) AS mastered,
      SUM(CASE WHEN tier = 'r' AND status != '已掌握' THEN 1 ELSE 0 END) AS openRed,
      SUM(CASE WHEN exam = 1 THEN 1 ELSE 0 END) AS examCount
    FROM knowledge_points
  `).get();
  const todayStats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM assets WHERE day = @today) AS assets,
      (SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions WHERE day = @today) AS studyMinutes,
      (SELECT COUNT(*) FROM review_events WHERE day = @today) AS reviews,
      (SELECT COUNT(*) FROM mistakes WHERE day = @today) AS mistakes
  `).get({ today });
  const due = db.prepare(`
    SELECT * FROM knowledge_points
    WHERE next_review IS NOT NULL AND next_review <= ?
    ORDER BY tier ASC, next_review ASC
    LIMIT 8
  `).all(today);
  const subjects = getSubjects();
  return { today, pointStats, todayStats, due, subjects };
}

export function getCalendarSummaries(): CalendarSummary[] {
  const db = getDb();
  const days = db.prepare("SELECT date, plan, summary FROM daily_entries").all() as Array<{
    date: string;
    plan: string;
    summary: string;
  }>;
  const assets = db.prepare("SELECT id, day FROM assets").all() as Array<{ id: number; day: string }>;
  const studySessions = db.prepare("SELECT id, day, duration_minutes AS durationMinutes FROM study_sessions").all() as Array<{
    id: number;
    day: string;
    durationMinutes: number;
  }>;
  const reviewEvents = db.prepare("SELECT id, day FROM review_events").all() as Array<{ id: number; day: string }>;
  const mistakes = db.prepare("SELECT id, day FROM mistakes").all() as Array<{ id: number; day: string }>;
  return buildCalendarSummaries({ days, assets, studySessions, reviewEvents, mistakes });
}

export function getSubjects() {
  return getDb().prepare("SELECT * FROM subjects ORDER BY code ASC").all();
}

export function getSubject(code: string) {
  const db = getDb();
  const subject = db.prepare("SELECT * FROM subjects WHERE code = ?").get(code);
  const points = db.prepare("SELECT * FROM knowledge_points WHERE subject_code = ? ORDER BY id ASC").all(code);
  const assets = db.prepare(`
    SELECT a.*
    FROM assets a
    JOIN asset_links l ON l.asset_id = a.id
    WHERE l.subject_code = ?
    ORDER BY a.created_at DESC
  `).all(code);
  const sessions = db.prepare("SELECT * FROM study_sessions WHERE subject_code = ? ORDER BY created_at DESC").all(code);
  const mistakes = db.prepare("SELECT * FROM mistakes WHERE subject_code = ? ORDER BY created_at DESC").all(code);
  return { subject, points, assets, sessions, mistakes };
}

export function getKnowledgePoints() {
  return getDb().prepare("SELECT * FROM knowledge_points ORDER BY subject_code ASC, id ASC").all();
}

export function getAssets() {
  return getDb().prepare("SELECT * FROM assets ORDER BY created_at DESC").all();
}

export function getViews() {
  return DEFAULT_VIEWS;
}

export function getViewData(slug: string) {
  const view = getDefaultViewBySlug(slug) || DEFAULT_VIEWS[0];
  const rows = applyViewFilters(getRowsForView(view), view.filters);
  return { view, views: DEFAULT_VIEWS, rows };
}

function getRowsForView(view: SavedView) {
  const db = getDb();
  if (view.source === "assets") return db.prepare("SELECT * FROM assets ORDER BY day DESC, created_at DESC").all() as DataRow[];
  if (view.source === "daily_entries") return db.prepare("SELECT * FROM daily_entries ORDER BY date DESC").all() as DataRow[];
  if (view.source === "study_sessions") return db.prepare("SELECT * FROM study_sessions ORDER BY day DESC, created_at DESC").all() as DataRow[];
  if (view.source === "mistakes") return db.prepare("SELECT * FROM mistakes ORDER BY COALESCE(next_review, day) ASC").all() as DataRow[];
  if (view.source === "knowledge_points") return db.prepare("SELECT * FROM knowledge_points ORDER BY subject_code ASC, id ASC").all() as DataRow[];
  if (view.source === "subjects") {
    return db.prepare(`
      SELECT
        s.code,
        s.name,
        s.description,
        COUNT(DISTINCT k.id) AS point_count,
        COUNT(DISTINCT a.id) AS asset_count,
        COUNT(DISTINCT m.id) AS mistake_count
      FROM subjects s
      LEFT JOIN knowledge_points k ON k.subject_code = s.code
      LEFT JOIN asset_links l ON l.subject_code = s.code
      LEFT JOIN assets a ON a.id = l.asset_id
      LEFT JOIN mistakes m ON m.subject_code = s.code
      GROUP BY s.code, s.name, s.description
      ORDER BY s.code ASC
    `).all() as DataRow[];
  }
  if (view.source === "plan_items") return getPlanTimelineRows();
  return [];
}

function getPlanTimelineRows() {
  return [
    { id: "w1", title: "W1 线代基础 + 签到题", start_date: "2026-06-23", end_date: "2026-06-29", status: "done" },
    { id: "w2", title: "W2 特征值 / 对角化", start_date: "2026-06-30", end_date: "2026-07-06", status: "active" },
    { id: "w3", title: "W3 正定 / 二次型", start_date: "2026-07-07", end_date: "2026-07-13", status: "planned" },
    { id: "w4", title: "W4 概率基础 / 贝叶斯", start_date: "2026-07-14", end_date: "2026-07-20", status: "planned" },
    { id: "w5", title: "W5 MLE / 马尔可夫 + 模考 1", start_date: "2026-07-21", end_date: "2026-07-27", status: "milestone" },
    { id: "w6", title: "W6 最优化 / KKT / 最短路", start_date: "2026-07-28", end_date: "2026-08-03", status: "planned" },
    { id: "w7", title: "W7 朴素贝叶斯 / 熵 / DP", start_date: "2026-08-04", end_date: "2026-08-10", status: "planned" },
    { id: "w8", title: "W8 PCA / 反向传播 + 模考 2", start_date: "2026-08-11", end_date: "2026-08-17", status: "milestone" },
    { id: "w9", title: "W9 Tier A 全回炉", start_date: "2026-08-18", end_date: "2026-08-24", status: "planned" },
    { id: "w10", title: "W10 冲刺整合 + 模考 3", start_date: "2026-08-25", end_date: "2026-08-31", status: "milestone" },
  ];
}

export async function createAssetFromUpload(input: {
  file: File;
  day?: string;
  tags?: string[];
  subjectCode?: string;
  knowledgePointId?: string;
}) {
  const day = assertDateKey(input.day || todayKey());
  ensureDay(day);
  const stored = await storeUploadedFile({
    file: input.file,
    day,
  });

  const db = getDb();
  const mimeType = input.file.type || "application/octet-stream";
  db.prepare(`
    INSERT INTO blobs (id, sha256, size, mime_type, storage_key, ref_count)
    VALUES (@id, @sha256, @size, @mimeType, @storageKey, 0)
    ON CONFLICT(id) DO UPDATE SET ref_count = ref_count
  `).run({
    id: stored.sha256,
    sha256: stored.sha256,
    size: stored.size,
    mimeType,
    storageKey: stored.relativePath,
  });

  const result = db.prepare(`
    INSERT INTO assets (day, original_name, safe_name, relative_path, mime_type, size)
    VALUES (@day, @originalName, @safeName, @relativePath, @mimeType, @size)
  `).run({
    day,
    originalName: input.file.name,
    safeName: stored.safeName,
    relativePath: stored.relativePath,
    mimeType,
    size: stored.size,
  });
  const assetId = Number(result.lastInsertRowid);
  db.prepare("UPDATE blobs SET ref_count = ref_count + 1 WHERE id = ?").run(stored.sha256);
  linkAsset(assetId, input.subjectCode, input.knowledgePointId);
  setAssetTags(assetId, input.tags || []);
  return db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId);
}

export function linkAsset(assetId: number, subjectCode?: string, knowledgePointId?: string) {
  if (!subjectCode && !knowledgePointId) return;
  getDb().prepare(`
    INSERT OR IGNORE INTO asset_links (asset_id, subject_code, knowledge_point_id)
    VALUES (?, ?, ?)
  `).run(assetId, subjectCode || null, knowledgePointId || null);
}

export function setAssetTags(assetId: number, tags: string[]) {
  const db = getDb();
  const insertTag = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
  const getTag = db.prepare("SELECT id FROM tags WHERE name = ?");
  const insertLink = db.prepare("INSERT OR IGNORE INTO asset_tags (asset_id, tag_id) VALUES (?, ?)");
  for (const tag of tags.map((item) => item.trim()).filter(Boolean)) {
    insertTag.run(tag);
    const row = getTag.get(tag) as { id: number };
    insertLink.run(assetId, row.id);
  }
}

export function createStudySession(input: Record<string, unknown>) {
  const day = assertDateKey(String(input.day || todayKey()));
  ensureDay(day);
  getDb().prepare(`
    INSERT INTO study_sessions (day, subject_code, knowledge_point_id, title, duration_minutes, output)
    VALUES (@day, @subjectCode, @knowledgePointId, @title, @durationMinutes, @output)
  `).run({
    day,
    subjectCode: String(input.subjectCode || "") || null,
    knowledgePointId: String(input.knowledgePointId || "") || null,
    title: String(input.title || "学习记录"),
    durationMinutes: Number(input.durationMinutes || 0),
    output: String(input.output || ""),
  });
  return getDay(day);
}

export function createMistake(input: Record<string, unknown>) {
  const day = assertDateKey(String(input.day || todayKey()));
  ensureDay(day);
  getDb().prepare(`
    INSERT INTO mistakes (day, subject_code, knowledge_point_id, title, cause, next_review)
    VALUES (@day, @subjectCode, @knowledgePointId, @title, @cause, @nextReview)
  `).run({
    day,
    subjectCode: String(input.subjectCode || "") || null,
    knowledgePointId: String(input.knowledgePointId || "") || null,
    title: String(input.title || "错题"),
    cause: String(input.cause || ""),
    nextReview: nextReviewDate(day, 0),
  });
  return getDay(day);
}

export function createReviewEvent(input: Record<string, unknown>) {
  const day = assertDateKey(String(input.day || todayKey()));
  const knowledgePointId = String(input.knowledgePointId || "");
  ensureDay(day);
  const db = getDb();
  const point = knowledgePointId
    ? (db.prepare("SELECT reviews FROM knowledge_points WHERE id = ?").get(knowledgePointId) as { reviews: number } | undefined)
    : undefined;
  db.prepare(`
    INSERT INTO review_events (day, knowledge_point_id, score, note)
    VALUES (@day, @knowledgePointId, @score, @note)
  `).run({
    day,
    knowledgePointId: knowledgePointId || null,
    score: Number(input.score || 0),
    note: String(input.note || ""),
  });
  if (point && knowledgePointId) {
    db.prepare(`
      UPDATE knowledge_points
      SET reviews = reviews + 1,
          last_review = @day,
          next_review = @nextReview,
          status = CASE WHEN status = '未学' THEN '学习中' ELSE status END
      WHERE id = @knowledgePointId
    `).run({ day, nextReview: nextReviewDate(day, point.reviews), knowledgePointId });
  }
  return getDay(day);
}
