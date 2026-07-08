import type Database from "better-sqlite3";
import { storeUploadedFile } from "./assets";
import type { CalendarSummary } from "./types";
import { buildCalendarSummaries } from "./calendar-summary";
import { assertDateKey, todayKey } from "./dates";
import { getDb } from "./db";
import { nextReviewDate } from "./review-schedule";
import { listOpenConflictsWithDb } from "./sync";
import { applyViewFilters, DEFAULT_VIEWS, getDefaultViewBySlug, type DataRow, type SavedView } from "./views";

export function ensureDay(date: string) {
  assertDateKey(date);
  const db = getDb();
  ensureDayWithDb(db, date);
  return getDay(date);
}

function ensureDayWithDb(db: Database.Database, date: string) {
  assertDateKey(date);
  db.prepare("INSERT OR IGNORE INTO daily_entries (date) VALUES (?)").run(date);
}

export function getDay(date: string) {
  assertDateKey(date);
  const db = getDb();
  ensureDayWithDb(db, date);
  const entry = db.prepare("SELECT * FROM daily_entries WHERE date = ?").get(date) as Record<string, string>;
  const draftOverlay = getActiveDayDraftsWithDb(db, date);
  Object.assign(entry, draftOverlay.values);
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
  const conflicts = listOpenConflictsWithDb(db, { scopeType: "day", scopeId: date });
  const dueReviews = db.prepare(`
    SELECT id, title, subject_code, tier_name, mastery, next_review
    FROM knowledge_points
    WHERE next_review IS NOT NULL AND next_review <= ?
    ORDER BY tier ASC, next_review ASC
    LIMIT 6
  `).all(date);
  const dueMistakes = db.prepare(`
    SELECT id, title, cause, knowledge_point_id, next_review
    FROM mistakes
    WHERE graduated = 0 AND next_review IS NOT NULL AND next_review <= ?
    ORDER BY next_review ASC, created_at ASC
    LIMIT 6
  `).all(date);
  return { entry, draftVersions: draftOverlay.versions, conflicts, dueReviews, dueMistakes, assets, sessions, reviews, mistakes };
}

