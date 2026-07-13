import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { TIER_NAMES, type Tier } from "../types";
import { clampMastery, deriveStatus } from "./mastery";

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
  created_at: string;
  asset_count: number;
  mistake_count: number;
};

export type ChapterWithPoints = {
  id: string;
  title: string;
  sort_order: number;
  parent_id: string | null;
  points: PointRow[];
  children: ChapterWithPoints[];
};

/** 章节树最深层级（含根） */
export const MAX_CHAPTER_DEPTH = 8;

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
  // 标量子查询替代三表 LEFT JOIN：避免 点×资料×错题 的笛卡尔扇出
  //（扇出还会让 AVG(mastery) 被连接行数加权而失真）。
  return db.prepare(`
    SELECT
      s.code,
      s.name,
      s.description,
      s.track,
      (SELECT COUNT(*) FROM knowledge_points k
       WHERE k.workspace_id = s.workspace_id AND k.subject_code = s.code) AS pointCount,
      (SELECT COUNT(*) FROM knowledge_points k
       WHERE k.workspace_id = s.workspace_id AND k.subject_code = s.code AND k.status = '已掌握') AS masteredCount,
      (SELECT COUNT(*) FROM knowledge_points k
       WHERE k.workspace_id = s.workspace_id AND k.subject_code = s.code
         AND k.next_review IS NOT NULL AND k.next_review <= @today) AS dueCount,
      (SELECT COUNT(DISTINCT l.asset_id) FROM asset_links l
       WHERE l.workspace_id = s.workspace_id AND l.subject_code = s.code) AS assetCount,
      (SELECT COUNT(*) FROM mistakes m
       WHERE m.workspace_id = s.workspace_id AND m.subject_code = s.code AND m.graduated = 0) AS openMistakes,
      COALESCE((SELECT ROUND(AVG(k.mastery)) FROM knowledge_points k
       WHERE k.workspace_id = s.workspace_id AND k.subject_code = s.code), 0) AS avgMastery
    FROM subjects s
    WHERE s.workspace_id = @workspaceId
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
    k.created_at,
    (SELECT COUNT(DISTINCT l.asset_id) FROM asset_links l
     WHERE l.workspace_id = k.workspace_id AND l.knowledge_point_id = k.id) AS asset_count,
    (SELECT COUNT(*) FROM mistakes m
     WHERE m.workspace_id = k.workspace_id AND m.knowledge_point_id = k.id AND m.graduated = 0) AS mistake_count
  FROM knowledge_points k
`;

export function getSubjectDetail(db: Database.Database, scope: WorkspaceScope, code: string): SubjectDetail | null {
  const subject = db.prepare("SELECT * FROM subjects WHERE workspace_id = ? AND code = ?").get(
    scope.workspaceId,
    code,
  ) as SubjectRow | undefined;
  if (!subject) return null;

  const chapterRows = db.prepare(`
    SELECT id, title, sort_order, parent_id
    FROM subject_chapters
    WHERE workspace_id = @workspaceId AND subject_code = @code
    ORDER BY sort_order ASC, title ASC
  `).all({ workspaceId: scope.workspaceId, code }) as Array<{
    id: string; title: string; sort_order: number; parent_id: string | null;
  }>;

  // 按 parent_id 组装章节树；父级缺失（脏数据）时按顶层处理
  const chapterById = new Map<string, ChapterWithPoints>(
    chapterRows.map((row) => [row.id, { ...row, points: [], children: [] }]),
  );
  const rootChapters: ChapterWithPoints[] = [];
  for (const node of chapterById.values()) {
    const parent = node.parent_id ? chapterById.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else rootChapters.push(node);
  }

  const points = db.prepare(`
    ${POINT_SELECT}
    WHERE k.workspace_id = @workspaceId AND k.subject_code = @code
    ORDER BY k.sort_order ASC, k.id ASC
  `).all({ workspaceId: scope.workspaceId, code }) as PointRow[];

  const loosePoints: PointRow[] = [];
  for (const point of points) {
    const chapter = point.chapter_id ? chapterById.get(point.chapter_id) : undefined;
    if (chapter) chapter.points.push(point);
    else loosePoints.push(point);
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
    chapters: rootChapters,
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
  input: { subjectCode: string; title: string; parentId?: string | null },
) {
  const subjectCode = input.subjectCode.trim();
  const title = input.title.trim();
  const parentId = input.parentId?.trim() || null;
  if (!subjectCode || !title) throw new Error("科目和章节标题必填");

  if (parentId) {
    const parent = db.prepare(
      "SELECT id, subject_code FROM subject_chapters WHERE workspace_id = ? AND id = ?",
    ).get(scope.workspaceId, parentId) as { id: string; subject_code: string } | undefined;
    if (!parent || parent.subject_code !== subjectCode) throw new Error("父章节不存在");
    if (chapterDepth(db, scope, parentId) >= MAX_CHAPTER_DEPTH) {
      throw new Error(`章节层级最多 ${MAX_CHAPTER_DEPTH} 层`);
    }
  }

  // 章节标题在科目内唯一（表约束）：同父级下同名幂等返回，跨父级同名明确报错
  const existing = db.prepare(`
    SELECT id, parent_id FROM subject_chapters WHERE workspace_id = ? AND subject_code = ? AND title = ?
  `).get(scope.workspaceId, subjectCode, title) as { id: string; parent_id: string | null } | undefined;
  if (existing) {
    if ((existing.parent_id ?? null) === parentId) return { id: existing.id };
    throw new Error("同科目下已有同名章节，请换个标题");
  }

  const maxOrder = db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS value FROM subject_chapters
     WHERE workspace_id = ? AND subject_code = ? AND parent_id IS ?`,
  ).get(scope.workspaceId, subjectCode, parentId) as { value: number };
  const id = `${scope.workspaceId}:chapter:${subjectCode}:${slugFor(title)}-${Date.now().toString(36)}`;
  db.prepare(`
    INSERT INTO subject_chapters (workspace_id, id, subject_code, title, sort_order, parent_id)
    VALUES (@workspaceId, @id, @subjectCode, @title, @sortOrder, @parentId)
  `).run({ workspaceId: scope.workspaceId, id, subjectCode, title, sortOrder: maxOrder.value + 1, parentId });
  return { id };
}

/** 章节自身所在层级（顶层 = 1）；带环兜底上限。 */
function chapterDepth(db: Database.Database, scope: WorkspaceScope, chapterId: string): number {
  const stmt = db.prepare("SELECT parent_id FROM subject_chapters WHERE workspace_id = ? AND id = ?");
  let depth = 0;
  let current: string | null = chapterId;
  while (current && depth <= MAX_CHAPTER_DEPTH + 8) {
    const row = stmt.get(scope.workspaceId, current) as { parent_id: string | null } | undefined;
    if (!row) break;
    depth += 1;
    current = row.parent_id;
  }
  return depth;
}

/** 以 rootId 为根的整棵子树 id 列表（含根），父在前子在后。 */
function collectChapterSubtree(db: Database.Database, scope: WorkspaceScope, rootId: string): string[] {
  const rows = db.prepare(
    "SELECT id, parent_id FROM subject_chapters WHERE workspace_id = ?",
  ).all(scope.workspaceId) as Array<{ id: string; parent_id: string | null }>;
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    const group = childrenOf.get(row.parent_id) || [];
    group.push(row.id);
    childrenOf.set(row.parent_id, group);
  }
  const result: string[] = [];
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    if (result.includes(current)) continue; // 环兜底
    result.push(current);
    queue.push(...(childrenOf.get(current) || []));
  }
  return result;
}

/** 子树自身的高度（根算 1 层）。 */
function chapterSubtreeHeight(db: Database.Database, scope: WorkspaceScope, rootId: string): number {
  const subtree = new Set(collectChapterSubtree(db, scope, rootId));
  let height = 1;
  for (const id of subtree) {
    let level = 1;
    let current = id;
    const stmt = db.prepare("SELECT parent_id FROM subject_chapters WHERE workspace_id = ? AND id = ?");
    while (current !== rootId && level <= MAX_CHAPTER_DEPTH + 8) {
      const row = stmt.get(scope.workspaceId, current) as { parent_id: string | null } | undefined;
      if (!row || !row.parent_id) break;
      current = row.parent_id;
      level += 1;
    }
    if (current === rootId) height = Math.max(height, level);
  }
  return height;
}

/** 把章节挂到新的父级（parentId = null 表示提升为顶层）；防环、防超深。 */
export function reparentChapter(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; parentId: string | null },
) {
  const chapterId = input.id.trim();
  if (!chapterId) throw new Error("章节必填");
  const chapter = db.prepare(
    "SELECT id, subject_code, parent_id FROM subject_chapters WHERE workspace_id = ? AND id = ?",
  ).get(scope.workspaceId, chapterId) as
    | { id: string; subject_code: string; parent_id: string | null }
    | undefined;
  if (!chapter) throw new Error("章节不存在");
  const parentId = input.parentId?.trim() || null;
  if ((chapter.parent_id ?? null) === parentId) return;

  if (parentId) {
    if (parentId === chapterId) throw new Error("不能移动到自身");
    const parent = db.prepare(
      "SELECT id, subject_code FROM subject_chapters WHERE workspace_id = ? AND id = ?",
    ).get(scope.workspaceId, parentId) as { id: string; subject_code: string } | undefined;
    if (!parent || parent.subject_code !== chapter.subject_code) throw new Error("目标章节不存在");
    if (collectChapterSubtree(db, scope, chapterId).includes(parentId)) {
      throw new Error("不能移动到自己的子章节里");
    }
    const depth = chapterDepth(db, scope, parentId) + chapterSubtreeHeight(db, scope, chapterId);
    if (depth > MAX_CHAPTER_DEPTH) throw new Error(`章节层级最多 ${MAX_CHAPTER_DEPTH} 层`);
  }

  const maxOrder = db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS value FROM subject_chapters
     WHERE workspace_id = ? AND subject_code = ? AND parent_id IS ?`,
  ).get(scope.workspaceId, chapter.subject_code, parentId) as { value: number };
  db.prepare(
    `UPDATE subject_chapters SET parent_id = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
     WHERE workspace_id = ? AND id = ?`,
  ).run(parentId, maxOrder.value + 1, scope.workspaceId, chapterId);
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
    SELECT id, subject_code, sort_order, parent_id FROM subject_chapters WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.id) as
    | { id: string; subject_code: string; sort_order: number; parent_id: string | null }
    | undefined;
  if (!chapter) throw new Error("章节不存在");
  const siblings = db.prepare(
    `SELECT id FROM subject_chapters WHERE workspace_id = ? AND subject_code = ? AND parent_id IS ?
     ORDER BY sort_order ASC, title ASC`,
  ).all(scope.workspaceId, chapter.subject_code, chapter.parent_id) as Array<{ id: string }>;
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

/** 级联删除章节（含全部子孙章节）及其知识点；学习记录/错题/资料只解除关联。 */
export function deleteChapter(db: Database.Database, scope: WorkspaceScope, id: string) {
  const rootId = id.trim();
  if (!rootId) throw new Error("章节必填");
  const remove = db.transaction(() => {
    for (const chapterId of collectChapterSubtree(db, scope, rootId)) {
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
    }
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
       exam, status, mastery, reviews, chapter_id, sort_order, created_at)
    VALUES
      (@workspaceId, @id, @subjectCode, @subjectName, @submodule, @tier, @tierName,
       @title, @exam, '未学', 0, 0, @chapterId, @sortOrder, datetime('now'))
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
  input: { id: string; title?: string; tier?: Tier; exam?: boolean; mastery?: number },
) {
  const point = db.prepare("SELECT * FROM knowledge_points WHERE workspace_id = ? AND id = ?").get(
    scope.workspaceId,
    input.id,
  ) as
    | { id: string; title: string; tier: Tier; exam: number; mastery: number; status: string }
    | undefined;
  if (!point) throw new Error("知识点不存在");
  const title = input.title === undefined ? point.title : input.title.trim();
  if (!title) throw new Error("知识点标题必填");
  const tier: Tier = input.tier && ["r", "y", "g"].includes(input.tier) ? input.tier : point.tier;
  const exam = input.exam === undefined ? point.exam : input.exam ? 1 : 0;
  const mastery = input.mastery === undefined ? point.mastery : clampMastery(input.mastery);
  const status = input.mastery === undefined ? point.status : deriveStatus(mastery);
  db.prepare(`
    UPDATE knowledge_points
    SET title = @title, tier = @tier, tier_name = @tierName, exam = @exam,
        mastery = @mastery, status = @status
    WHERE workspace_id = @workspaceId AND id = @id
  `).run({ workspaceId: scope.workspaceId, id: input.id, title, tier, tierName: TIER_NAMES[tier], exam, mastery, status });
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

/** 手动拖拽后的整章重排：orderedIds 必须与该章节现有知识点集合完全一致。 */
export function reorderPoints(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { chapterId: string; orderedIds: string[] },
) {
  const chapterId = input.chapterId.trim();
  if (!chapterId) throw new Error("章节必填");
  const existing = db.prepare(
    "SELECT id FROM knowledge_points WHERE workspace_id = ? AND chapter_id = ?",
  ).all(scope.workspaceId, chapterId) as Array<{ id: string }>;
  const existingIds = new Set(existing.map((row) => row.id));
  const unique = new Set(input.orderedIds);
  if (
    unique.size !== input.orderedIds.length
    || existingIds.size !== unique.size
    || !input.orderedIds.every((id) => existingIds.has(id))
  ) {
    throw new Error("排序列表与章节内知识点不一致，请刷新后重试");
  }
  const update = db.prepare("UPDATE knowledge_points SET sort_order = ? WHERE workspace_id = ? AND id = ?");
  const reorder = db.transaction(() => {
    input.orderedIds.forEach((id, index) => update.run(index + 1, scope.workspaceId, id));
  });
  reorder();
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
