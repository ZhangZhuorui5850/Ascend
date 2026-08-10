import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { TIER_NAMES, type Tier } from "../types";
import { clampMastery } from "./mastery";

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
  parent_point_id: string | null;
  subject_code: string;
  title: string;
  tier: Tier;
  tier_name: string;
  status: string;
  mastery: number;
  self_confidence: number | null;
  exam: number;
  reviews: number;
  last_review: string | null;
  next_review: string | null;
  prompt: string;
  answer: string;
  interval_step: number;
  lapse_count: number;
  last_score: number | null;
  evidence_sample_count: number;
  last_evidence_score: number | null;
  last_evidence_day: string | null;
  created_at: string;
  asset_count: number;
  mistake_count: number;
};

/** 知识点树节点：children 为子知识点，顺序即兄弟组内 sort_order */
export type PointNode = PointRow & { children: PointNode[] };

export type ChapterWithPoints = {
  id: string;
  title: string;
  sort_order: number;
  parent_id: string | null;
  points: PointNode[];
  children: ChapterWithPoints[];
};

/** 章节树最深层级（含根） */
export const MAX_CHAPTER_DEPTH = 8;

/** 知识点树最深层级（章节直属 = 1） */
export const MAX_POINT_DEPTH = 8;

/** 深度优先拍平知识点树（含每个根自身）。 */
export function flattenPointTree(points: PointNode[]): PointNode[] {
  return points.flatMap((point) => [point, ...flattenPointTree(point.children)]);
}

/** 深度优先收集整棵章节树（含子孙）下的全部知识点（含嵌套子点）。 */
export function flattenChapterPoints(chapters: ChapterWithPoints[]): PointNode[] {
  return chapters.flatMap((chapter) => [
    ...flattenPointTree(chapter.points),
    ...flattenChapterPoints(chapter.children),
  ]);
}