export function getActiveDayDraftsWithDb(database: Database.Database, date: string) {
  const drafts = database.prepare(`
    SELECT field, content, version
    FROM drafts
    WHERE scope_type = 'day' AND scope_id = ? AND status = 'active'
  `).all(date) as Array<{ field: string; content: string; version: number }>;
  const values: Record<string, string> = {};
  const versions: Record<string, number> = {};
  for (const draft of drafts) {
    if (["plan", "diary", "summary", "blockers", "tomorrow"].includes(draft.field)) {
      values[draft.field] = draft.content;
      versions[draft.field] = draft.version;
    }
  }
  return { values, versions };
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

export type LearningAnalytics = {
  week: {
    start: string;
    end: string;
    studyMinutes: number;
    reviews: number;
    mistakes: number;
    assets: number;
    activeDays: number;
    reflectionDays: number;
  };
  weakPoints: Array<{
    id: string;
    subjectCode: string;
    title: string;
    tierName: string;
    mastery: number;
    nextReview: string | null;
    openMistakes: number;
    priorityScore: number;
    reasons: string[];
  }>;
};

export function getLearningAnalytics(today = todayKey()): LearningAnalytics {
  return getLearningAnalyticsWithDb(getDb(), today);
}

export function getLearningAnalyticsWithDb(db: Database.Database, today: string): LearningAnalytics {
  const end = assertDateKey(today);
  const start = shiftDateKey(end, -6);
  const weekRows = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions WHERE day BETWEEN @start AND @end) AS studyMinutes,
      (SELECT COUNT(*) FROM review_events WHERE day BETWEEN @start AND @end) AS reviews,
      (SELECT COUNT(*) FROM mistakes WHERE day BETWEEN @start AND @end) AS mistakes,
      (SELECT COUNT(*) FROM assets WHERE day BETWEEN @start AND @end) AS assets,
      (
        SELECT COUNT(DISTINCT day) FROM (
          SELECT day FROM study_sessions WHERE day BETWEEN @start AND @end
          UNION ALL SELECT day FROM review_events WHERE day BETWEEN @start AND @end
          UNION ALL SELECT day FROM mistakes WHERE day BETWEEN @start AND @end
          UNION ALL SELECT day FROM assets WHERE day BETWEEN @start AND @end
        )
      ) AS activeDays,
      (
        SELECT COUNT(*) FROM daily_entries
        WHERE date BETWEEN @start AND @end
          AND (TRIM(diary) != '' OR TRIM(summary) != '')
      ) AS reflectionDays
  `).get({ start, end }) as {
    studyMinutes: number | null;
    reviews: number;
    mistakes: number;
    assets: number;
    activeDays: number;
    reflectionDays: number;
  };

  const candidates = db.prepare(`
    SELECT
      k.id,
      k.subject_code AS subjectCode,
      k.title,
      k.tier,
      k.tier_name AS tierName,
      k.mastery,
      k.next_review AS nextReview,
      k.exam,
      COUNT(m.id) AS openMistakes
    FROM knowledge_points k
    LEFT JOIN mistakes m ON m.knowledge_point_id = k.id AND m.graduated = 0
    WHERE k.status != '已掌握'
    GROUP BY k.id, k.subject_code, k.title, k.tier, k.tier_name, k.mastery, k.next_review, k.exam
    HAVING k.mastery < 70 OR (k.next_review IS NOT NULL AND k.next_review <= @end) OR openMistakes > 0
  `).all({ end }) as Array<{
    id: string;
    subjectCode: string;
    title: string;
    tier: string;
    tierName: string;
    mastery: number;
    nextReview: string | null;
    exam: number;
    openMistakes: number;
  }>;

  const weakPoints = candidates
    .map((point) => {
      const due = Boolean(point.nextReview && point.nextReview <= end);
      const tierScore = point.tier === "r" ? 30 : point.tier === "y" ? 18 : 8;
      const priorityScore =
        100 - point.mastery + tierScore + (due ? 25 : 0) + point.openMistakes * 12 + (point.exam ? 8 : 0);
      const reasons = [
        point.tierName,
        `掌握度 ${point.mastery}`,
        due ? "今日到期" : "",
        point.openMistakes ? `未毕业错题 ${point.openMistakes}` : "",
        point.exam ? "真题" : "",
      ].filter(Boolean);
      return {
        id: point.id,
        subjectCode: point.subjectCode,
        title: point.title,
        tierName: point.tierName,
        mastery: point.mastery,
        nextReview: point.nextReview,
        openMistakes: point.openMistakes,
        priorityScore,
        reasons,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || a.subjectCode.localeCompare(b.subjectCode) || a.title.localeCompare(b.title))
    .slice(0, 8);

  return {
    week: {
      start,
      end,
      studyMinutes: Number(weekRows.studyMinutes || 0),
      reviews: weekRows.reviews,
      mistakes: weekRows.mistakes,
      assets: weekRows.assets,
      activeDays: weekRows.activeDays,
      reflectionDays: weekRows.reflectionDays,
    },
    weakPoints,
  };
}

function shiftDateKey(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
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

export type KnowledgeLibraryFilters = {
  subjectCode?: string;
  knowledgePointId?: string;
  tag?: string;
  folderPath?: string;
};

type KnowledgeLibraryAsset = {
  id: number;
  day: string;
  original_name: string;
  mime_type: string;
  size: number;
  category: string;
  folder_path: string;
  created_at: string;
  subject_code: string | null;
  knowledge_point_id: string | null;
  knowledge_title: string | null;
  tags: string;
};

type SubjectSummary = {
  code: string;
  name: string;
  description: string;
};

export type SubjectChapter = {
  id: string;
  subject_code: string;
  title: string;
  sort_order: number;
};

export type KnowledgeTag = {
  id: string;
  chapter_id: string;
  name: string;
};

export type CaptureSubject = SubjectSummary & {
  chapters: Array<{
    id: string;
    title: string;
    knowledgeTags: Array<{ id: string; name: string }>;
  }>;
};

export type FileExplorerFolder = {
  name: string;
  path: string;
  assetCount: number;
};

export type FileExplorerTreeNode = FileExplorerFolder & {
  children: FileExplorerTreeNode[];
};

export type FileExplorerFile = {
  id: number;
  original_name: string;
  mime_type: string;
  size: number;
  folder_path: string;
  created_at: string;
};

export function getKnowledgeLibrary(filters: KnowledgeLibraryFilters = {}) {
  return getKnowledgeLibraryWithDb(getDb(), filters);
}

export function getKnowledgeLibraryWithDb(db: Database.Database, filters: KnowledgeLibraryFilters = {}) {
  const activeFilters = normalizeKnowledgeLibraryFilters(filters);
  const clauses: string[] = [];
  const params: Record<string, string> = {};

  if (activeFilters.subjectCode) {
    clauses.push("l.subject_code = @subjectCode");
    params.subjectCode = activeFilters.subjectCode;
  }
  if (activeFilters.knowledgePointId) {
    clauses.push("l.knowledge_point_id = @knowledgePointId");
    params.knowledgePointId = activeFilters.knowledgePointId;
  }
  if (activeFilters.folderPath) {
    clauses.push("a.folder_path = @folderPath");
    params.folderPath = activeFilters.folderPath;
  }
  if (activeFilters.tag) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM asset_tags filter_at
        JOIN tags filter_t ON filter_t.id = filter_at.tag_id
        WHERE filter_at.asset_id = a.id AND filter_t.name = @tag
      )
    `);
    params.tag = activeFilters.tag;
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const assets = db.prepare(`
    SELECT
      a.id,
      a.day,
      a.original_name,
      a.mime_type,
      a.size,
      a.category,
      a.folder_path,
      a.created_at,
      l.subject_code,
      l.knowledge_point_id,
      k.title AS knowledge_title,
      COALESCE(GROUP_CONCAT(DISTINCT t.name), '') AS tags
    FROM assets a
    LEFT JOIN asset_links l ON l.asset_id = a.id
    LEFT JOIN knowledge_points k ON k.id = l.knowledge_point_id
    LEFT JOIN asset_tags at ON at.asset_id = a.id
    LEFT JOIN tags t ON t.id = at.tag_id
    ${whereSql}
    GROUP BY a.id, l.subject_code, l.knowledge_point_id, k.title
    ORDER BY a.folder_path ASC, a.created_at DESC
  `).all(params) as KnowledgeLibraryAsset[];

  const folderRows = db.prepare(`
    SELECT a.folder_path AS path, COUNT(DISTINCT a.id) AS assetCount
    FROM assets a
    LEFT JOIN asset_links l ON l.asset_id = a.id
    ${whereSql}
    GROUP BY a.folder_path
    ORDER BY a.folder_path ASC
  `).all(params) as Array<{ path: string; assetCount: number }>;

  const tagRows = db.prepare(`
    SELECT t.name, COUNT(DISTINCT at.asset_id) AS assetCount
    FROM tags t
    JOIN asset_tags at ON at.tag_id = t.id
    GROUP BY t.id, t.name
    ORDER BY t.name ASC
  `).all() as Array<{ name: string; assetCount: number }>;

  const points = db.prepare(`
    SELECT
      k.*,
      COUNT(DISTINCT a.id) AS asset_count,
      COUNT(DISTINCT m.id) AS mistake_count
    FROM knowledge_points k
    LEFT JOIN asset_links l ON l.knowledge_point_id = k.id
    LEFT JOIN assets a ON a.id = l.asset_id
    LEFT JOIN mistakes m ON m.knowledge_point_id = k.id
    WHERE (@subjectCode = '' OR k.subject_code = @subjectCode)
    GROUP BY k.id
    ORDER BY k.subject_code ASC, k.id ASC
  `).all({ subjectCode: activeFilters.subjectCode }) as DataRow[];

  return {
    activeFilters,
    subjects: getSubjectsWithDb(db),
    points,
    tags: tagRows,
    folders: folderRows,
    assets,
  };
}

