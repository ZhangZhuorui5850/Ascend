import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { TIER_NAMES, type Tier } from "../types";

export type SubjectTrack = "written" | "machine";

export type SubjectRow = {
  code: string;
  name: string;
  description: string;
  track: SubjectTrack;
};

export const TRACK_NAMES: Record<SubjectTrack, string> = {
  written: "笔试",
  machine: "机试",
};

export type SubjectOverview = SubjectRow & {
  pointCount: number;
  masteredCount: number;
  dueCount: number;
  assetCount: number;
  openMistakes: number;
  avgMastery: number;
};

export type PointRow = {
  id: string;
  chapter_id: string | null;
  subject_code: string;
  title: string;
  tier: Tier;
  tier_name: string;
  status: string;
  mastery: number;
  exam: number;
  reviews: number;
  last_review: string | null;
  next_review: string | null;
  asset_count: number;
  mistake_count: number;
};

export type ChapterWithPoints = {
  id: string;
  title: string;
  sort_order: number;
  points: PointRow[];
};

export type SubjectDetail = {
  subject: SubjectRow;
  chapters: ChapterWithPoints[];
  loosePoints: PointRow[];
  assets: Array<{
    id: number;
    day: string;
    original_name: string;
    mime_type: string;
    size: number;
    folder_path: string;
    knowledge_titles: string;
  }>;
  mistakes: Array<{
    id: number;
    day: string;
    title: string;
    cause: string;
    graduated: number;
    next_review: string | null;
    knowledge_title: string | null;
  }>;
};

export type CaptureSubject = {
  code: string;
  name: string;
  chapters: Array<{
    id: string;
    title: string;
    points: Array<{ id: string; title: string }>;
  }>;
};

export function getSubjects(db: Database.Database, scope: WorkspaceScope): SubjectRow[] {
  return db.prepare("SELECT * FROM subjects WHERE workspace_id = ? ORDER BY code ASC").all(
    scope.workspaceId,
  ) as SubjectRow[];
}

export function getSubjectOverviews(
  db: Database.Database,
  scope: WorkspaceScope,
  today: string,
): SubjectOverview[] {
  return db.prepare(`
    SELECT
      s.code,
      s.name,
      s.description,
      s.track,
      COUNT(DISTINCT k.id) AS pointCount,
      COUNT(DISTINCT CASE WHEN k.status = '已掌握' THEN k.id END) AS masteredCount,
      COUNT(DISTINCT CASE WHEN k.next_review IS NOT NULL AND k.next_review <= @today THEN k.id END) AS dueCount,
      COUNT(DISTINCT l.asset_id) AS assetCount,
      COUNT(DISTINCT CASE WHEN m.graduated = 0 THEN m.id END) AS openMistakes,
      COALESCE(ROUND(AVG(k.mastery)), 0) AS avgMastery
    FROM subjects s
    LEFT JOIN knowledge_points k ON k.subject_code = s.code AND k.workspace_id = s.workspace_id
    LEFT JOIN asset_links l ON l.subject_code = s.code AND l.workspace_id = s.workspace_id
    LEFT JOIN mistakes m ON m.subject_code = s.code AND m.workspace_id = s.workspace_id
    WHERE s.workspace_id = @workspaceId
    GROUP BY s.code, s.name, s.description, s.track
    ORDER BY s.track ASC, s.code ASC
  `).all({ workspaceId: scope.workspaceId, today }) as SubjectOverview[];
}

const POINT_SELECT = `
  SELECT
    k.id,
    k.chapter_id,
    k.subject_code,
    k.title,
    k.tier,
    k.tier_name,
    k.status,
    k.mastery,
    k.exam,
    k.reviews,
    k.last_review,
    k.next_review,
    COUNT(DISTINCT l.asset_id) AS asset_count,
    COUNT(DISTINCT CASE WHEN m.graduated = 0 THEN m.id END) AS mistake_count
  FROM knowledge_points k
  LEFT JOIN asset_links l ON l.knowledge_point_id = k.id AND l.workspace_id = k.workspace_id
  LEFT JOIN mistakes m ON m.knowledge_point_id = k.id AND m.workspace_id = k.workspace_id
`;

