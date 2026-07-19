import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { getSettings, type AppSettings } from "./settings";
import type { MockExamBreakdown } from "./mock-exams";

/**
 * per-workspace 数据导出（评审 P3#27）：把一个学习空间的全部数据聚合为
 * 机器可读的 JSON + 人可读的 Markdown 摘要。附件文件本身不在这里读取，
 * 只输出 zip 内路径与仓库存储键的映射，由 API 路由负责落盘读取与打包。
 */

export const WORKSPACE_EXPORT_SCHEMA = "ascend.workspace-export";
export const WORKSPACE_EXPORT_SCHEMA_VERSION = 1;

export type ExportedAsset = {
  id: number;
  day: string;
  original_name: string;
  mime_type: string;
  size: number;
  category: string;
  folder_path: string;
  note: string;
  created_at: string;
  subject_code: string | null;
  chapter_id: string | null;
  knowledge_point_ids: string[];
  /** zip 包内 assets/ 下的路径；文件在磁盘上缺失时由路由置为 null。 */
  export_path: string | null;
};

export type WorkspaceExportData = {
  schema: typeof WORKSPACE_EXPORT_SCHEMA;
  schema_version: number;
  exported_at: string;
  workspace: { display_name: string; created_at: string };
  settings: AppSettings;
  planner: {
    tasks: Array<{
      id: number;
      day: string;
      title: string;
      subject_code: string | null;
      done: number;
      done_at: string | null;
      sort_order: number;
      priority: number;
      estimated_minutes: number;
      scheduled_start: string | null;
      notes: string;
      created_at: string;
    }>;
    notes: Array<{ id: number; day: string; content: string; created_at: string }>;
    daily_entries: Array<{
      date: string;
      plan: string;
      diary: string;
      summary: string;
      blockers: string;
      tomorrow: string;
    }>;
  };
  knowledge: {
    subjects: Array<{ code: string; name: string; description: string; track: string }>;
    chapters: Array<{ id: string; subject_code: string; title: string; sort_order: number; parent_id: string | null }>;
    points: Array<{
      id: string;
      subject_code: string;
      submodule: string;
      tier: string;
      tier_name: string;
      title: string;
      chapter_id: string | null;
      parent_point_id: string | null;
      sort_order: number;
      exam: number;
      status: string;
      mastery: number;
      reviews: number;
      last_review: string | null;
      next_review: string | null;
      interval_step: number;
      lapse_count: number;
      last_score: number | null;
      prompt: string;
      answer: string;
      created_at: string;
    }>;
  };
  reviews: {
    events: Array<{ id: number; day: string; knowledge_point_id: string | null; score: number; note: string; created_at: string }>;
    recovery_events: Array<{ id: number; day: string; moved_count: number; horizon_days: number; created_at: string }>;
    study_sessions: Array<{
      id: number;
      day: string;
      subject_code: string | null;
      knowledge_point_id: string | null;
      title: string;
      duration_minutes: number;
      output: string;
      created_at: string;
    }>;
  };
  mistakes: Array<{
    id: number;
    day: string;
    subject_code: string | null;
    knowledge_point_id: string | null;
    title: string;
    cause: string;
    cause_category: string;
    next_review: string | null;
    graduated: number;
    pass_count: number;
    last_pass_day: string | null;
    created_at: string;
  }>;
  mock_exams: Array<{
    id: number;
    day: string;
    name: string;
    subject_code: string | null;
    score: number;
    max_score: number;
    duration_minutes: number;
    breakdown: MockExamBreakdown[];
    notes: string;
    created_at: string;
  }>;
  library: {
    folders: Array<{ path: string; name: string; parent_path: string }>;
    assets: ExportedAsset[];
  };
};

export type WorkspaceExportBundle = {
  data: WorkspaceExportData;
  markdown: string;
  /** 待打包的附件文件：zip 内路径 → 工作区存储键（交给 resolveWorkspaceAssetPath 解析）。 */
  assetFiles: Array<{ zipPath: string; storageKey: string }>;
};