function getSubjectsWithDb(db: Database.Database): SubjectSummary[] {
  return db.prepare("SELECT * FROM subjects ORDER BY code ASC").all() as SubjectSummary[];
}

export function createSubjectWithDb(db: Database.Database, input: { code: string; name: string; description?: string }) {
  const code = String(input.code || "").trim();
  const name = String(input.name || "").trim();
  const description = String(input.description || "").trim();
  if (!code || !name) throw new Error("Subject code and name are required");
  db.prepare(`
    INSERT INTO subjects (code, name, description)
    VALUES (@code, @name, @description)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      description = excluded.description
  `).run({ code, name, description });
  return db.prepare("SELECT * FROM subjects WHERE code = ?").get(code) as SubjectSummary;
}

export function updateSubjectWithDb(db: Database.Database, input: { code: string; name: string; description?: string }) {
  return createSubjectWithDb(db, input);
}

export function deleteSubjectWithDb(db: Database.Database, code: string) {
  const subjectCode = String(code || "").trim();
  if (!subjectCode) throw new Error("Subject code is required");
  const chapters = db.prepare("SELECT id FROM subject_chapters WHERE subject_code = ?").all(subjectCode) as Array<{ id: string }>;
  for (const chapter of chapters) deleteChapterWithDb(db, chapter.id);
  db.prepare("UPDATE asset_links SET subject_code = NULL WHERE subject_code = ?").run(subjectCode);
  db.prepare("UPDATE study_sessions SET subject_code = NULL WHERE subject_code = ?").run(subjectCode);
  db.prepare("UPDATE mistakes SET subject_code = NULL WHERE subject_code = ?").run(subjectCode);
  return db.prepare("DELETE FROM subjects WHERE code = ?").run(subjectCode).changes;
}