export function getSubjectDetail(db: Database.Database, scope: WorkspaceScope, code: string): SubjectDetail | null {
  const subject = db.prepare("SELECT * FROM subjects WHERE workspace_id = ? AND code = ?").get(
    scope.workspaceId,
    code,
  ) as SubjectRow | undefined;
  if (!subject) return null;

  const chapters = db.prepare(`
    SELECT id, title, sort_order
    FROM subject_chapters
    WHERE workspace_id = @workspaceId AND subject_code = @code
    ORDER BY sort_order ASC, title ASC
  `).all({ workspaceId: scope.workspaceId, code }) as Array<{ id: string; title: string; sort_order: number }>;

  const points = db.prepare(`
    ${POINT_SELECT}
    WHERE k.workspace_id = @workspaceId AND k.subject_code = @code
    GROUP BY k.id
    ORDER BY k.sort_order ASC, k.id ASC
  `).all({ workspaceId: scope.workspaceId, code }) as PointRow[];

  const pointsByChapter = new Map<string, PointRow[]>();
  const loosePoints: PointRow[] = [];
  for (const point of points) {
    if (point.chapter_id && chapters.some((chapter) => chapter.id === point.chapter_id)) {
      const group = pointsByChapter.get(point.chapter_id) || [];
      group.push(point);
      pointsByChapter.set(point.chapter_id, group);
    } else {
      loosePoints.push(point);
    }
  }

  const assets = db.prepare(`
    SELECT
      a.id,
      a.day,
      a.original_name,
      a.mime_type,
      a.size,
      a.folder_path,
      COALESCE(GROUP_CONCAT(DISTINCT k.title), '') AS knowledge_titles
    FROM assets a
    JOIN asset_links l ON l.asset_id = a.id AND l.workspace_id = a.workspace_id
    LEFT JOIN knowledge_points k ON k.id = l.knowledge_point_id AND k.workspace_id = l.workspace_id
    WHERE a.workspace_id = @workspaceId AND l.subject_code = @code
    GROUP BY a.id
    ORDER BY a.created_at DESC
    LIMIT 50
  `).all({ workspaceId: scope.workspaceId, code }) as SubjectDetail["assets"];

  const mistakes = db.prepare(`
    SELECT m.id, m.day, m.title, m.cause, m.graduated, m.next_review, k.title AS knowledge_title
    FROM mistakes m
    LEFT JOIN knowledge_points k ON k.id = m.knowledge_point_id AND k.workspace_id = m.workspace_id
    WHERE m.workspace_id = @workspaceId AND m.subject_code = @code
    ORDER BY m.graduated ASC, m.created_at DESC
    LIMIT 50
  `).all({ workspaceId: scope.workspaceId, code }) as SubjectDetail["mistakes"];

  return {
    subject,
    chapters: chapters.map((chapter) => ({ ...chapter, points: pointsByChapter.get(chapter.id) || [] })),
    loosePoints,
    assets,
    mistakes,
  };
}

/** 科目 → 章节 → 知识点的轻量层级，用于收纳面板和选择器。 */
export function getCaptureHierarchy(db: Database.Database, scope: WorkspaceScope): CaptureSubject[] {
  const subjects = getSubjects(db, scope);
  const chapters = db.prepare(`
    SELECT id, subject_code, title
    FROM subject_chapters
    WHERE workspace_id = @workspaceId
    ORDER BY subject_code ASC, sort_order ASC, title ASC
  `).all({ workspaceId: scope.workspaceId }) as Array<{ id: string; subject_code: string; title: string }>;
  const points = db.prepare(`
    SELECT id, chapter_id, title
    FROM knowledge_points
    WHERE workspace_id = @workspaceId AND chapter_id IS NOT NULL
    ORDER BY sort_order ASC, id ASC
  `).all({ workspaceId: scope.workspaceId }) as Array<{ id: string; chapter_id: string; title: string }>;

  const pointsByChapter = new Map<string, Array<{ id: string; title: string }>>();
  for (const point of points) {
    const group = pointsByChapter.get(point.chapter_id) || [];
    group.push({ id: point.id, title: point.title });
    pointsByChapter.set(point.chapter_id, group);
  }

  return subjects.map((subject) => ({
    code: subject.code,
    name: subject.name,
    chapters: chapters
      .filter((chapter) => chapter.subject_code === subject.code)
      .map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        points: pointsByChapter.get(chapter.id) || [],
      })),
  }));
}

export function createSubject(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { code: string; name: string; description?: string; track?: SubjectTrack },
) {
  const code = input.code.trim();
  const name = input.name.trim();
  const description = (input.description || "").trim();
  const track: SubjectTrack = input.track === "machine" ? "machine" : "written";
  if (!code || !name) throw new Error("科目编号和名称必填");
  db.prepare(`
    INSERT INTO subjects (workspace_id, code, name, description, track)
    VALUES (@workspaceId, @code, @name, @description, @track)
    ON CONFLICT(workspace_id, code) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      track = excluded.track
  `).run({ workspaceId: scope.workspaceId, code, name, description, track });
  return db.prepare("SELECT * FROM subjects WHERE workspace_id = ? AND code = ?").get(
    scope.workspaceId,
    code,
  ) as SubjectRow;
}

