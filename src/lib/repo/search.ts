import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { getAlgorithmProviderDescriptor } from "../algorithm-providers";

export type SearchEntityKind = "knowledge_point" | "mistake" | "task" | "note" | "asset" | "algorithm_problem";

export type SearchTrainingAction = {
  title: string;
  subjectCode: string | null;
  knowledgePointId: string | null;
  sourceType: "knowledge_point" | "mistake";
  sourceId: string;
  notes: string;
};

export type WorkspaceSearchResult = {
  key: string;
  kind: SearchEntityKind;
  group: string;
  title: string;
  excerpt: string;
  meta: string;
  href: string;
  training: SearchTrainingAction | null;
};

const GROUP_LABELS: Record<SearchEntityKind, string> = {
  knowledge_point: "知识点",
  mistake: "错题",
  task: "任务",
  note: "随笔",
  asset: "资料",
  algorithm_problem: "算法题",
};

export function searchWorkspace(
  db: Database.Database,
  scope: WorkspaceScope,
  rawQuery: string,
  input: { perKindLimit?: number } = {},
): WorkspaceSearchResult[] {
  const query = rawQuery.trim().slice(0, 80);
  if (!query) return [];
  const perKindLimit = Math.min(10, Math.max(1, Math.round(input.perKindLimit ?? 6)));
  const pattern = `%${escapeLike(query)}%`;
  const prefix = `${escapeLike(query)}%`;

  const points = db.prepare(`
    SELECT
      k.id, k.subject_code, k.title, k.prompt, k.answer,
      COALESCE(c.title, '') AS chapter_title
    FROM knowledge_points k
    LEFT JOIN subject_chapters c
      ON c.workspace_id = k.workspace_id AND c.id = k.chapter_id
    WHERE k.workspace_id = @workspaceId
      AND (
        k.title LIKE @pattern ESCAPE '\\'
        OR k.prompt LIKE @pattern ESCAPE '\\'
        OR k.answer LIKE @pattern ESCAPE '\\'
        OR k.submodule LIKE @pattern ESCAPE '\\'
        OR COALESCE(c.title, '') LIKE @pattern ESCAPE '\\'
      )
    ORDER BY
      CASE
        WHEN k.title = @query COLLATE NOCASE THEN 0
        WHEN k.title LIKE @prefix ESCAPE '\\' THEN 1
        ELSE 2
      END,
      k.reviews DESC,
      k.title COLLATE NOCASE ASC
    LIMIT @limit
  `).all({
    workspaceId: scope.workspaceId,
    query,
    pattern,
    prefix,
    limit: perKindLimit,
  }) as Array<{
    id: string;
    subject_code: string;
    title: string;
    prompt: string;
    answer: string;
    chapter_title: string;
  }>;

  const mistakes = db.prepare(`
    SELECT
      m.id, m.day, m.title, m.cause, m.cause_category, m.graduated,
      m.subject_code, m.knowledge_point_id, COALESCE(k.title, '') AS knowledge_title
    FROM mistakes m
    LEFT JOIN knowledge_points k
      ON k.workspace_id = m.workspace_id AND k.id = m.knowledge_point_id
    WHERE m.workspace_id = @workspaceId
      AND (
        m.title LIKE @pattern ESCAPE '\\'
        OR m.cause LIKE @pattern ESCAPE '\\'
        OR m.cause_category LIKE @pattern ESCAPE '\\'
        OR COALESCE(k.title, '') LIKE @pattern ESCAPE '\\'
      )
    ORDER BY
      CASE
        WHEN m.title = @query COLLATE NOCASE THEN 0
        WHEN m.title LIKE @prefix ESCAPE '\\' THEN 1
        ELSE 2
      END,
      m.graduated ASC,
      m.day DESC,
      m.id DESC
    LIMIT @limit
  `).all({
    workspaceId: scope.workspaceId,
    query,
    pattern,
    prefix,
    limit: perKindLimit,
  }) as Array<{
    id: number;
    day: string;
    title: string;
    cause: string;
    cause_category: string;
    graduated: number;
    subject_code: string | null;
    knowledge_point_id: string | null;
    knowledge_title: string;
  }>;

  const tasks = db.prepare(`
    SELECT
      id, day, title, subject_code, done, notes, completion_criteria,
      completion_output, verification_result
    FROM day_tasks
    WHERE workspace_id = @workspaceId
      AND (
        title LIKE @pattern ESCAPE '\\'
        OR notes LIKE @pattern ESCAPE '\\'
        OR completion_criteria LIKE @pattern ESCAPE '\\'
        OR completion_output LIKE @pattern ESCAPE '\\'
        OR verification_result LIKE @pattern ESCAPE '\\'
      )
    ORDER BY
      CASE
        WHEN title = @query COLLATE NOCASE THEN 0
        WHEN title LIKE @prefix ESCAPE '\\' THEN 1
        ELSE 2
      END,
      day DESC,
      id DESC
    LIMIT @limit
  `).all({
    workspaceId: scope.workspaceId,
    query,
    pattern,
    prefix,
    limit: perKindLimit,
  }) as Array<{
    id: number;
    day: string;
    title: string;
    subject_code: string | null;
    done: number;
    notes: string;
    completion_criteria: string;
    completion_output: string;
    verification_result: string;
  }>;

  const notes = db.prepare(`
    SELECT id, day, content, created_at
    FROM day_notes
    WHERE workspace_id = @workspaceId
      AND content LIKE @pattern ESCAPE '\\'
    ORDER BY
      CASE
        WHEN content = @query COLLATE NOCASE THEN 0
        WHEN content LIKE @prefix ESCAPE '\\' THEN 1
        ELSE 2
      END,
      day DESC,
      id DESC
    LIMIT @limit
  `).all({
    workspaceId: scope.workspaceId,
    query,
    pattern,
    prefix,
    limit: perKindLimit,
  }) as Array<{ id: number; day: string; content: string; created_at: string }>;

  const assets = db.prepare(`
    SELECT
      a.id, a.day, a.original_name, a.note, a.category, a.folder_path,
      COALESCE(GROUP_CONCAT(DISTINCT k.title), '') AS knowledge_titles
    FROM assets a
    LEFT JOIN asset_links l
      ON l.workspace_id = a.workspace_id AND l.asset_id = a.id
    LEFT JOIN knowledge_points k
      ON k.workspace_id = a.workspace_id AND k.id = l.knowledge_point_id
    LEFT JOIN subject_chapters c
      ON c.workspace_id = a.workspace_id AND c.id = l.chapter_id
    WHERE a.workspace_id = @workspaceId
      AND (
        a.original_name LIKE @pattern ESCAPE '\\'
        OR a.note LIKE @pattern ESCAPE '\\'
        OR a.category LIKE @pattern ESCAPE '\\'
        OR a.folder_path LIKE @pattern ESCAPE '\\'
        OR COALESCE(l.subject_code, '') LIKE @pattern ESCAPE '\\'
        OR COALESCE(c.title, '') LIKE @pattern ESCAPE '\\'
        OR COALESCE(k.title, '') LIKE @pattern ESCAPE '\\'
      )
    GROUP BY a.id
    ORDER BY
      CASE
        WHEN a.original_name = @query COLLATE NOCASE THEN 0
        WHEN a.original_name LIKE @prefix ESCAPE '\\' THEN 1
        ELSE 2
      END,
      a.created_at DESC,
      a.id DESC
    LIMIT @limit
  `).all({
    workspaceId: scope.workspaceId,
    query,
    pattern,
    prefix,
    limit: perKindLimit,
  }) as Array<{
    id: number;
    day: string;
    original_name: string;
    note: string;
    category: string;
    folder_path: string;
    knowledge_titles: string;
  }>;

  const algorithmProblems = db.prepare(`
    SELECT p.id, p.title, p.provider_id, p.external_problem_id,
           p.difficulty_band, p.tags_json, p.evidence_status, p.notes
    FROM algorithm_problems p
    JOIN workspace_plugins wp
      ON wp.workspace_id = p.workspace_id
      AND wp.plugin_id = 'algorithms'
      AND wp.enabled = 1
      AND wp.state = 'enabled'
    WHERE p.workspace_id = @workspaceId
      AND (
        p.title LIKE @pattern ESCAPE '\\'
        OR p.external_problem_id LIKE @pattern ESCAPE '\\'
        OR p.tags_json LIKE @pattern ESCAPE '\\'
        OR p.notes LIKE @pattern ESCAPE '\\'
      )
    ORDER BY
      CASE
        WHEN p.title = @query COLLATE NOCASE THEN 0
        WHEN p.title LIKE @prefix ESCAPE '\\' THEN 1
        ELSE 2
      END,
      p.updated_at DESC,
      p.id DESC
    LIMIT @limit
  `).all({
    workspaceId: scope.workspaceId,
    query,
    pattern,
    prefix,
    limit: perKindLimit,
  }) as Array<{
    id: number;
    title: string;
    provider_id: string;
    external_problem_id: string;
    difficulty_band: string;
    tags_json: string;
    evidence_status: string;
    notes: string;
  }>;

  return [
    ...points.map((point): WorkspaceSearchResult => ({
      key: `knowledge_point:${point.id}`,
      kind: "knowledge_point",
      group: GROUP_LABELS.knowledge_point,
      title: point.title,
      excerpt: excerpt(point.prompt || point.answer, query),
      meta: [point.subject_code, point.chapter_title].filter(Boolean).join(" · "),
      href: `/subjects/${encodeURIComponent(point.subject_code)}?focus=${encodeURIComponent(point.id)}`,
      training: {
        title: `知识点专项：${point.title}`,
        subjectCode: point.subject_code,
        knowledgePointId: point.id,
        sourceType: "knowledge_point",
        sourceId: point.id,
        notes: `由全局搜索中的知识点“${point.title}”创建。完成后进行一次无提示回忆并记录结果。`,
      },
    })),
    ...mistakes.map((mistake): WorkspaceSearchResult => ({
      key: `mistake:${mistake.id}`,
      kind: "mistake",
      group: GROUP_LABELS.mistake,
      title: mistake.title,
      excerpt: excerpt(mistake.cause || mistake.knowledge_title, query),
      meta: [
        mistake.subject_code,
        mistake.cause_category,
        mistake.graduated ? "已毕业" : "回炉中",
        mistake.day,
      ].filter(Boolean).join(" · "),
      href: `/mistakes#mistake-${mistake.id}`,
      training: {
        title: `错题专项：${mistake.title}`,
        subjectCode: mistake.subject_code,
        knowledgePointId: mistake.knowledge_point_id,
        sourceType: "mistake",
        sourceId: String(mistake.id),
        notes: `由全局搜索中的错题创建；原记录日期 ${mistake.day}。独立重做并完成一道同类题。`,
      },
    })),
    ...tasks.map((task): WorkspaceSearchResult => ({
      key: `task:${task.id}`,
      kind: "task",
      group: GROUP_LABELS.task,
      title: task.title,
      excerpt: excerpt(
        task.completion_output
        || task.verification_result
        || task.completion_criteria
        || task.notes,
        query,
      ),
      meta: [task.day, task.subject_code, task.done ? "已完成" : "未完成"].filter(Boolean).join(" · "),
      href: `/day/${task.day}#task-${task.id}`,
      training: null,
    })),
    ...notes.map((note): WorkspaceSearchResult => ({
      key: `note:${note.id}`,
      kind: "note",
      group: GROUP_LABELS.note,
      title: titleFromText(note.content),
      excerpt: excerpt(note.content, query, 100),
      meta: note.day,
      href: `/day/${note.day}#note-${note.id}`,
      training: null,
    })),
    ...assets.map((asset): WorkspaceSearchResult => ({
      key: `asset:${asset.id}`,
      kind: "asset",
      group: GROUP_LABELS.asset,
      title: asset.original_name,
      excerpt: excerpt(asset.note || asset.knowledge_titles, query),
      meta: [asset.folder_path || "根目录", asset.category, asset.day].filter(Boolean).join(" · "),
      href: `/assets?q=${encodeURIComponent(asset.original_name)}`,
      training: null,
    })),
    ...algorithmProblems.map((problem): WorkspaceSearchResult => ({
      key: `algorithm_problem:${problem.id}`,
      kind: "algorithm_problem",
      group: GROUP_LABELS.algorithm_problem,
      title: problem.title,
      excerpt: excerpt(problem.notes || problem.tags_json, query),
      meta: [
        algorithmProviderLabel(problem.provider_id),
        problem.external_problem_id ? `#${problem.external_problem_id}` : "",
        algorithmDifficultyLabel(problem.difficulty_band),
        algorithmEvidenceLabel(problem.evidence_status),
      ].filter(Boolean).join(" · "),
      href: `/practice/algorithms?problem=${problem.id}#algorithm-problem-${problem.id}`,
      training: null,
    })),
  ];
}

function algorithmProviderLabel(value: string): string {
  if (value === "ascend") return "Ascend 原创";
  return getAlgorithmProviderDescriptor(value).label;
}

function algorithmDifficultyLabel(value: string): string {
  if (value === "foundation") return "基础";
  if (value === "standard") return "标准";
  if (value === "challenge") return "挑战";
  return "";
}

function algorithmEvidenceLabel(value: string): string {
  if (value === "guided_completed") return "引导完成";
  if (value === "independent_completed") return "独立完成";
  if (value === "delayed_stable") return "延迟稳定";
  if (value === "transfer_verified") return "迁移验证";
  if (value === "attempted") return "已有尝试";
  return "未开始";
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function titleFromText(value: string): string {
  const line = value.split(/\r?\n/, 1)[0].trim();
  return line.length > 42 ? `${line.slice(0, 42)}…` : line;
}

function excerpt(value: string, query: string, maxLength = 88): string {
  const plain = value.replace(/\s+/g, " ").trim();
  if (!plain) return "";
  const index = plain.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  const start = index > 24 ? index - 24 : 0;
  const sliced = plain.slice(start, start + maxLength);
  return `${start > 0 ? "…" : ""}${sliced}${start + maxLength < plain.length ? "…" : ""}`;
}