export type SubjectDetail = {
  subject: SubjectRow;
  chapters: ChapterWithPoints[];
  loosePoints: PointNode[];
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
    k.parent_point_id,
    k.subject_code,
    k.title,
    k.tier,
    k.tier_name,
    k.status,
    k.mastery,
    k.self_confidence,
    k.exam,
    k.reviews,
    k.last_review,
    k.next_review,
    k.prompt,
    k.answer,
    k.interval_step,
    k.lapse_count,
    k.last_score,
    (SELECT COUNT(*) FROM review_events r
     WHERE r.workspace_id = k.workspace_id
       AND r.knowledge_point_id = k.id
       AND r.attempt_mode != 'unknown') AS evidence_sample_count,
    (SELECT r.score FROM review_events r
     WHERE r.workspace_id = k.workspace_id
       AND r.knowledge_point_id = k.id
       AND r.attempt_mode != 'unknown'
     ORDER BY r.day DESC, r.id DESC LIMIT 1) AS last_evidence_score,
    (SELECT r.day FROM review_events r
     WHERE r.workspace_id = k.workspace_id
       AND r.knowledge_point_id = k.id
       AND r.attempt_mode != 'unknown'
     ORDER BY r.day DESC, r.id DESC LIMIT 1) AS last_evidence_day,
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

  // 组装知识点树：父点缺失（脏数据）时按章节直属处理；查询序即兄弟组内顺序
  const pointById = new Map<string, PointNode>(points.map((row) => [row.id, { ...row, children: [] }]));
  const loosePoints: PointNode[] = [];
  for (const node of pointById.values()) {
    const parent = node.parent_point_id ? pointById.get(node.parent_point_id) : undefined;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
      continue;
    }
    const chapter = node.chapter_id ? chapterById.get(node.chapter_id) : undefined;
    if (chapter) chapter.points.push(node);
    else loosePoints.push(node);
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
  reviews: Array<{
    id: number;
    day: string;
    score: number;
    note: string;
    event_type: "point_review" | "mistake_reattempt";
    attempt_mode: "unknown" | "typed" | "paper" | "oral";
    attempt_text: string;
    attempt_duration_seconds: number;
    pre_confidence: number | null;
  }>;
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
    SELECT id, day, score, note, event_type, attempt_mode, attempt_text,
           attempt_duration_seconds, pre_confidence
    FROM review_events
    WHERE workspace_id = @workspaceId AND knowledge_point_id = @pointId
    ORDER BY created_at DESC, id DESC
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
    assertNoCanonicalLearningReferences(db, scope, points.map((point) => point.id));
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

/** 拖拽移动章节：挂到 parentId（null = 顶层）同级第 index 位（0 起，越界夹取）；防环、防超深。 */
export function moveChapterToPosition(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; parentId: string | null; index: number },
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

  const siblings = (db.prepare(
    `SELECT id FROM subject_chapters WHERE workspace_id = ? AND subject_code = ? AND parent_id IS ?
     ORDER BY sort_order ASC, title ASC`,
  ).all(scope.workspaceId, chapter.subject_code, parentId) as Array<{ id: string }>)
    .map((row) => row.id)
    .filter((id) => id !== chapterId);
  const index = Math.max(0, Math.min(Math.trunc(input.index), siblings.length));
  siblings.splice(index, 0, chapterId);
  const setOrder = db.prepare("UPDATE subject_chapters SET sort_order = ? WHERE workspace_id = ? AND id = ?");
  const move = db.transaction(() => {
    db.prepare(
      "UPDATE subject_chapters SET parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ?",
    ).run(parentId, scope.workspaceId, chapterId);
    siblings.forEach((id, order) => setOrder.run(order + 1, scope.workspaceId, id));
  });
  move();
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
    const chapterIds = collectChapterSubtree(db, scope, rootId);
    const pointIds = chapterIds.flatMap((chapterId) => (
      db.prepare(`
        SELECT id FROM knowledge_points WHERE workspace_id = ? AND chapter_id = ?
      `).all(scope.workspaceId, chapterId) as Array<{ id: string }>
    ).map((point) => point.id));
    assertNoCanonicalLearningReferences(db, scope, pointIds);
    for (const chapterId of chapterIds) {
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

/** 知识点自身所在层级（章节直属 = 1）；带环兜底上限。 */
function pointDepth(db: Database.Database, scope: WorkspaceScope, pointId: string): number {
  const stmt = db.prepare("SELECT parent_point_id FROM knowledge_points WHERE workspace_id = ? AND id = ?");
  let depth = 0;
  let current: string | null = pointId;
  while (current && depth <= MAX_POINT_DEPTH + 8) {
    const row = stmt.get(scope.workspaceId, current) as { parent_point_id: string | null } | undefined;
    if (!row) break;
    depth += 1;
    current = row.parent_point_id;
  }
  return depth;
}

/** 以 rootId 为根的整棵知识点子树 id 列表（含根），父在前子在后。 */
function collectPointSubtree(db: Database.Database, scope: WorkspaceScope, rootId: string): string[] {
  const rows = db.prepare(
    "SELECT id, parent_point_id FROM knowledge_points WHERE workspace_id = ? AND parent_point_id IS NOT NULL",
  ).all(scope.workspaceId) as Array<{ id: string; parent_point_id: string }>;
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    const group = childrenOf.get(row.parent_point_id) || [];
    group.push(row.id);
    childrenOf.set(row.parent_point_id, group);
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

/** 知识点子树自身的高度（根算 1 层）。 */
function pointSubtreeHeight(db: Database.Database, scope: WorkspaceScope, rootId: string): number {
  const subtree = new Set(collectPointSubtree(db, scope, rootId));
  const stmt = db.prepare("SELECT parent_point_id FROM knowledge_points WHERE workspace_id = ? AND id = ?");
  let height = 1;
  for (const id of subtree) {
    let level = 1;
    let current = id;
    while (current !== rootId && level <= MAX_POINT_DEPTH + 8) {
      const row = stmt.get(scope.workspaceId, current) as { parent_point_id: string | null } | undefined;
      if (!row || !row.parent_point_id) break;
      current = row.parent_point_id;
      level += 1;
    }
    if (current === rootId) height = Math.max(height, level);
  }
  return height;
}

/** 兄弟组 =（同 chapter_id, 同 parent_point_id）；chapter_id 可为 NULL（未分章）。 */
const SIBLING_SELECT = `
  SELECT id FROM knowledge_points
  WHERE workspace_id = ? AND chapter_id IS ? AND parent_point_id IS ?
  ORDER BY sort_order ASC, id ASC
`;

export function createPoint(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { chapterId?: string | null; parentPointId?: string | null; title: string; tier?: Tier; exam?: boolean },
) {
  const title = input.title.trim();
  const parentPointId = input.parentPointId?.trim() || null;
  let chapterId = input.chapterId?.trim() || null;
  if (!title) throw new Error("知识点标题必填");

  let subjectCode: string;
  let subjectName: string;
  let submodule: string;
  if (parentPointId) {
    // 子知识点：章节/科目/submodule 全部继承父点
    const parent = db.prepare(`
      SELECT id, chapter_id, subject_code, subject_name, submodule
      FROM knowledge_points WHERE workspace_id = ? AND id = ?
    `).get(scope.workspaceId, parentPointId) as
      | { id: string; chapter_id: string | null; subject_code: string; subject_name: string; submodule: string }
      | undefined;
    if (!parent) throw new Error("父知识点不存在");
    if (pointDepth(db, scope, parentPointId) >= MAX_POINT_DEPTH) {
      throw new Error(`知识点层级最多 ${MAX_POINT_DEPTH} 层`);
    }
    chapterId = parent.chapter_id;
    subjectCode = parent.subject_code;
    subjectName = parent.subject_name;
    submodule = parent.submodule;
  } else {
    if (!chapterId) throw new Error("章节和知识点标题必填");
    const chapter = db.prepare(`
      SELECT c.id, c.title, c.subject_code, s.name AS subject_name
      FROM subject_chapters c
      JOIN subjects s ON s.code = c.subject_code AND s.workspace_id = c.workspace_id
      WHERE c.workspace_id = ? AND c.id = ?
    `).get(scope.workspaceId, chapterId) as
      | { id: string; title: string; subject_code: string; subject_name: string }
      | undefined;
    if (!chapter) throw new Error("章节不存在");
    subjectCode = chapter.subject_code;
    subjectName = chapter.subject_name;
    submodule = chapter.title;
  }

  // 同兄弟组内同名幂等返回；不同父点下允许同名
  const existing = db.prepare(`
    SELECT id FROM knowledge_points
    WHERE workspace_id = ? AND chapter_id IS ? AND parent_point_id IS ? AND title = ?
  `).get(scope.workspaceId, chapterId, parentPointId, title);
  if (existing) return existing as { id: string };

  const tier: Tier = input.tier && ["r", "y", "g"].includes(input.tier) ? input.tier : "g";
  const maxOrder = db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS value FROM knowledge_points
     WHERE workspace_id = ? AND chapter_id IS ? AND parent_point_id IS ?`,
  ).get(scope.workspaceId, chapterId, parentPointId) as { value: number };
  // 同毫秒内不同兄弟组可创建同名点，时间戳后再加随机段防 id 撞 UNIQUE
  const id = `${scope.workspaceId}:kp:${chapterId ?? "loose"}:${slugFor(title)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO knowledge_points
      (workspace_id, id, subject_code, subject_name, submodule, tier, tier_name, title,
       exam, status, mastery, reviews, chapter_id, parent_point_id, sort_order, created_at)
    VALUES
      (@workspaceId, @id, @subjectCode, @subjectName, @submodule, @tier, @tierName,
       @title, @exam, '未学', 0, 0, @chapterId, @parentPointId, @sortOrder, datetime('now'))
  `).run({
    workspaceId: scope.workspaceId,
    id,
    subjectCode,
    subjectName,
    submodule,
    tier,
    tierName: TIER_NAMES[tier],
    title,
    exam: input.exam ? 1 : 0,
    chapterId,
    parentPointId,
    sortOrder: maxOrder.value + 1,
  });
  return { id };
}

export function updatePoint(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    id: string;
    title?: string;
    tier?: Tier;
    exam?: boolean;
    selfConfidence?: number | null;
    prompt?: string;
    answer?: string;
  },
) {
  const point = db.prepare("SELECT * FROM knowledge_points WHERE workspace_id = ? AND id = ?").get(
    scope.workspaceId,
    input.id,
  ) as
    | {
        id: string;
        title: string;
        tier: Tier;
        exam: number;
        self_confidence: number | null;
        prompt: string;
        answer: string;
      }
    | undefined;
  if (!point) throw new Error("知识点不存在");
  const title = input.title === undefined ? point.title : input.title.trim();
  if (!title) throw new Error("知识点标题必填");
  const tier: Tier = input.tier && ["r", "y", "g"].includes(input.tier) ? input.tier : point.tier;
  const exam = input.exam === undefined ? point.exam : input.exam ? 1 : 0;
  const selfConfidence = input.selfConfidence === undefined
    ? point.self_confidence
    : input.selfConfidence === null
      ? null
      : clampMastery(input.selfConfidence);
  const prompt = input.prompt === undefined ? point.prompt : input.prompt.trim();
  const answer = input.answer === undefined ? point.answer : input.answer.trim();
  db.prepare(`
    UPDATE knowledge_points
    SET title = @title, tier = @tier, tier_name = @tierName, exam = @exam,
        self_confidence = @selfConfidence, prompt = @prompt, answer = @answer
    WHERE workspace_id = @workspaceId AND id = @id
  `).run({
    workspaceId: scope.workspaceId,
    id: input.id,
    title,
    tier,
    tierName: TIER_NAMES[tier],
    exam,
    selfConfidence,
    prompt,
    answer,
  });
}

/** 级联删除知识点（含全部子孙知识点）；学习记录/错题/资料只解除关联。 */
export function deletePoint(db: Database.Database, scope: WorkspaceScope, id: string) {
  const pointId = id.trim();
  if (!pointId) throw new Error("知识点必填");
  const remove = db.transaction(() => {
    const nodeIds = collectPointSubtree(db, scope, pointId);
    assertNoCanonicalLearningReferences(db, scope, nodeIds);
    for (const nodeId of nodeIds) {
      detachPointReferences(db, scope, nodeId);
      db.prepare("DELETE FROM knowledge_points WHERE workspace_id = ? AND id = ?").run(scope.workspaceId, nodeId);
    }
  });
  remove();
}

/** 手动拖拽后的兄弟组重排：orderedIds 必须与（chapterId, parentPointId）组内现有知识点集合完全一致。 */
export function reorderPoints(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { chapterId?: string | null; parentPointId?: string | null; orderedIds: string[] },
) {
  const chapterId = input.chapterId?.trim() || null;
  const parentPointId = input.parentPointId?.trim() || null;
  if (!chapterId && !parentPointId) throw new Error("章节必填");
  const existing = db.prepare(
    "SELECT id FROM knowledge_points WHERE workspace_id = ? AND chapter_id IS ? AND parent_point_id IS ?",
  ).all(scope.workspaceId, chapterId, parentPointId) as Array<{ id: string }>;
  const existingIds = new Set(existing.map((row) => row.id));
  const unique = new Set(input.orderedIds);
  if (
    unique.size !== input.orderedIds.length
    || existingIds.size !== unique.size
    || !input.orderedIds.every((id) => existingIds.has(id))
  ) {
    throw new Error("排序列表与知识点不一致，请刷新后重试");
  }
  const update = db.prepare("UPDATE knowledge_points SET sort_order = ? WHERE workspace_id = ? AND id = ?");
  const reorder = db.transaction(() => {
    input.orderedIds.forEach((id, index) => update.run(index + 1, scope.workspaceId, id));
  });
  reorder();
}

/**
 * 拖拽移动知识点（整棵子树跟随）：
 * - targetParentPointId 有值：成为该知识点的子点，章节随父点走（targetChapterId 忽略）；
 * - 否则挂到 targetChapterId 章节直属层。
 * 插到目标兄弟组第 index 位（0 起，越界夹取）；防环、防超深；跨章时同步整棵子树的 chapter_id/submodule 并重排原组。
 */
export function movePointToPosition(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { pointId: string; targetChapterId?: string | null; targetParentPointId?: string | null; index: number },
) {
  const pointId = input.pointId.trim();
  const targetParentPointId = input.targetParentPointId?.trim() || null;
  if (!pointId) throw new Error("知识点必填");
  const point = db.prepare(
    "SELECT id, chapter_id, parent_point_id, subject_code FROM knowledge_points WHERE workspace_id = ? AND id = ?",
  ).get(scope.workspaceId, pointId) as
    | { id: string; chapter_id: string | null; parent_point_id: string | null; subject_code: string }
    | undefined;
  if (!point) throw new Error("知识点不存在");

  let targetChapterId: string | null;
  let submodule: string;
  if (targetParentPointId) {
    if (targetParentPointId === pointId) throw new Error("不能移动到自身");
    const parent = db.prepare(`
      SELECT id, chapter_id, subject_code, submodule FROM knowledge_points WHERE workspace_id = ? AND id = ?
    `).get(scope.workspaceId, targetParentPointId) as
      | { id: string; chapter_id: string | null; subject_code: string; submodule: string }
      | undefined;
    if (!parent) throw new Error("目标知识点不存在");
    if (parent.subject_code !== point.subject_code) throw new Error("不能移动到其他科目的知识点下");
    if (collectPointSubtree(db, scope, pointId).includes(targetParentPointId)) {
      throw new Error("不能移动到自己的子知识点里");
    }
    const depth = pointDepth(db, scope, targetParentPointId) + pointSubtreeHeight(db, scope, pointId);
    if (depth > MAX_POINT_DEPTH) throw new Error(`知识点层级最多 ${MAX_POINT_DEPTH} 层`);
    targetChapterId = parent.chapter_id;
    submodule = parent.submodule;
  } else {
    targetChapterId = input.targetChapterId?.trim() || null;
    if (!targetChapterId) throw new Error("知识点和目标章节必填");
    const target = db.prepare(
      "SELECT id, title, subject_code FROM subject_chapters WHERE workspace_id = ? AND id = ?",
    ).get(scope.workspaceId, targetChapterId) as
      | { id: string; title: string; subject_code: string }
      | undefined;
    if (!target) throw new Error("目标章节不存在");
    if (target.subject_code !== point.subject_code) throw new Error("不能移动到其他科目的章节");
    submodule = target.title;
  }

  const setOrder = db.prepare("UPDATE knowledge_points SET sort_order = ? WHERE workspace_id = ? AND id = ?");
  const sameGroup = (point.chapter_id ?? null) === targetChapterId
    && (point.parent_point_id ?? null) === targetParentPointId;
  const move = db.transaction(() => {
    if (!sameGroup) {
      const rest = (db.prepare(SIBLING_SELECT).all(
        scope.workspaceId, point.chapter_id, point.parent_point_id,
      ) as Array<{ id: string }>).filter((row) => row.id !== pointId);
      rest.forEach((row, order) => setOrder.run(order + 1, scope.workspaceId, row.id));
    }
    db.prepare(
      "UPDATE knowledge_points SET chapter_id = ?, parent_point_id = ?, submodule = ? WHERE workspace_id = ? AND id = ?",
    ).run(targetChapterId, targetParentPointId, submodule, scope.workspaceId, pointId);
    // 不变量：整棵子树的 chapter_id/submodule 与根一致
    const syncDescendant = db.prepare(
      "UPDATE knowledge_points SET chapter_id = ?, submodule = ? WHERE workspace_id = ? AND id = ?",
    );
    for (const nodeId of collectPointSubtree(db, scope, pointId)) {
      if (nodeId !== pointId) syncDescendant.run(targetChapterId, submodule, scope.workspaceId, nodeId);
    }
    const ids = (db.prepare(SIBLING_SELECT).all(
      scope.workspaceId, targetChapterId, targetParentPointId,
    ) as Array<{ id: string }>)
      .map((row) => row.id)
      .filter((id) => id !== pointId);
    const index = Math.max(0, Math.min(Math.trunc(input.index), ids.length));
    ids.splice(index, 0, pointId);
    ids.forEach((id, order) => setOrder.run(order + 1, scope.workspaceId, id));
  });
  move();
}

function detachPointReferences(db: Database.Database, scope: WorkspaceScope, pointId: string) {
  db.prepare("DELETE FROM asset_links WHERE workspace_id = ? AND knowledge_point_id = ?").run(scope.workspaceId, pointId);
  db.prepare("UPDATE mistakes SET knowledge_point_id = NULL WHERE workspace_id = ? AND knowledge_point_id = ?").run(scope.workspaceId, pointId);
  db.prepare("UPDATE review_events SET knowledge_point_id = NULL WHERE workspace_id = ? AND knowledge_point_id = ?").run(scope.workspaceId, pointId);
  db.prepare("UPDATE study_sessions SET knowledge_point_id = NULL WHERE workspace_id = ? AND knowledge_point_id = ?").run(scope.workspaceId, pointId);
}

function assertNoCanonicalLearningReferences(
  db: Database.Database,
  scope: WorkspaceScope,
  pointIds: string[],
): void {
  if (!pointIds.length) return;
  const placeholders = pointIds.map(() => "?").join(", ");
  const parameters = [scope.workspaceId, ...pointIds];
  const links = db.prepare(`
    SELECT COUNT(*) AS count
    FROM learning_task_links
    WHERE workspace_id = ? AND knowledge_point_id IN (${placeholders})
  `).get(...parameters) as { count: number };
  const evidence = db.prepare(`
    SELECT COUNT(*) AS count
    FROM learning_evidence
    WHERE workspace_id = ? AND knowledge_point_id IN (${placeholders})
  `).get(...parameters) as { count: number };
  if (links.count || evidence.count) {
    throw new Error(
      `知识点仍被 ${links.count} 个学习任务和 ${evidence.count} 条学习证据引用；为保留审计记录，当前不可删除`,
    );
  }
}

function slugFor(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase()).replaceAll("%", "").slice(0, 40);
}
