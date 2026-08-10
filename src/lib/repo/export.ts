import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import type {
  CalendarEvent,
  PlannerCalendar,
  PlannerLabel,
  PlannerNotification,
  PlannerReminder,
  PlannerTask,
  TaskSeries,
  TaskList,
} from "../planner/types";
import { getSettings, type AppSettings } from "./settings";
import type { MockExamBreakdown } from "./mock-exams";
import { ensurePlannerDefaults } from "./planner-defaults";

/**
 * per-workspace 数据导出（评审 P3#27）：把一个学习空间的全部数据聚合为
 * 机器可读的 JSON + 人可读的 Markdown 摘要。附件文件本身不在这里读取，
 * 只输出 zip 内路径与仓库存储键的映射，由 API 路由负责落盘读取与打包。
 */

export const WORKSPACE_EXPORT_SCHEMA = "ascend.workspace-export";
export const WORKSPACE_EXPORT_SCHEMA_VERSION = 4;

export type ExportedLegacyTask = {
  id: number;
  day: string;
  title: string;
  subject_code: string | null;
  done: number;
  sort_order: number;
  created_at: string;
  done_at: string | null;
  priority: number;
  estimated_minutes: number;
  scheduled_start: string | null;
  notes: string;
  knowledge_point_id: string | null;
  activity_type: string;
  completion_criteria: string;
  source_type: string;
  source_id: string;
  actual_minutes: number | null;
  completion_output: string;
  planned_verification_method: string;
  verification_method: string;
  verification_result: string;
  verification_outcome: string;
};

export type ExportedLearningTaskLink = {
  task_id: string;
  knowledge_point_id: string | null;
  activity_type: string;
  completion_criteria: string;
  planned_verification_method: string;
  source_type: string;
  source_id: string;
  created_at: string;
  updated_at: string;
  version: number;
};