export function getCaptureHierarchy() {
  return getCaptureHierarchyWithDb(getDb());
}

export function getCaptureHierarchyWithDb(db: Database.Database): CaptureSubject[] {
  const subjects = getSubjectsWithDb(db) as CaptureSubject[];
  const chapters = db.prepare(`
    SELECT id, subject_code, title, sort_order
    FROM subject_chapters
    ORDER BY subject_code ASC, sort_order ASC, title ASC
  `).all() as SubjectChapter[];
  const tags = db.prepare(`
    SELECT id, chapter_id, name
    FROM knowledge_tags
    ORDER BY name ASC
  `).all() as KnowledgeTag[];
  const tagsByChapter = new Map<string, Array<{ id: string; name: string }>>();
  for (const tag of tags) {
    const group = tagsByChapter.get(tag.chapter_id) || [];
    group.push({ id: tag.id, name: tag.name });
    tagsByChapter.set(tag.chapter_id, group);
  }

  return subjects.map((subject) => ({
    ...subject,
    chapters: chapters
      .filter((chapter) => chapter.subject_code === subject.code)
      .map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        knowledgeTags: tagsByChapter.get(chapter.id) || [],
      })),
  }));
}

export function createChapterWithDb(db: Database.Database, input: { subjectCode: string; title: string }) {
  const subjectCode = String(input.subjectCode || "").trim();
  const title = String(input.title || "").trim();
  if (!subjectCode || !title) throw new Error("Subject and chapter title are required");
  const existing = db.prepare("SELECT * FROM subject_chapters WHERE subject_code = ? AND title = ?").get(subjectCode, title);
  if (existing) return existing as SubjectChapter;

  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS value FROM subject_chapters WHERE subject_code = ?").get(subjectCode) as {
    value: number;
  };
  const id = `chapter:${subjectCode}:${slugFor(title)}`;
  db.prepare(`
    INSERT INTO subject_chapters (id, subject_code, title, sort_order)
    VALUES (@id, @subjectCode, @title, @sortOrder)
  `).run({ id, subjectCode, title, sortOrder: Number(maxOrder.value || 0) + 1 });
  return db.prepare("SELECT * FROM subject_chapters WHERE id = ?").get(id) as SubjectChapter;
}