export type PointDetail = {
  assets: Array<{ id: number; day: string; original_name: string; mime_type: string; folder_path: string }>;
  mistakes: Array<{ id: number; day: string; title: string; cause: string; graduated: number; next_review: string | null }>;
  reviews: Array<{ id: number; day: string; score: number; note: string }>;
};

/** 单个知识点的关联明细，用于科目页行内展开。 */
export function getPointDetail(db: Database.Database, scope: WorkspaceScope, pointId: string): PointDetail {
  const assets = db.prepare(`
    SELECT DISTINCT a.id, a.day, a.original_name, a.mime_type, a.folder_path
    FROM assets a
    JOIN asset_links l ON l.asset_id = a.id AND l.workspace_id = a.workspace_id
    WHERE a.workspace_id = @workspaceId AND l.knowledge_point_id = @pointId
    ORDER BY a.created_at DESC
    LIMIT 20
  `).all({ workspaceId: scope.workspaceId, pointId }) as PointDetail["assets"];
  const mistakes = db.prepare(`
    SELECT id, day, title, cause, graduated, next_review
    FROM mistakes
    WHERE workspace_id = @workspaceId AND knowledge_point_id = @pointId
    ORDER BY created_at DESC
    LIMIT 20
  `).all({ workspaceId: scope.workspaceId, pointId }) as PointDetail["mistakes"];
  const reviews = db.prepare(`
    SELECT id, day, score, note
    FROM review_events
    WHERE workspace_id = @workspaceId AND knowledge_point_id = @pointId
    ORDER BY created_at DESC
    LIMIT 10
  `).all({ workspaceId: scope.workspaceId, pointId }) as PointDetail["reviews"];
  return { assets, mistakes, reviews };
}

export function renameSubject(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { code: string; name: string; description?: string; track?: SubjectTrack },
) {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code || !name) throw new Error("科目编号和名称必填");
  const existing = db.prepare(`
    SELECT description, track FROM subjects WHERE workspace_id = ? AND code = ?
  `).get(scope.workspaceId, code) as
    | { description: string; track: SubjectTrack }
    | undefined;
  if (!existing) throw new Error("科目不存在");
  db.prepare(`
    UPDATE subjects SET name = ?, description = ?, track = ? WHERE workspace_id = ? AND code = ?
  `).run(
    name,
    input.description === undefined ? existing.description : input.description.trim(),
    input.track === undefined ? existing.track : input.track === "machine" ? "machine" : "written",
    scope.workspaceId,
    code,
  );
}

/** 级联删除科目：其下章节、知识点一并删除，学习记录/错题/资料只解除关联。 */
export function deleteSubject(db: Database.Database, scope: WorkspaceScope, code: string) {
  const subjectCode = code.trim();
  if (!subjectCode) throw new Error("科目编号必填");
  const remove = db.transaction(() => {
    const points = db.prepare(`
      SELECT id FROM knowledge_points WHERE workspace_id = ? AND subject_code = ?
    `).all(scope.workspaceId, subjectCode) as Array<{ id: string }>;
    for (const point of points) detachPointReferences(db, scope, point.id);
    db.prepare("DELETE FROM knowledge_points WHERE workspace_id = ? AND subject_code = ?").run(
      scope.workspaceId,
      subjectCode,
    );
    db.prepare(
      `DELETE FROM knowledge_tags WHERE workspace_id = ? AND chapter_id IN
       (SELECT id FROM subject_chapters WHERE workspace_id = ? AND subject_code = ?)`,
    ).run(scope.workspaceId, scope.workspaceId, subjectCode);
    db.prepare("DELETE FROM subject_chapters WHERE workspace_id = ? AND subject_code = ?").run(scope.workspaceId, subjectCode);
    db.prepare("DELETE FROM asset_links WHERE workspace_id = ? AND subject_code = ?").run(scope.workspaceId, subjectCode);
    db.prepare("UPDATE study_sessions SET subject_code = NULL WHERE workspace_id = ? AND subject_code = ?").run(scope.workspaceId, subjectCode);
    db.prepare("UPDATE mistakes SET subject_code = NULL WHERE workspace_id = ? AND subject_code = ?").run(scope.workspaceId, subjectCode);
    db.prepare("DELETE FROM subjects WHERE workspace_id = ? AND code = ?").run(scope.workspaceId, subjectCode);
  });
  remove();
}