/** zip 内附件文件名：id 前缀保证唯一，名称本身仅去掉路径与非法字符。 */
function assetZipPath(id: number, originalName: string): string {
  const base = originalName
    .replaceAll("\\", "/")
    .split("/")
    .pop()!
    .replace(/[<>:"|?*\u0000-\u001F]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return `assets/${id}-${base || "file"}`;
}

export function buildWorkspaceExport(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { exportedAt: string },
): WorkspaceExportBundle {
  const workspace = db.prepare("SELECT display_name, created_at FROM workspaces WHERE id = ?")
    .get(scope.workspaceId) as { display_name: string; created_at: string } | undefined;
  if (!workspace) throw new Error("学习空间不存在");

  const settings = getSettings(db, scope);

  const tasks = db.prepare(`
    SELECT id, day, title, subject_code, done, done_at, sort_order, priority,
           estimated_minutes, scheduled_start, notes, created_at
    FROM day_tasks WHERE workspace_id = ? ORDER BY day ASC, sort_order ASC, id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["planner"]["tasks"];

  const notes = db.prepare(`
    SELECT id, day, content, created_at FROM day_notes WHERE workspace_id = ? ORDER BY day ASC, id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["planner"]["notes"];

  // daily_entries 会被 ensureDay 大量创建为空行，只导出真正写过内容的日子。
  const dailyEntries = (db.prepare(`
    SELECT date, plan, diary, summary, blockers, tomorrow FROM daily_entries
    WHERE workspace_id = ?
      AND (TRIM(plan) != '' OR TRIM(diary) != '' OR TRIM(summary) != '' OR TRIM(blockers) != '' OR TRIM(tomorrow) != '')
    ORDER BY date ASC
  `).all(scope.workspaceId)) as WorkspaceExportData["planner"]["daily_entries"];

  const subjects = db.prepare(`
    SELECT code, name, description, track FROM subjects WHERE workspace_id = ? ORDER BY code ASC
  `).all(scope.workspaceId) as WorkspaceExportData["knowledge"]["subjects"];

  const chapters = db.prepare(`
    SELECT id, subject_code, title, sort_order, parent_id FROM subject_chapters
    WHERE workspace_id = ? ORDER BY subject_code ASC, sort_order ASC, id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["knowledge"]["chapters"];

  const points = db.prepare(`
    SELECT id, subject_code, submodule, tier, tier_name, title, chapter_id, parent_point_id,
           sort_order, exam, status, mastery, reviews, last_review, next_review,
           interval_step, lapse_count, last_score, prompt, answer, created_at
    FROM knowledge_points WHERE workspace_id = ? ORDER BY subject_code ASC, sort_order ASC, id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["knowledge"]["points"];

  const reviewEvents = db.prepare(`
    SELECT id, day, knowledge_point_id, score, note, created_at
    FROM review_events WHERE workspace_id = ? ORDER BY day ASC, id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["reviews"]["events"];

  const recoveryEvents = db.prepare(`
    SELECT id, day, moved_count, horizon_days, created_at
    FROM review_recovery_events WHERE workspace_id = ? ORDER BY day ASC, id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["reviews"]["recovery_events"];

  const studySessions = db.prepare(`
    SELECT id, day, subject_code, knowledge_point_id, title, duration_minutes, output, created_at
    FROM study_sessions WHERE workspace_id = ? ORDER BY day ASC, id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["reviews"]["study_sessions"];

  const mistakes = db.prepare(`
    SELECT id, day, subject_code, knowledge_point_id, title, cause, cause_category,
           next_review, graduated, pass_count, last_pass_day, created_at
    FROM mistakes WHERE workspace_id = ? ORDER BY day ASC, id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["mistakes"];

  const mockExams = (db.prepare(`
    SELECT id, day, name, subject_code, score, max_score, duration_minutes, breakdown_json, notes, created_at
    FROM mock_exams WHERE workspace_id = ? ORDER BY day ASC, id ASC
  `).all(scope.workspaceId) as Array<
    Omit<WorkspaceExportData["mock_exams"][number], "breakdown"> & { breakdown_json: string }
  >).map(({ breakdown_json, ...exam }) => {
    let breakdown: MockExamBreakdown[] = [];
    try {
      const parsed = JSON.parse(breakdown_json || "[]");
      if (Array.isArray(parsed)) breakdown = parsed;
    } catch {
      breakdown = [];
    }
    return { ...exam, breakdown };
  });

  const folders = db.prepare(`
    SELECT path, name, parent_path FROM folders WHERE workspace_id = ? ORDER BY path ASC
  `).all(scope.workspaceId) as WorkspaceExportData["library"]["folders"];

  const assetRows = db.prepare(`
    SELECT
      a.id, a.day, a.original_name, a.relative_path, a.mime_type, a.size, a.category,
      a.folder_path, a.note, a.created_at,
      MAX(l.subject_code) AS subject_code,
      MAX(l.chapter_id) AS chapter_id,
      COALESCE(GROUP_CONCAT(DISTINCT l.knowledge_point_id), '') AS knowledge_point_ids
    FROM assets a
    LEFT JOIN asset_links l ON l.asset_id = a.id AND l.workspace_id = a.workspace_id
    WHERE a.workspace_id = ?
    GROUP BY a.id
    ORDER BY a.id ASC
  `).all(scope.workspaceId) as Array<
    Omit<ExportedAsset, "knowledge_point_ids" | "export_path"> & { relative_path: string; knowledge_point_ids: string }
  >;

  const assetFiles: WorkspaceExportBundle["assetFiles"] = [];
  const assets: ExportedAsset[] = assetRows.map(({ relative_path, ...row }) => {
    const zipPath = assetZipPath(row.id, row.original_name);
    assetFiles.push({ zipPath, storageKey: relative_path });
    return {
      ...row,
      knowledge_point_ids: row.knowledge_point_ids ? row.knowledge_point_ids.split(",").filter(Boolean) : [],
      export_path: zipPath,
    };
  });

  const data: WorkspaceExportData = {
    schema: WORKSPACE_EXPORT_SCHEMA,
    schema_version: WORKSPACE_EXPORT_SCHEMA_VERSION,
    exported_at: input.exportedAt,
    workspace: { display_name: workspace.display_name, created_at: workspace.created_at },
    settings,
    planner: { tasks, notes, daily_entries: dailyEntries },
    knowledge: { subjects, chapters, points },
    reviews: { events: reviewEvents, recovery_events: recoveryEvents, study_sessions: studySessions },
    mistakes,
    mock_exams: mockExams,
    library: { folders, assets },
  };

  return { data, markdown: renderSummaryMarkdown(data), assetFiles };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** 人可读摘要：让用户不打开 JSON 也能确认「我的东西都在」。 */
function renderSummaryMarkdown(data: WorkspaceExportData): string {
  const lines: string[] = [];
  lines.push("# 登峰 · 学习空间数据导出");
  lines.push("");
  lines.push(`- 学习空间：${data.workspace.display_name || "（未命名）"}`);
  lines.push(`- 导出时间：${data.exported_at}`);
  lines.push(`- 数据格式：\`${data.schema}\` v${data.schema_version}（完整数据见 \`data.json\`，附件在 \`assets/\` 目录）`);
  if (data.settings.learningGoal) lines.push(`- 学习目标：${data.settings.learningGoal}`);
  lines.push("");

  lines.push("## 数据总览");
  lines.push("");
  lines.push("| 数据 | 数量 |");
  lines.push("| --- | --- |");
  lines.push(`| 任务 | ${data.planner.tasks.length}（已完成 ${data.planner.tasks.filter((task) => task.done).length}） |`);
  lines.push(`| 随笔 | ${data.planner.notes.length} |`);
  lines.push(`| 每日记录 | ${data.planner.daily_entries.length} |`);
  lines.push(`| 科目 | ${data.knowledge.subjects.length} |`);
  lines.push(`| 章节 | ${data.knowledge.chapters.length} |`);
  lines.push(`| 知识点 | ${data.knowledge.points.length} |`);
  lines.push(`| 复习记录 | ${data.reviews.events.length} |`);
  lines.push(`| 学习记录 | ${data.reviews.study_sessions.length} |`);
  lines.push(`| 错题 | ${data.mistakes.length}（已出师 ${data.mistakes.filter((mistake) => mistake.graduated).length}） |`);
  lines.push(`| 模考 | ${data.mock_exams.length} |`);
  lines.push(`| 资料文件 | ${data.library.assets.length}（共 ${formatBytes(data.library.assets.reduce((total, asset) => total + asset.size, 0))}） |`);
  lines.push("");

  if (data.knowledge.subjects.length) {
    lines.push("## 知识树与掌握度");
    lines.push("");
    lines.push("| 科目 | 知识点 | 平均掌握度 | 已掌握（≥80） |");
    lines.push("| --- | --- | --- | --- |");
    for (const subject of data.knowledge.subjects) {
      const points = data.knowledge.points.filter((point) => point.subject_code === subject.code);
      const average = points.length
        ? Math.round(points.reduce((total, point) => total + point.mastery, 0) / points.length)
        : 0;
      const mastered = points.filter((point) => point.mastery >= 80).length;
      lines.push(`| ${subject.name}（${subject.code}） | ${points.length} | ${average}% | ${mastered} |`);
    }
    lines.push("");
  }

  const openMistakes = data.mistakes.filter((mistake) => !mistake.graduated);
  if (openMistakes.length) {
    lines.push("## 待攻克错题");
    lines.push("");
    for (const mistake of openMistakes.slice(0, 20)) {
      lines.push(`- [${mistake.day}] ${mistake.title}${mistake.cause ? `（${mistake.cause}）` : ""}`);
    }
    if (openMistakes.length > 20) lines.push(`- …… 其余 ${openMistakes.length - 20} 条见 data.json`);
    lines.push("");
  }

  if (data.mock_exams.length) {
    lines.push("## 模考成绩");
    lines.push("");
    lines.push("| 日期 | 名称 | 得分 |");
    lines.push("| --- | --- | --- |");
    for (const exam of data.mock_exams.slice(-10)) {
      lines.push(`| ${exam.day} | ${exam.name} | ${exam.score}/${exam.max_score} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