export function updateChapterWithDb(db: Database.Database, input: { id: string; title: string }) {
  const id = String(input.id || "").trim();
  const title = String(input.title || "").trim();
  if (!id || !title) throw new Error("Chapter id and title are required");
  db.prepare("UPDATE subject_chapters SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(title, id);
  const chapter = db.prepare("SELECT * FROM subject_chapters WHERE id = ?").get(id) as SubjectChapter | undefined;
  if (!chapter) throw new Error("Chapter not found");
  return chapter;
}

export function deleteChapterWithDb(db: Database.Database, id: string) {
  const chapterId = String(id || "").trim();
  if (!chapterId) throw new Error("Chapter id is required");
  db.prepare("DELETE FROM asset_knowledge_tags WHERE knowledge_tag_id IN (SELECT id FROM knowledge_tags WHERE chapter_id = ?)").run(chapterId);
  db.prepare("DELETE FROM knowledge_tags WHERE chapter_id = ?").run(chapterId);
  db.prepare("UPDATE asset_links SET chapter_id = NULL WHERE chapter_id = ?").run(chapterId);
  return db.prepare("DELETE FROM subject_chapters WHERE id = ?").run(chapterId).changes;
}

export function createKnowledgeTagWithDb(db: Database.Database, input: { chapterId: string; name: string }) {
  const chapterId = String(input.chapterId || "").trim();
  const name = String(input.name || "").trim();
  if (!chapterId || !name) throw new Error("Chapter and knowledge tag name are required");
  const existing = db.prepare("SELECT * FROM knowledge_tags WHERE chapter_id = ? AND name = ?").get(chapterId, name);
  if (existing) return existing as KnowledgeTag;
  const id = `kt:${chapterId}:${slugFor(name)}`;
  db.prepare(`
    INSERT INTO knowledge_tags (id, chapter_id, name)
    VALUES (@id, @chapterId, @name)
  `).run({ id, chapterId, name });
  return db.prepare("SELECT * FROM knowledge_tags WHERE id = ?").get(id) as KnowledgeTag;
}

export function deleteKnowledgeTagWithDb(db: Database.Database, id: string) {
  const tagId = String(id || "").trim();
  if (!tagId) throw new Error("Knowledge tag id is required");
  db.prepare("DELETE FROM asset_knowledge_tags WHERE knowledge_tag_id = ?").run(tagId);
  return db.prepare("DELETE FROM knowledge_tags WHERE id = ?").run(tagId).changes;
}

export function createFolderWithDb(db: Database.Database, input: { path: string }) {
  const folderPath = normalizeFolderPath(input.path || "");
  ensureFolderPathWithDb(db, folderPath);
  return db.prepare("SELECT path, name, parent_path FROM folders WHERE path = ?").get(folderPath);
}

export function moveAssetToFolderWithDb(db: Database.Database, input: { assetId: number; folderPath: string }) {
  const folderPath = normalizeFolderPath(input.folderPath || "");
  ensureFolderPathWithDb(db, folderPath);
  db.prepare("UPDATE assets SET folder_path = ? WHERE id = ?").run(folderPath, input.assetId);
}

export function getFileExplorerWithDb(db: Database.Database, folderPath: string) {
  const currentPath = normalizeExplorerPath(folderPath);
  const folders = getChildFoldersWithDb(db, currentPath);
  const files = db.prepare(`
    SELECT id, original_name, mime_type, size, folder_path, created_at
    FROM assets
    WHERE folder_path = @currentPath
    ORDER BY original_name ASC
  `).all({ currentPath: currentPath || "未归档" }) as FileExplorerFile[];

  return {
    currentPath,
    breadcrumbs: breadcrumbsFor(currentPath),
    tree: getFolderTreeWithDb(db),
    folders,
    files,
  };
}

function getFolderTreeWithDb(db: Database.Database): FileExplorerTreeNode[] {
  const rows = db.prepare(`
    SELECT path, name, parent_path
    FROM folders
    ORDER BY parent_path ASC, name ASC
  `).all() as Array<{ path: string; name: string; parent_path: string }>;
  const nodes = new Map<string, FileExplorerTreeNode>();
  for (const row of rows) {
    const count = db.prepare("SELECT COUNT(*) AS count FROM assets WHERE folder_path = ? OR folder_path LIKE ?").get(
      row.path,
      `${row.path}/%`,
    ) as { count: number };
    nodes.set(row.path, { name: row.name, path: row.path, assetCount: count.count, children: [] });
  }

  const roots: FileExplorerTreeNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.path);
    if (!node) continue;
    const parent = row.parent_path ? nodes.get(row.parent_path) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function getChildFoldersWithDb(db: Database.Database, parentPath: string): FileExplorerFolder[] {
  const folders = db.prepare(`
    SELECT path, name
    FROM folders
    WHERE parent_path = ?
    ORDER BY name ASC
  `).all(parentPath) as Array<{ path: string; name: string }>;
  return folders.map((folder) => {
    const count = db.prepare("SELECT COUNT(*) AS count FROM assets WHERE folder_path = ? OR folder_path LIKE ?").get(
      folder.path,
      `${folder.path}/%`,
    ) as { count: number };
    return { ...folder, assetCount: count.count };
  });
}

function ensureFolderPathWithDb(db: Database.Database, pathValue: string) {
  const normalized = normalizeFolderPath(pathValue);
  const segments = normalized.split("/").filter(Boolean);
  let parentPath = "";
  for (let index = 0; index < segments.length; index += 1) {
    const pathPart = segments.slice(0, index + 1).join("/");
    const name = segments[index];
    db.prepare(`
      INSERT OR IGNORE INTO folders (path, name, parent_path)
      VALUES (?, ?, ?)
    `).run(pathPart, name, parentPath);
    parentPath = pathPart;
  }
}

function normalizeExplorerPath(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return normalizeFolderPath(trimmed);
}

function breadcrumbsFor(pathValue: string) {
  if (!pathValue) return [];
  const segments = pathValue.split("/");
  return segments.map((name, index) => ({
    name,
    path: segments.slice(0, index + 1).join("/"),
  }));
}

function normalizeKnowledgeLibraryFilters(filters: KnowledgeLibraryFilters) {
  const folderPath = String(filters.folderPath || "").trim();
  return {
    folderPath: folderPath ? normalizeFolderPath(folderPath) : "",
    knowledgePointId: String(filters.knowledgePointId || "").trim(),
    subjectCode: String(filters.subjectCode || "").trim(),
    tag: String(filters.tag || "").trim(),
  };
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
  chapterId?: string;
  knowledgePointId?: string;
  knowledgeTagNames?: string[];
  folderPath?: string;
  category?: string;
}) {
  return createAssetFromUploadWithDb(getDb(), input);
}