export function createChapter(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { subjectCode: string; title: string },
) {
  const subjectCode = input.subjectCode.trim();
  const title = input.title.trim();
  if (!subjectCode || !title) throw new Error("科目和章节标题必填");
  const existing = db.prepare(`
    SELECT id FROM subject_chapters WHERE workspace_id = ? AND subject_code = ? AND title = ?
  `).get(scope.workspaceId, subjectCode, title);
  if (existing) return existing as { id: string };

  const maxOrder = db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS value FROM subject_chapters
     WHERE workspace_id = ? AND subject_code = ?`,
  ).get(scope.workspaceId, subjectCode) as { value: number };
  const id = `${scope.workspaceId}:chapter:${subjectCode}:${slugFor(title)}-${Date.now().toString(36)}`;
  db.prepare(`
    INSERT INTO subject_chapters (workspace_id, id, subject_code, title, sort_order)
    VALUES (@workspaceId, @id, @subjectCode, @title, @sortOrder)
  `).run({ workspaceId: scope.workspaceId, id, subjectCode, title, sortOrder: maxOrder.value + 1 });
  return { id };
}

export function renameChapter(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; title: string },
) {
  const id = input.id.trim();
  const title = input.title.trim();
  if (!id || !title) throw new Error("章节和标题必填");
  const result = db.prepare(
    `UPDATE subject_chapters SET title = ?, updated_at = CURRENT_TIMESTAMP
     WHERE workspace_id = ? AND id = ?`,
  ).run(title, scope.workspaceId, id);
  if (!result.changes) throw new Error("章节不存在");
}

export function moveChapter(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; direction: "up" | "down" },
) {
  const chapter = db.prepare(`
    SELECT id, subject_code, sort_order FROM subject_chapters WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.id) as
    | { id: string; subject_code: string; sort_order: number }
    | undefined;
  if (!chapter) throw new Error("章节不存在");
  const siblings = db.prepare(
    `SELECT id FROM subject_chapters WHERE workspace_id = ? AND subject_code = ?
     ORDER BY sort_order ASC, title ASC`,
  ).all(scope.workspaceId, chapter.subject_code) as Array<{ id: string }>;
  const index = siblings.findIndex((sibling) => sibling.id === chapter.id);
  const targetIndex = input.direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= siblings.length) return;
  [siblings[index], siblings[targetIndex]] = [siblings[targetIndex], siblings[index]];
  const update = db.prepare("UPDATE subject_chapters SET sort_order = ? WHERE workspace_id = ? AND id = ?");
  const reorder = db.transaction(() => {
    siblings.forEach((sibling, order) => update.run(order + 1, scope.workspaceId, sibling.id));
  });
  reorder();
}

/** 级联删除章节及其知识点；学习记录/错题/资料只解除关联。 */
export function deleteChapter(db: Database.Database, scope: WorkspaceScope, id: string) {
  const chapterId = id.trim();
  if (!chapterId) throw new Error("章节必填");
  const remove = db.transaction(() => {
    const points = db.prepare(`
      SELECT id FROM knowledge_points WHERE workspace_id = ? AND chapter_id = ?
    `).all(scope.workspaceId, chapterId) as Array<{ id: string }>;
    for (const point of points) detachPointReferences(db, scope, point.id);
    db.prepare("DELETE FROM knowledge_points WHERE workspace_id = ? AND chapter_id = ?").run(scope.workspaceId, chapterId);
    db.prepare(
      `DELETE FROM asset_knowledge_tags WHERE workspace_id = ? AND knowledge_tag_id IN
       (SELECT id FROM knowledge_tags WHERE workspace_id = ? AND chapter_id = ?)`,
    ).run(scope.workspaceId, scope.workspaceId, chapterId);
    db.prepare("DELETE FROM knowledge_tags WHERE workspace_id = ? AND chapter_id = ?").run(scope.workspaceId, chapterId);
    db.prepare("UPDATE asset_links SET chapter_id = NULL WHERE workspace_id = ? AND chapter_id = ?").run(scope.workspaceId, chapterId);
    db.prepare("DELETE FROM subject_chapters WHERE workspace_id = ? AND id = ?").run(scope.workspaceId, chapterId);
  });
  remove();
}