export type ExportedLearningEvidence = {
  id: string;
  task_id: string | null;
  completion_cycle: number;
  day: string;
  knowledge_point_id: string | null;
  activity_type: string;
  actual_minutes: number | null;
  output: string;
  outcome: string;
  difficulty: string;
  verification_method: string;
  verification_result: string;
  verification_outcome: string;
  confidence: number | null;
  source_type: string;
  source_id: string;
  idempotency_key: string;
  corrected_by: string | null;
  voided_at: string | null;
  void_reason: string;
  created_at: string;
};

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
    schema_version: number;
    lists: TaskList[];
    tasks: PlannerTask[];
    calendars: PlannerCalendar[];
    events: CalendarEvent[];
    labels: PlannerLabel[];
    task_labels: Array<{ task_id: string; label_id: string }>;
    event_labels: Array<{ event_id: string; label_id: string }>;
    task_series: TaskSeries[];
    reminders: PlannerReminder[];
    notifications: PlannerNotification[];
    notes: Array<{ id: number; day: string; content: string; created_at: string }>;
    daily_entries: Array<{
      date: string;
      plan: string;
      diary: string;
      summary: string;
      blockers: string;
      tomorrow: string;
    }>;
    legacy_tasks: ExportedLegacyTask[];
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
      self_confidence: number | null;
      created_at: string;
    }>;
  };
  reviews: {
    events: Array<{
      id: number;
      day: string;
      knowledge_point_id: string | null;
      score: number;
      note: string;
      operation_id: string | null;
      event_type: string;
      attempt_mode: string;
      attempt_text: string;
      attempt_duration_seconds: number;
      pre_confidence: number | null;
      created_at: string;
    }>;
    recovery_events: Array<{ id: number; day: string; moved_count: number; horizon_days: number; created_at: string }>;
    study_sessions: Array<{
      id: number;
      day: string;
      subject_code: string | null;
      knowledge_point_id: string | null;
      task_id: number | null;
      title: string;
      duration_minutes: number;
      output: string;
      source_type: string;
      source_id: string;
      created_at: string;
    }>;
  };
  learning: {
    task_links: ExportedLearningTaskLink[];
    evidence: ExportedLearningEvidence[];
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
    scope_label: string;
    difficulty: string;
    diagnosis_status: string;
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

export type WorkspaceRestoreResult = {
  schemaVersion: number;
  plannerTasks: number;
  legacyTasks: number;
  learningTaskLinks: number;
  learningEvidence: number;
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

  const lists = db.prepare(`
    SELECT id, workspace_id, name, color_token, icon, sort_order, is_inbox,
           archived_at, created_at, updated_at
    FROM task_lists WHERE workspace_id = ? ORDER BY sort_order ASC, id ASC
  `).all(scope.workspaceId) as TaskList[];
  const tasks = db.prepare(`
    SELECT id, workspace_id, list_id, parent_task_id, depth, title, notes, subject_code,
           status, priority, due_date, due_at, due_timezone,
           scheduled_start_at, scheduled_end_at, scheduled_timezone, scheduled_all_day,
           estimated_minutes, series_id, occurrence_key, sort_order, deleted_at,
           completed_at, canceled_at, version, legacy_day_task_id, created_at, updated_at
    FROM planner_tasks WHERE workspace_id = ? ORDER BY created_at ASC, sort_order ASC, id ASC
  `).all(scope.workspaceId) as PlannerTask[];
  const calendars = db.prepare(`
    SELECT id, workspace_id, name, color_token, is_default, visibility,
           sort_order, archived_at, created_at, updated_at
    FROM planner_calendars WHERE workspace_id = ? ORDER BY sort_order ASC, id ASC
  `).all(scope.workspaceId) as PlannerCalendar[];
  const events = db.prepare(`
    SELECT id, workspace_id, calendar_id, title, description, location, url, subject_code,
           kind, busy_status, start_at, end_at, timezone, start_date, end_date_exclusive,
           all_day, recurrence_rule, recurrence_until, recurring_event_id, original_start_at,
           exception_kind, migration_key, deleted_at, version, created_at, updated_at
    FROM calendar_events WHERE workspace_id = ?
    ORDER BY COALESCE(start_date, start_at) ASC, id ASC
  `).all(scope.workspaceId) as CalendarEvent[];
  const labels = db.prepare(`
    SELECT id, workspace_id, name, color_token, created_at
    FROM planner_labels WHERE workspace_id = ? ORDER BY name ASC, id ASC
  `).all(scope.workspaceId) as PlannerLabel[];
  const taskLabels = db.prepare(`
    SELECT task_id, label_id FROM planner_task_labels
    WHERE workspace_id = ? ORDER BY task_id ASC, label_id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["planner"]["task_labels"];
  const eventLabels = db.prepare(`
    SELECT event_id, label_id FROM planner_event_labels
    WHERE workspace_id = ? ORDER BY event_id ASC, label_id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["planner"]["event_labels"];
  const taskSeries = db.prepare(`
    SELECT id, workspace_id, rrule, timezone, generation_mode, template_json,
           next_occurrence_at, active, generated_count, idempotency_key, created_at, updated_at
    FROM task_series WHERE workspace_id = ? ORDER BY created_at ASC, id ASC
  `).all(scope.workspaceId) as TaskSeries[];
  const reminders = db.prepare(`
    SELECT id, workspace_id, entity_type, entity_id, anchor, offset_minutes, exact_at,
           channel, status, next_attempt_at, attempt_count, leased_until, lease_owner,
           sent_at, last_error, idempotency_key, created_at, updated_at
    FROM planner_reminders WHERE workspace_id = ? ORDER BY created_at ASC, id ASC
  `).all(scope.workspaceId) as PlannerReminder[];
  const notifications = db.prepare(`
    SELECT id, workspace_id, reminder_id, title, body, target_path, read_at, created_at
    FROM planner_notifications WHERE workspace_id = ? ORDER BY created_at ASC, id ASC
  `).all(scope.workspaceId) as PlannerNotification[];

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

  const legacyTasks = db.prepare(`
    SELECT id, day, title, subject_code, done, sort_order, created_at, done_at,
           priority, estimated_minutes, scheduled_start, notes, knowledge_point_id,
           activity_type, completion_criteria, source_type, source_id, actual_minutes,
           completion_output, planned_verification_method, verification_method,
           verification_result, verification_outcome
    FROM day_tasks WHERE workspace_id = ? ORDER BY day ASC, sort_order ASC, id ASC
  `).all(scope.workspaceId) as ExportedLegacyTask[];

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
           interval_step, lapse_count, last_score, prompt, answer, self_confidence, created_at
    FROM knowledge_points WHERE workspace_id = ? ORDER BY subject_code ASC, sort_order ASC, id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["knowledge"]["points"];

  const reviewEvents = db.prepare(`
    SELECT id, day, knowledge_point_id, score, note, operation_id, event_type,
           attempt_mode, attempt_text, attempt_duration_seconds, pre_confidence, created_at
    FROM review_events WHERE workspace_id = ? ORDER BY day ASC, id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["reviews"]["events"];

  const recoveryEvents = db.prepare(`
    SELECT id, day, moved_count, horizon_days, created_at
    FROM review_recovery_events WHERE workspace_id = ? ORDER BY day ASC, id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["reviews"]["recovery_events"];

  const studySessions = db.prepare(`
    SELECT id, day, subject_code, knowledge_point_id, task_id, title, duration_minutes,
           output, source_type, source_id, created_at
    FROM study_sessions WHERE workspace_id = ? ORDER BY day ASC, id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["reviews"]["study_sessions"];

  const learningTaskLinks = db.prepare(`
    SELECT task_id, knowledge_point_id, activity_type, completion_criteria,
           planned_verification_method, source_type, source_id,
           created_at, updated_at, version
    FROM learning_task_links WHERE workspace_id = ? ORDER BY created_at ASC, task_id ASC
  `).all(scope.workspaceId) as ExportedLearningTaskLink[];

  const learningEvidence = db.prepare(`
    SELECT id, task_id, completion_cycle, day, knowledge_point_id, activity_type,
           actual_minutes, output, outcome, difficulty, verification_method,
           verification_result, verification_outcome, confidence, source_type, source_id,
           idempotency_key, corrected_by, voided_at, void_reason, created_at
    FROM learning_evidence WHERE workspace_id = ? ORDER BY created_at ASC, id ASC
  `).all(scope.workspaceId) as ExportedLearningEvidence[];

  const mistakes = db.prepare(`
    SELECT id, day, subject_code, knowledge_point_id, title, cause, cause_category,
           next_review, graduated, pass_count, last_pass_day, created_at
    FROM mistakes WHERE workspace_id = ? ORDER BY day ASC, id ASC
  `).all(scope.workspaceId) as WorkspaceExportData["mistakes"];

  const mockExams = (db.prepare(`
    SELECT id, day, name, subject_code, score, max_score, duration_minutes,
           scope_label, difficulty, diagnosis_status, breakdown_json, notes, created_at
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
    planner: {
      schema_version: 4,
      lists,
      tasks,
      calendars,
      events,
      labels,
      task_labels: taskLabels,
      event_labels: eventLabels,
      task_series: taskSeries,
      reminders,
      notifications,
      notes,
      daily_entries: dailyEntries,
      legacy_tasks: legacyTasks,
    },
    knowledge: { subjects, chapters, points },
    reviews: { events: reviewEvents, recovery_events: recoveryEvents, study_sessions: studySessions },
    learning: { task_links: learningTaskLinks, evidence: learningEvidence },
    mistakes,
    mock_exams: mockExams,
    library: { folders, assets },
  };

  return { data, markdown: renderSummaryMarkdown(data), assetFiles };
}

/**
 * Replaces one workspace from a logical export. The authenticated scope is the
 * only accepted owner: workspace_id values embedded in Planner rows are ignored.
 * New v4 collections are optional so v1-v3 archives remain restorable.
 */
export function restoreWorkspaceExport(
  db: Database.Database,
  scope: WorkspaceScope,
  input: unknown,
): WorkspaceRestoreResult {
  const data = validateRestoreEnvelope(input);
  const planner = data.planner;
  const knowledge = data.knowledge;
  const reviews = data.reviews;
  const learning = data.learning ?? { task_links: [], evidence: [] };
  const legacyTasks = planner.legacy_tasks ?? [];

  return db.transaction(() => {
    const workspace = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(scope.workspaceId);
    if (!workspace) throw new Error("学习空间不存在");
    assertRestoreIdsAvailable(db, scope, data);
    clearWorkspaceForRestore(db, scope);

    db.prepare(`
      UPDATE workspaces
      SET display_name = ?, onboarding_completed = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.workspace.display_name || "",
      data.settings.onboardingCompleted ? 1 : 0,
      scope.workspaceId,
    );
    restoreSettings(db, scope, data.settings);

    const insertSubject = db.prepare(`
      INSERT INTO subjects (workspace_id, code, name, description, track)
      VALUES (@workspaceId, @code, @name, @description, @track)
    `);
    for (const row of knowledge.subjects) insertSubject.run({ workspaceId: scope.workspaceId, ...row });

    const insertChapter = db.prepare(`
      INSERT INTO subject_chapters
        (workspace_id, id, subject_code, title, sort_order, parent_id, created_at, updated_at)
      VALUES
        (@workspaceId, @id, @subjectCode, @title, @sortOrder, @parentId, @createdAt, @updatedAt)
    `);
    for (const row of knowledge.chapters) {
      insertChapter.run({
        workspaceId: scope.workspaceId,
        id: row.id,
        subjectCode: row.subject_code,
        title: row.title,
        sortOrder: row.sort_order,
        parentId: row.parent_id ?? null,
        createdAt: restoreText((row as { created_at?: string }).created_at, data.exported_at),
        updatedAt: restoreText((row as { updated_at?: string }).updated_at, data.exported_at),
      });
    }
    const subjectNames = new Map(knowledge.subjects.map((row) => [row.code, row.name]));
    const insertPoint = db.prepare(`
      INSERT INTO knowledge_points
        (workspace_id, id, subject_code, subject_name, submodule, tier, tier_name,
         title, exam, status, mastery, reviews, last_review, next_review, created_at,
         chapter_id, sort_order, parent_point_id, prompt, answer, interval_step,
         lapse_count, last_score, self_confidence)
      VALUES
        (@workspaceId, @id, @subjectCode, @subjectName, @submodule, @tier, @tierName,
         @title, @exam, @status, @mastery, @reviews, @lastReview, @nextReview, @createdAt,
         @chapterId, @sortOrder, @parentPointId, @prompt, @answer, @intervalStep,
         @lapseCount, @lastScore, @selfConfidence)
    `);
    for (const row of knowledge.points) {
      insertPoint.run({
        workspaceId: scope.workspaceId,
        id: row.id,
        subjectCode: row.subject_code,
        subjectName: subjectNames.get(row.subject_code) ?? row.subject_code,
        submodule: row.submodule,
        tier: row.tier,
        tierName: row.tier_name,
        title: row.title,
        exam: row.exam,
        status: row.status,
        mastery: row.mastery,
        reviews: row.reviews,
        lastReview: row.last_review,
        nextReview: row.next_review,
        createdAt: row.created_at,
        chapterId: row.chapter_id,
        sortOrder: row.sort_order,
        parentPointId: row.parent_point_id,
        prompt: row.prompt,
        answer: row.answer,
        intervalStep: row.interval_step,
        lapseCount: row.lapse_count,
        lastScore: row.last_score,
        selfConfidence: row.self_confidence ?? null,
      });
    }

    restoreDailyEntries(db, scope, planner.daily_entries);
    restoreLegacyTasks(db, scope, legacyTasks);
    restoreDayNotes(db, scope, planner.notes);
    restorePlanner(db, scope, planner);
    restoreLearning(db, scope, learning.task_links ?? [], learning.evidence ?? []);
    restoreReviews(db, scope, reviews);
    restoreMistakes(db, scope, data.mistakes);
    restoreMockExams(db, scope, data.mock_exams);
    restoreLibraryMetadata(db, scope, data.library);

    if (!planner.lists.length && !planner.calendars.length) ensurePlannerDefaults(db, scope);
    return {
      schemaVersion: data.schema_version,
      plannerTasks: planner.tasks.length,
      legacyTasks: legacyTasks.length,
      learningTaskLinks: learning.task_links?.length ?? 0,
      learningEvidence: learning.evidence?.length ?? 0,
    };
  })();
}

function validateRestoreEnvelope(input: unknown): WorkspaceExportData {
  if (!input || typeof input !== "object") throw new Error("恢复数据必须是对象");
  const data = input as Partial<WorkspaceExportData>;
  if (data.schema !== WORKSPACE_EXPORT_SCHEMA) throw new Error("恢复数据 schema 无效");
  const version = Number(data.schema_version);
  if (!Number.isInteger(version) || version < 1 || version > WORKSPACE_EXPORT_SCHEMA_VERSION) {
    throw new Error(`不支持的恢复数据版本: ${String(data.schema_version)}`);
  }
  for (const key of ["workspace", "settings", "planner", "knowledge", "reviews", "library"] as const) {
    if (!data[key] || typeof data[key] !== "object") throw new Error(`恢复数据缺少 ${key}`);
  }
  for (const [label, value] of [
    ["planner.lists", data.planner!.lists],
    ["planner.tasks", data.planner!.tasks],
    ["planner.calendars", data.planner!.calendars],
    ["planner.events", data.planner!.events],
    ["planner.labels", data.planner!.labels],
    ["planner.task_labels", data.planner!.task_labels],
    ["planner.event_labels", data.planner!.event_labels],
    ["planner.task_series", data.planner!.task_series],
    ["planner.reminders", data.planner!.reminders],
    ["planner.notifications", data.planner!.notifications],
    ["planner.notes", data.planner!.notes],
    ["planner.daily_entries", data.planner!.daily_entries],
    ["knowledge.subjects", data.knowledge!.subjects],
    ["knowledge.chapters", data.knowledge!.chapters],
    ["knowledge.points", data.knowledge!.points],
    ["reviews.events", data.reviews!.events],
    ["reviews.recovery_events", data.reviews!.recovery_events],
    ["reviews.study_sessions", data.reviews!.study_sessions],
    ["mistakes", data.mistakes],
    ["mock_exams", data.mock_exams],
    ["library.folders", data.library!.folders],
    ["library.assets", data.library!.assets],
  ] as Array<[string, unknown]>) {
    if (!Array.isArray(value)) throw new Error(`恢复数据缺少 ${label}`);
  }
  const planner = data.planner! as WorkspaceExportData["planner"] & { legacy_tasks?: ExportedLegacyTask[] };
  if (version >= 4 && !Array.isArray(planner.legacy_tasks)) throw new Error("v4 恢复数据缺少 planner.legacy_tasks");
  if (!Array.isArray(planner.legacy_tasks)) planner.legacy_tasks = [];
  const learning = data.learning as WorkspaceExportData["learning"] | undefined;
  if (version >= 4 && learning === undefined) throw new Error("v4 恢复数据缺少 learning");
  if (learning !== undefined && (!Array.isArray(learning.task_links) || !Array.isArray(learning.evidence))) {
    throw new Error("恢复数据 learning 结构无效");
  }
  return data as WorkspaceExportData;
}

function assertRestoreIdsAvailable(
  db: Database.Database,
  scope: WorkspaceScope,
  data: WorkspaceExportData,
): void {
  const checks: Array<[string, Array<string | number>]> = [
    ["planner_tasks", data.planner.tasks.map((row) => row.id)],
    ["knowledge_points", data.knowledge.points.map((row) => row.id)],
    ["day_tasks", (data.planner.legacy_tasks ?? []).map((row) => row.id)],
    ["learning_evidence", (data.learning?.evidence ?? []).map((row) => row.id)],
  ];
  for (const [table, ids] of checks) {
    const findOwner = db.prepare(`SELECT workspace_id FROM ${table} WHERE id = ?`);
    for (const id of ids) {
      const existing = findOwner.get(id) as { workspace_id: string } | undefined;
      if (existing && existing.workspace_id !== scope.workspaceId) {
        throw new Error(`恢复 ID 已属于其他学习空间: ${table}.${String(id)}`);
      }
    }
  }
  const taskIds = new Set(data.planner.tasks.map((row) => row.id));
  const listIds = new Set(data.planner.lists.map((row) => row.id));
  const calendarIds = new Set(data.planner.calendars.map((row) => row.id));
  const labelIds = new Set(data.planner.labels.map((row) => row.id));
  const legacyTaskIds = new Set((data.planner.legacy_tasks ?? []).map((row) => row.id));
  const pointIds = new Set(data.knowledge.points.map((row) => row.id));
  const evidenceIds = new Set((data.learning?.evidence ?? []).map((row) => row.id));
  const idempotencyKeys = new Set<string>();
  for (const task of data.planner.tasks) {
    if (!listIds.has(task.list_id)) throw new Error(`Planner 任务引用未知清单: ${task.list_id}`);
    if (task.parent_task_id && !taskIds.has(task.parent_task_id)) {
      throw new Error(`Planner 任务引用未知父任务: ${task.parent_task_id}`);
    }
    if (task.legacy_day_task_id !== null && task.legacy_day_task_id !== undefined && !legacyTaskIds.has(task.legacy_day_task_id)) {
      if (data.schema_version >= 4) throw new Error(`Planner 任务引用未知 legacy task: ${task.legacy_day_task_id}`);
    }
  }
  for (const event of data.planner.events) {
    if (!calendarIds.has(event.calendar_id)) throw new Error(`日历事件引用未知日历: ${event.calendar_id}`);
  }
  for (const relation of data.planner.task_labels) {
    if (!taskIds.has(relation.task_id) || !labelIds.has(relation.label_id)) throw new Error("Planner 任务标签关联无效");
  }
  for (const relation of data.planner.event_labels) {
    if (!data.planner.events.some((event) => event.id === relation.event_id) || !labelIds.has(relation.label_id)) {
      throw new Error("Planner 日历标签关联无效");
    }
  }
  for (const link of data.learning?.task_links ?? []) {
    if (!taskIds.has(link.task_id)) throw new Error(`学习任务关联引用未知任务: ${link.task_id}`);
    if (link.knowledge_point_id && !pointIds.has(link.knowledge_point_id)) {
      throw new Error(`学习任务关联引用未知知识点: ${link.knowledge_point_id}`);
    }
  }
  for (const evidence of data.learning?.evidence ?? []) {
    if (evidence.task_id && !taskIds.has(evidence.task_id)) {
      throw new Error(`学习证据引用未知任务: ${evidence.task_id}`);
    }
    if (evidence.knowledge_point_id && !pointIds.has(evidence.knowledge_point_id)) {
      throw new Error(`学习证据引用未知知识点: ${evidence.knowledge_point_id}`);
    }
    if (evidence.corrected_by && (!evidenceIds.has(evidence.corrected_by) || evidence.corrected_by === evidence.id)) {
      throw new Error(`学习证据纠正链无效: ${evidence.id}`);
    }
    if (idempotencyKeys.has(evidence.idempotency_key)) throw new Error("学习证据幂等键重复");
    idempotencyKeys.add(evidence.idempotency_key);
  }
  for (const session of data.reviews.study_sessions) {
    if (session.task_id !== null && session.task_id !== undefined && !legacyTaskIds.has(session.task_id)) {
      if (data.schema_version >= 4) throw new Error(`学习记录引用未知 legacy task: ${session.task_id}`);
    }
  }
  for (const asset of data.library.assets) {
    for (const pointId of asset.knowledge_point_ids) {
      if (!pointIds.has(pointId)) throw new Error(`资料引用未知知识点: ${pointId}`);
    }
  }
}

function clearWorkspaceForRestore(db: Database.Database, scope: WorkspaceScope): void {
  const workspaceId = scope.workspaceId;
  for (const table of [
    "learning_evidence",
    "learning_task_links",
    "planner_notifications",
    "planner_reminders",
    "planner_task_labels",
    "planner_event_labels",
    "calendar_events",
    "planner_labels",
    "study_sessions",
    "review_events",
    "review_recovery_events",
    "mistakes",
    "mock_exams",
    "day_notes",
    "day_tasks",
    "daily_entries",
    "drafts",
    "asset_links",
    "asset_tags",
    "asset_knowledge_tags",
    "assets",
    "knowledge_tags",
    "tags",
    "folders",
  ]) {
    db.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`).run(workspaceId);
  }
  for (const depth of [3, 2, 1, 0]) {
    db.prepare("DELETE FROM planner_tasks WHERE workspace_id = ? AND depth = ?").run(workspaceId, depth);
  }
  for (const table of ["task_series", "task_lists", "planner_calendars", "knowledge_points", "subject_chapters", "subjects", "app_settings"]) {
    db.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`).run(workspaceId);
  }
}

function restoreSettings(db: Database.Database, scope: WorkspaceScope, settings: AppSettings): void {
  const insert = db.prepare("INSERT INTO app_settings (workspace_id, key, value) VALUES (?, ?, ?)");
  const rows: Array<[string, string]> = [
    ["exam_countdowns", JSON.stringify(settings.examCountdowns ?? [])],
    ["daily_review_limit", String(settings.dailyReviewLimit ?? 12)],
    ["learning_goal", settings.learningGoal ?? ""],
    ["weekly_minutes", String(settings.weeklyMinutes ?? 300)],
    ["enabled_subject_codes", JSON.stringify(settings.enabledSubjectCodes ?? [])],
    ["module_prefs", JSON.stringify(settings.modulePrefs ?? [])],
  ];
  for (const [key, value] of rows) insert.run(scope.workspaceId, key, value);
}

function restoreDailyEntries(
  db: Database.Database,
  scope: WorkspaceScope,
  rows: WorkspaceExportData["planner"]["daily_entries"],
): void {
  const insert = db.prepare(`
    INSERT INTO daily_entries
      (workspace_id, date, plan, diary, summary, blockers, tomorrow)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) insert.run(
    scope.workspaceId,
    row.date,
    row.plan ?? "",
    row.diary ?? "",
    row.summary ?? "",
    row.blockers ?? "",
    row.tomorrow ?? "",
  );
}

function restoreLegacyTasks(
  db: Database.Database,
  scope: WorkspaceScope,
  rows: ExportedLegacyTask[],
): void {
  const insert = db.prepare(`
    INSERT INTO day_tasks
      (id, workspace_id, day, title, subject_code, done, sort_order, created_at, done_at,
       priority, estimated_minutes, scheduled_start, notes, knowledge_point_id,
       activity_type, completion_criteria, source_type, source_id, actual_minutes,
       completion_output, planned_verification_method, verification_method,
       verification_result, verification_outcome)
    VALUES
      (@id, @workspaceId, @day, @title, @subjectCode, @done, @sortOrder, @createdAt, @doneAt,
       @priority, @estimatedMinutes, @scheduledStart, @notes, @knowledgePointId,
       @activityType, @completionCriteria, @sourceType, @sourceId, @actualMinutes,
       @completionOutput, @plannedVerificationMethod, @verificationMethod,
       @verificationResult, @verificationOutcome)
  `);
  for (const row of rows) insert.run({
    id: row.id,
    workspaceId: scope.workspaceId,
    day: row.day,
    title: row.title,
    subjectCode: row.subject_code ?? null,
    done: row.done ?? 0,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    doneAt: row.done_at ?? null,
    priority: row.priority ?? 2,
    estimatedMinutes: row.estimated_minutes ?? 30,
    scheduledStart: row.scheduled_start ?? null,
    notes: row.notes ?? "",
    knowledgePointId: row.knowledge_point_id ?? null,
    activityType: row.activity_type ?? "unspecified",
    completionCriteria: row.completion_criteria ?? "",
    sourceType: row.source_type ?? "",
    sourceId: row.source_id ?? "",
    actualMinutes: row.actual_minutes ?? null,
    completionOutput: row.completion_output ?? "",
    plannedVerificationMethod: row.planned_verification_method ?? "",
    verificationMethod: row.verification_method ?? "",
    verificationResult: row.verification_result ?? "",
    verificationOutcome: row.verification_outcome ?? "",
  });
}

function restoreDayNotes(
  db: Database.Database,
  scope: WorkspaceScope,
  rows: WorkspaceExportData["planner"]["notes"],
): void {
  const insert = db.prepare(`
    INSERT INTO day_notes (id, workspace_id, day, content, created_at) VALUES (?, ?, ?, ?, ?)
  `);
  for (const row of rows) insert.run(row.id, scope.workspaceId, row.day, row.content, row.created_at);
}

function restorePlanner(
  db: Database.Database,
  scope: WorkspaceScope,
  planner: WorkspaceExportData["planner"],
): void {
  const insertList = db.prepare(`
    INSERT INTO task_lists
      (id, workspace_id, name, color_token, icon, sort_order, is_inbox,
       archived_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of planner.lists) insertList.run(
    row.id, scope.workspaceId, row.name, row.color_token, row.icon, row.sort_order,
    row.is_inbox, row.archived_at, row.created_at, row.updated_at,
  );
  const insertCalendar = db.prepare(`
    INSERT INTO planner_calendars
      (id, workspace_id, name, color_token, is_default, visibility,
       sort_order, archived_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of planner.calendars) insertCalendar.run(
    row.id, scope.workspaceId, row.name, row.color_token, row.is_default, row.visibility,
    row.sort_order, row.archived_at, row.created_at, row.updated_at,
  );
  const insertLabel = db.prepare(`
    INSERT INTO planner_labels (id, workspace_id, name, color_token, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const row of planner.labels) insertLabel.run(row.id, scope.workspaceId, row.name, row.color_token, row.created_at);
  const insertSeries = db.prepare(`
    INSERT INTO task_series
      (id, workspace_id, rrule, timezone, generation_mode, template_json,
       next_occurrence_at, active, generated_count, idempotency_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of planner.task_series) insertSeries.run(
    row.id, scope.workspaceId, row.rrule, row.timezone, row.generation_mode,
    row.template_json, row.next_occurrence_at, row.active, row.generated_count,
    row.idempotency_key, row.created_at, row.updated_at,
  );

  const insertTask = db.prepare(`
    INSERT INTO planner_tasks
      (id, workspace_id, list_id, parent_task_id, depth, title, notes, subject_code,
       status, priority, due_date, due_at, due_timezone, scheduled_start_at,
       scheduled_end_at, scheduled_timezone, scheduled_all_day, estimated_minutes,
       series_id, occurrence_key, sort_order, deleted_at, completed_at, canceled_at,
       version, legacy_day_task_id, created_at, updated_at)
    VALUES
      (@id, @workspaceId, @listId, @parentTaskId, @depth, @title, @notes, @subjectCode,
       @status, @priority, @dueDate, @dueAt, @dueTimezone, @scheduledStartAt,
       @scheduledEndAt, @scheduledTimezone, @scheduledAllDay, @estimatedMinutes,
       @seriesId, @occurrenceKey, @sortOrder, @deletedAt, @completedAt, @canceledAt,
       @version, @legacyDayTaskId, @createdAt, @updatedAt)
  `);
  for (const row of [...planner.tasks].sort((a, b) => a.depth - b.depth)) insertTask.run({
    id: row.id,
    workspaceId: scope.workspaceId,
    listId: row.list_id,
    parentTaskId: row.parent_task_id,
    depth: row.depth,
    title: row.title,
    notes: row.notes,
    subjectCode: row.subject_code,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    dueAt: row.due_at,
    dueTimezone: row.due_timezone,
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    scheduledTimezone: row.scheduled_timezone,
    scheduledAllDay: row.scheduled_all_day,
    estimatedMinutes: row.estimated_minutes,
    seriesId: row.series_id,
    occurrenceKey: row.occurrence_key,
    sortOrder: row.sort_order,
    deletedAt: row.deleted_at,
    completedAt: row.completed_at,
    canceledAt: row.canceled_at,
    version: row.version,
    legacyDayTaskId: row.legacy_day_task_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const insertEvent = db.prepare(`
    INSERT INTO calendar_events
      (id, workspace_id, calendar_id, title, description, location, url, subject_code,
       kind, busy_status, start_at, end_at, timezone, start_date, end_date_exclusive,
       all_day, recurrence_rule, recurrence_until, recurring_event_id, original_start_at,
       exception_kind, migration_key, deleted_at, version, created_at, updated_at)
    VALUES
      (@id, @workspaceId, @calendarId, @title, @description, @location, @url, @subjectCode,
       @kind, @busyStatus, @startAt, @endAt, @timezone, @startDate, @endDateExclusive,
       @allDay, @recurrenceRule, @recurrenceUntil, @recurringEventId, @originalStartAt,
       @exceptionKind, @migrationKey, @deletedAt, @version, @createdAt, @updatedAt)
  `);
  for (const row of [...planner.events].sort((a, b) => Number(Boolean(a.recurring_event_id)) - Number(Boolean(b.recurring_event_id)))) {
    insertEvent.run({
      id: row.id,
      workspaceId: scope.workspaceId,
      calendarId: row.calendar_id,
      title: row.title,
      description: row.description,
      location: row.location,
      url: row.url,
      subjectCode: row.subject_code,
      kind: row.kind,
      busyStatus: row.busy_status,
      startAt: row.start_at,
      endAt: row.end_at,
      timezone: row.timezone,
      startDate: row.start_date,
      endDateExclusive: row.end_date_exclusive,
      allDay: row.all_day,
      recurrenceRule: row.recurrence_rule,
      recurrenceUntil: row.recurrence_until,
      recurringEventId: row.recurring_event_id,
      originalStartAt: row.original_start_at,
      exceptionKind: row.exception_kind,
      migrationKey: row.migration_key,
      deletedAt: row.deleted_at,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  const insertTaskLabel = db.prepare(`
    INSERT INTO planner_task_labels (workspace_id, task_id, label_id) VALUES (?, ?, ?)
  `);
  for (const row of planner.task_labels) insertTaskLabel.run(scope.workspaceId, row.task_id, row.label_id);
  const insertEventLabel = db.prepare(`
    INSERT INTO planner_event_labels (workspace_id, event_id, label_id) VALUES (?, ?, ?)
  `);
  for (const row of planner.event_labels) insertEventLabel.run(scope.workspaceId, row.event_id, row.label_id);

  const insertReminder = db.prepare(`
    INSERT INTO planner_reminders
      (id, workspace_id, entity_type, entity_id, anchor, offset_minutes, exact_at,
       channel, status, next_attempt_at, attempt_count, leased_until, lease_owner,
       sent_at, last_error, idempotency_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of planner.reminders) insertReminder.run(
    row.id, scope.workspaceId, row.entity_type, row.entity_id, row.anchor,
    row.offset_minutes, row.exact_at, row.channel, row.status, row.next_attempt_at,
    row.attempt_count, row.leased_until, row.lease_owner, row.sent_at, row.last_error,
    row.idempotency_key, row.created_at, row.updated_at,
  );
  const insertNotification = db.prepare(`
    INSERT INTO planner_notifications
      (id, workspace_id, reminder_id, title, body, target_path, read_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of planner.notifications) insertNotification.run(
    row.id, scope.workspaceId, row.reminder_id, row.title, row.body,
    row.target_path, row.read_at, row.created_at,
  );
}

function restoreLearning(
  db: Database.Database,
  scope: WorkspaceScope,
  links: ExportedLearningTaskLink[],
  evidence: ExportedLearningEvidence[],
): void {
  const insertLink = db.prepare(`
    INSERT INTO learning_task_links
      (workspace_id, task_id, knowledge_point_id, activity_type, completion_criteria,
       planned_verification_method, source_type, source_id, created_at, updated_at, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of links) insertLink.run(
    scope.workspaceId, row.task_id, row.knowledge_point_id, row.activity_type,
    row.completion_criteria, row.planned_verification_method, row.source_type,
    row.source_id, row.created_at, row.updated_at, row.version,
  );
  const insertEvidence = db.prepare(`
    INSERT INTO learning_evidence
      (id, workspace_id, task_id, completion_cycle, day, knowledge_point_id,
       activity_type, actual_minutes, output, outcome, difficulty,
       verification_method, verification_result, verification_outcome, confidence,
       source_type, source_id, idempotency_key, corrected_by, voided_at,
       void_reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `);
  for (const row of evidence) insertEvidence.run(
    row.id, scope.workspaceId, row.task_id, row.completion_cycle, row.day,
    row.knowledge_point_id, row.activity_type, row.actual_minutes, row.output,
    row.outcome, row.difficulty, row.verification_method, row.verification_result,
    row.verification_outcome, row.confidence, row.source_type, row.source_id,
    row.idempotency_key, row.voided_at, row.void_reason ?? "", row.created_at,
  );
  const setCorrection = db.prepare(`
    UPDATE learning_evidence SET corrected_by = ? WHERE workspace_id = ? AND id = ?
  `);
  for (const row of evidence) {
    if (row.corrected_by) setCorrection.run(row.corrected_by, scope.workspaceId, row.id);
  }
}

function restoreReviews(
  db: Database.Database,
  scope: WorkspaceScope,
  reviews: WorkspaceExportData["reviews"],
): void {
  const insertReview = db.prepare(`
    INSERT INTO review_events
      (id, workspace_id, day, knowledge_point_id, score, note, operation_id,
       event_type, attempt_mode, attempt_text, attempt_duration_seconds,
       pre_confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of reviews.events) insertReview.run(
    row.id, scope.workspaceId, row.day, row.knowledge_point_id, row.score, row.note,
    row.operation_id ?? null, row.event_type ?? "point_review", row.attempt_mode ?? "unknown",
    row.attempt_text ?? "", row.attempt_duration_seconds ?? 0, row.pre_confidence ?? null,
    row.created_at,
  );
  const insertRecovery = db.prepare(`
    INSERT INTO review_recovery_events
      (id, workspace_id, day, moved_count, horizon_days, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const row of reviews.recovery_events) insertRecovery.run(
    row.id, scope.workspaceId, row.day, row.moved_count, row.horizon_days, row.created_at,
  );
  const insertSession = db.prepare(`
    INSERT INTO study_sessions
      (id, workspace_id, day, subject_code, knowledge_point_id, task_id, title,
       duration_minutes, output, source_type, source_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of reviews.study_sessions) insertSession.run(
    row.id, scope.workspaceId, row.day, row.subject_code, row.knowledge_point_id,
    row.task_id ?? null, row.title, row.duration_minutes, row.output,
    row.source_type ?? "", row.source_id ?? "", row.created_at,
  );
}

function restoreMistakes(
  db: Database.Database,
  scope: WorkspaceScope,
  rows: WorkspaceExportData["mistakes"],
): void {
  const insert = db.prepare(`
    INSERT INTO mistakes
      (id, workspace_id, day, subject_code, knowledge_point_id, title, cause,
       cause_category, next_review, graduated, pass_count, last_pass_day, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) insert.run(
    row.id, scope.workspaceId, row.day, row.subject_code, row.knowledge_point_id,
    row.title, row.cause, row.cause_category, row.next_review, row.graduated,
    row.pass_count, row.last_pass_day, row.created_at,
  );
}

function restoreMockExams(
  db: Database.Database,
  scope: WorkspaceScope,
  rows: WorkspaceExportData["mock_exams"],
): void {
  const insert = db.prepare(`
    INSERT INTO mock_exams
      (id, workspace_id, day, name, subject_code, score, max_score, duration_minutes,
       scope_label, difficulty, diagnosis_status, breakdown_json, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) insert.run(
    row.id, scope.workspaceId, row.day, row.name, row.subject_code, row.score,
    row.max_score, row.duration_minutes, row.scope_label ?? "", row.difficulty ?? "",
    row.diagnosis_status ?? "legacy", JSON.stringify(row.breakdown ?? []), row.notes,
    row.created_at,
  );
}

function restoreLibraryMetadata(
  db: Database.Database,
  scope: WorkspaceScope,
  library: WorkspaceExportData["library"],
): void {
  const insertFolder = db.prepare(`
    INSERT INTO folders (workspace_id, path, name, parent_path) VALUES (?, ?, ?, ?)
  `);
  for (const row of library.folders) insertFolder.run(scope.workspaceId, row.path, row.name, row.parent_path);
  const insertAsset = db.prepare(`
    INSERT INTO assets
      (id, workspace_id, day, original_name, safe_name, relative_path, mime_type,
       size, category, folder_path, status, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '待整理', ?, ?)
  `);
  const insertLink = db.prepare(`
    INSERT INTO asset_links
      (workspace_id, asset_id, subject_code, chapter_id, knowledge_point_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const row of library.assets) {
    const safeName = restoreSafeName(row.original_name);
    const relativePath = `${encodeURIComponent(scope.workspaceId)}/restored/${row.id}/${safeName}`;
    insertAsset.run(
      row.id, scope.workspaceId, row.day, row.original_name, safeName, relativePath,
      row.mime_type, row.size, row.category, row.folder_path, row.note, row.created_at,
    );
    const pointIds = row.knowledge_point_ids.length ? row.knowledge_point_ids : [null];
    for (const pointId of pointIds) {
      if (row.subject_code || row.chapter_id || pointId) {
        insertLink.run(scope.workspaceId, row.id, row.subject_code, row.chapter_id, pointId);
      }
    }
  }
}

function restoreSafeName(value: string): string {
  return value.replaceAll("\\", "/").split("/").pop()?.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
}

function restoreText(value: string | undefined, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
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
  lines.push(`| 任务 | ${data.planner.tasks.length}（已完成 ${data.planner.tasks.filter((task) => task.status === "completed").length}） |`);
  lines.push(`| 日历事件 | ${data.planner.events.length} |`);
  lines.push(`| 随笔 | ${data.planner.notes.length} |`);
  lines.push(`| 每日记录 | ${data.planner.daily_entries.length} |`);
  lines.push(`| 科目 | ${data.knowledge.subjects.length} |`);
  lines.push(`| 章节 | ${data.knowledge.chapters.length} |`);
  lines.push(`| 知识点 | ${data.knowledge.points.length} |`);
  lines.push(`| 复习记录 | ${data.reviews.events.length} |`);
  lines.push(`| 学习记录 | ${data.reviews.study_sessions.length} |`);
  lines.push(`| 学习证据 | ${data.learning.evidence.length} |`);
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