export async function createAssetFromUploadWithDb(
  db: Database.Database,
  input: {
    file: File;
    day?: string;
    tags?: string[];
    subjectCode?: string;
    chapterId?: string;
    knowledgePointId?: string;
    knowledgeTagNames?: string[];
    folderPath?: string;
    category?: string;
    uploadRoot?: string;
  },
) {
  const day = assertDateKey(input.day || todayKey());
  ensureDayWithDb(db, day);
  const stored = await storeUploadedFile({
    file: input.file,
    day,
    uploadRoot: input.uploadRoot,
  });

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
    INSERT INTO assets (day, original_name, safe_name, relative_path, mime_type, size, category, folder_path)
    VALUES (@day, @originalName, @safeName, @relativePath, @mimeType, @size, @category, @folderPath)
  `).run({
    day,
    originalName: input.file.name,
    safeName: stored.safeName,
    relativePath: stored.relativePath,
    mimeType,
    size: stored.size,
    category: normalizeAssetCategory(input.category),
    folderPath: normalizeFolderPath(input.folderPath || ""),
  });
  const assetId = Number(result.lastInsertRowid);
  db.prepare("UPDATE blobs SET ref_count = ref_count + 1 WHERE id = ?").run(stored.sha256);
  ensureFolderPathWithDb(db, normalizeFolderPath(input.folderPath || ""));
  linkAssetWithDb(db, assetId, input.subjectCode, input.knowledgePointId, input.chapterId);
  setAssetTagsWithDb(db, assetId, input.tags || []);
  setAssetKnowledgeTagsWithDb(db, assetId, input.chapterId, input.knowledgeTagNames || []);
  return db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId);
}

export function normalizeFolderPath(value: string): string {
  const segments = value
    .trim()
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..");
  return segments.join("/") || "未归档";
}

function normalizeAssetCategory(value?: string): string {
  const category = String(value || "knowledge").trim();
  return ["knowledge", "mistake", "note"].includes(category) ? category : "knowledge";
}

export function linkAsset(assetId: number, subjectCode?: string, knowledgePointId?: string, chapterId?: string) {
  linkAssetWithDb(getDb(), assetId, subjectCode, knowledgePointId, chapterId);
}

function linkAssetWithDb(db: Database.Database, assetId: number, subjectCode?: string, knowledgePointId?: string, chapterId?: string) {
  if (!subjectCode && !knowledgePointId && !chapterId) return;
  db.prepare(`
    INSERT OR IGNORE INTO asset_links (asset_id, subject_code, chapter_id, knowledge_point_id)
    VALUES (?, ?, ?, ?)
  `).run(assetId, subjectCode || null, chapterId || null, knowledgePointId || null);
}

export function setAssetTags(assetId: number, tags: string[]) {
  setAssetTagsWithDb(getDb(), assetId, tags);
}

function setAssetTagsWithDb(db: Database.Database, assetId: number, tags: string[]) {
  const insertTag = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
  const getTag = db.prepare("SELECT id FROM tags WHERE name = ?");
  const insertLink = db.prepare("INSERT OR IGNORE INTO asset_tags (asset_id, tag_id) VALUES (?, ?)");
  for (const tag of tags.map((item) => item.trim()).filter(Boolean)) {
    insertTag.run(tag);
    const row = getTag.get(tag) as { id: number };
    insertLink.run(assetId, row.id);
  }
}

function setAssetKnowledgeTagsWithDb(db: Database.Database, assetId: number, chapterId?: string, names: string[] = []) {
  if (!chapterId) return;
  const insertLink = db.prepare("INSERT OR IGNORE INTO asset_knowledge_tags (asset_id, knowledge_tag_id) VALUES (?, ?)");
  for (const name of uniqueTrimmed(names)) {
    const tag = createKnowledgeTagWithDb(db, { chapterId, name });
    insertLink.run(assetId, tag.id);
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
  const knowledgePointId = String(input.knowledgePointId || "");
  ensureDay(day);
  const db = getDb();
  db.prepare(`
    INSERT INTO mistakes (day, subject_code, knowledge_point_id, title, cause, next_review)
    VALUES (@day, @subjectCode, @knowledgePointId, @title, @cause, @nextReview)
  `).run({
    day,
    subjectCode: String(input.subjectCode || "") || null,
    knowledgePointId: knowledgePointId || null,
    title: String(input.title || "错题"),
    cause: String(input.cause || ""),
    nextReview: nextReviewDate(day, 0),
  });
  applyMistakeOutcomeWithDb(db, { knowledgePointId, day });
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
  if (point && knowledgePointId) applyReviewOutcomeWithDb(db, { knowledgePointId, day, score: Number(input.score || 0) });
  return getDay(day);
}

export function reattemptMistake(input: Record<string, unknown>) {
  const day = assertDateKey(String(input.day || todayKey()));
  const id = Number(input.id || 0);
  const score = Number(input.score || 0);
  const db = getDb();
  reattemptMistakeWithDb(db, { id, day, score });
  return getDay(day);
}

export function reattemptMistakeWithDb(
  database: Database.Database,
  input: { id: number; day: string; score: number },
) {
  const mistake = database.prepare("SELECT * FROM mistakes WHERE id = ?").get(input.id) as
    | { id: number; knowledge_point_id: string | null; graduated: number }
    | undefined;
  if (!mistake) throw new Error("Mistake not found");

  const nextReview = input.score >= 2 ? null : nextReviewDate(input.day, 0);
  const graduated = input.score >= 2 ? 1 : 0;
  database.prepare(`
    UPDATE mistakes
    SET graduated = @graduated,
        next_review = @nextReview
    WHERE id = @id
  `).run({ id: input.id, graduated, nextReview });

  if (mistake.knowledge_point_id) {
    database.prepare(`
      INSERT INTO review_events (day, knowledge_point_id, score, note)
      VALUES (@day, @knowledgePointId, @score, '错题回炉')
    `).run({ day: input.day, knowledgePointId: mistake.knowledge_point_id, score: input.score });
    applyReviewOutcomeWithDb(database, { knowledgePointId: mistake.knowledge_point_id, day: input.day, score: input.score });
  }

  return database.prepare("SELECT id, graduated, next_review AS nextReview FROM mistakes WHERE id = ?").get(input.id);
}

export function applyReviewOutcomeWithDb(
  database: Database.Database,
  input: { knowledgePointId: string; day: string; score: number },
) {
  if (!input.knowledgePointId) return;
  const point = database.prepare("SELECT reviews, mastery FROM knowledge_points WHERE id = ?").get(input.knowledgePointId) as
    | { reviews: number; mastery: number }
    | undefined;
  if (!point) return;

  const reviews = point.reviews + 1;
  const mastery = clamp(point.mastery + reviewMasteryDelta(input.score), 0, 100);
  const status = mastery >= 80 ? "已掌握" : mastery > 0 ? "学习中" : "未学";
  const nextReview = nextReviewDate(input.day, input.score <= 1 ? 0 : reviews);

  database.prepare(`
    UPDATE knowledge_points
    SET reviews = @reviews,
        mastery = @mastery,
        last_review = @day,
        next_review = @nextReview,
        status = @status
    WHERE id = @knowledgePointId
  `).run({ ...input, reviews, mastery, status, nextReview });
}

export function applyMistakeOutcomeWithDb(
  database: Database.Database,
  input: { knowledgePointId: string; day: string },
) {
  if (!input.knowledgePointId) return;
  const point = database.prepare("SELECT mastery FROM knowledge_points WHERE id = ?").get(input.knowledgePointId) as
    | { mastery: number }
    | undefined;
  if (!point) return;

  const mastery = clamp(point.mastery - 15, 0, 100);
  database.prepare(`
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

function reviewMasteryDelta(score: number) {
  if (score >= 3) return 16;
  if (score === 2) return 8;
  if (score === 1) return -4;
  return -12;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function uniqueTrimmed(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function slugFor(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase()).replaceAll("%", "");
}