export function createPoint(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { chapterId: string; title: string; tier?: Tier; exam?: boolean },
) {
  const chapterId = input.chapterId.trim();
  const title = input.title.trim();
  if (!chapterId || !title) throw new Error("章节和知识点标题必填");
  const chapter = db.prepare(`
    SELECT c.id, c.title, c.subject_code, s.name AS subject_name
    FROM subject_chapters c
    JOIN subjects s ON s.code = c.subject_code AND s.workspace_id = c.workspace_id
    WHERE c.workspace_id = ? AND c.id = ?
  `).get(scope.workspaceId, chapterId) as
    | { id: string; title: string; subject_code: string; subject_name: string }
    | undefined;
  if (!chapter) throw new Error("章节不存在");

  const existing = db.prepare(`
    SELECT id FROM knowledge_points WHERE workspace_id = ? AND chapter_id = ? AND title = ?
  `).get(scope.workspaceId, chapterId, title);
  if (existing) return existing as { id: string };

  const tier: Tier = input.tier && ["r", "y", "g"].includes(input.tier) ? input.tier : "g";
  const maxOrder = db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS value FROM knowledge_points
     WHERE workspace_id = ? AND chapter_id = ?`,
  ).get(scope.workspaceId, chapterId) as { value: number };
  const id = `${scope.workspaceId}:kp:${chapterId}:${slugFor(title)}-${Date.now().toString(36)}`;
  db.prepare(`
    INSERT INTO knowledge_points
      (workspace_id, id, subject_code, subject_name, submodule, tier, tier_name, title,
       exam, status, mastery, reviews, chapter_id, sort_order)
    VALUES
      (@workspaceId, @id, @subjectCode, @subjectName, @submodule, @tier, @tierName,
       @title, @exam, '未学', 0, 0, @chapterId, @sortOrder)
  `).run({
    workspaceId: scope.workspaceId,
    id,
    subjectCode: chapter.subject_code,
    subjectName: chapter.subject_name,
    submodule: chapter.title,
    tier,
    tierName: TIER_NAMES[tier],
    title,
    exam: input.exam ? 1 : 0,
    chapterId,
    sortOrder: maxOrder.value + 1,
  });
  return { id };
}

export function updatePoint(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; title?: string; tier?: Tier; exam?: boolean },
) {
  const point = db.prepare("SELECT * FROM knowledge_points WHERE workspace_id = ? AND id = ?").get(
    scope.workspaceId,
    input.id,
  ) as
    | { id: string; title: string; tier: Tier; exam: number }
    | undefined;
  if (!point) throw new Error("知识点不存在");
  const title = input.title === undefined ? point.title : input.title.trim();
  if (!title) throw new Error("知识点标题必填");
  const tier: Tier = input.tier && ["r", "y", "g"].includes(input.tier) ? input.tier : point.tier;
  const exam = input.exam === undefined ? point.exam : input.exam ? 1 : 0;
  db.prepare(`
    UPDATE knowledge_points
    SET title = @title, tier = @tier, tier_name = @tierName, exam = @exam
    WHERE workspace_id = @workspaceId AND id = @id
  `).run({ workspaceId: scope.workspaceId, id: input.id, title, tier, tierName: TIER_NAMES[tier], exam });
}

export function deletePoint(db: Database.Database, scope: WorkspaceScope, id: string) {
  const pointId = id.trim();
  if (!pointId) throw new Error("知识点必填");
  const remove = db.transaction(() => {
    detachPointReferences(db, scope, pointId);
    db.prepare("DELETE FROM knowledge_points WHERE workspace_id = ? AND id = ?").run(scope.workspaceId, pointId);
  });
  remove();
}

function detachPointReferences(db: Database.Database, scope: WorkspaceScope, pointId: string) {
  db.prepare("DELETE FROM asset_links WHERE workspace_id = ? AND knowledge_point_id = ?").run(scope.workspaceId, pointId);
  db.prepare("UPDATE mistakes SET knowledge_point_id = NULL WHERE workspace_id = ? AND knowledge_point_id = ?").run(scope.workspaceId, pointId);
  db.prepare("UPDATE review_events SET knowledge_point_id = NULL WHERE workspace_id = ? AND knowledge_point_id = ?").run(scope.workspaceId, pointId);
  db.prepare("UPDATE study_sessions SET knowledge_point_id = NULL WHERE workspace_id = ? AND knowledge_point_id = ?").run(scope.workspaceId, pointId);
}

function slugFor(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase()).replaceAll("%", "").slice(0, 40);
}
