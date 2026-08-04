import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey, shiftDateKey, todayKey } from "../dates";
import { addMinutesToInstant, localDateTimeToUtc } from "../planner/time";
import { ensureDay } from "./days";
import { ensurePlannerDefaults, plannerDefaultId } from "./planner-defaults";

export type DayTask = {
  id: number;
  day: string;
  title: string;
  subject_code: string | null;
  done: number;
  sort_order: number;
  priority: 1 | 2 | 3;
  estimated_minutes: number;
  scheduled_start: string | null;
  notes: string;
  knowledge_point_id: string | null;
  activity_type: TaskActivityType;
  completion_criteria: string;
  source_type: string;
  source_id: string;
  actual_minutes: number | null;
  completion_output: string;
  planned_verification_method: string;
  verification_method: string;
  verification_result: string;
  verification_outcome: TaskVerificationOutcome;
};

export type TaskActivityType =
  | "unspecified"
  | "study"
  | "practice"
  | "recall"
  | "review"
  | "mock"
  | "mixed";

export type TaskVerificationOutcome = "" | "improved" | "unchanged" | "regressed" | "unknown";

export type TaskCompletionEvidenceInput = {
  actualMinutes?: number | null;
  completionOutput?: string;
  verificationMethod?: string;
  verificationResult?: string;
  verificationOutcome?: TaskVerificationOutcome;
  recordAsStudy?: boolean;
  scheduleRetestAfterDays?: number;
};

const TASK_SELECT = `
  id, day, title, subject_code, done, sort_order,
  priority, estimated_minutes, scheduled_start, notes,
  knowledge_point_id, activity_type, completion_criteria, source_type, source_id,
  actual_minutes, completion_output, planned_verification_method,
  verification_method, verification_result, verification_outcome
`;

/**
 * 合并线双写镜像（2026-08）：生产库以本地功能线为准，day_tasks 保持可写；
 * 同时把每条 legacy 写镜像到 planner_tasks（legacy_day_task_id 关联），
 * 让 v2 视图（/tasks、导出、MCP）看到同一份数据。反向（v2 → legacy）不同步，
 * 属已知限制，待新 UI 全面切换 PlannerTask 后消除。
 */
function mirrorDayTaskToPlanner(db: Database.Database, scope: WorkspaceScope, dayTaskId: number): void {
  const task = db.prepare(`
    SELECT id, day, title, subject_code, done, sort_order, created_at, done_at,
           priority, estimated_minutes, scheduled_start, notes
    FROM day_tasks WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, dayTaskId) as {
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
  } | undefined;
  if (!task || !tableExists(db, "planner_tasks")) return;
  ensurePlannerDefaults(db, scope);
  const timezone = (db.prepare("SELECT COALESCE(timezone, 'Asia/Shanghai') AS timezone FROM workspaces WHERE id = ?")
    .get(scope.workspaceId) as { timezone: string } | undefined)?.timezone ?? "Asia/Shanghai";
  const scheduledStartAt = task.scheduled_start
    ? localDateTimeToUtc({ date: task.day, time: task.scheduled_start, timeZone: timezone })
    : null;
  db.prepare(`
    INSERT INTO planner_tasks
      (id, workspace_id, list_id, title, notes, subject_code, status, priority,
       due_date, scheduled_start_at, scheduled_end_at, scheduled_timezone,
       estimated_minutes, sort_order, completed_at, version, legacy_day_task_id,
       created_at, updated_at)
    VALUES
      (@plannerId, @workspaceId, @listId, @title, @notes, @subjectCode, @status, @priority,
       @dueDate, @scheduledStartAt, @scheduledEndAt, @scheduledTimezone,
       @estimatedMinutes, @sortOrder, @completedAt, 1, @legacyId, @createdAt, @updatedAt)
    ON CONFLICT(workspace_id, legacy_day_task_id) DO UPDATE SET
      title = excluded.title,
      notes = excluded.notes,
      subject_code = excluded.subject_code,
      status = excluded.status,
      priority = excluded.priority,
      due_date = excluded.due_date,
      scheduled_start_at = excluded.scheduled_start_at,
      scheduled_end_at = excluded.scheduled_end_at,
      scheduled_timezone = excluded.scheduled_timezone,
      estimated_minutes = excluded.estimated_minutes,
      sort_order = excluded.sort_order,
      completed_at = excluded.completed_at,
      deleted_at = NULL,
      updated_at = excluded.updated_at,
      version = planner_tasks.version + 1
  `).run({
    plannerId: `${scope.workspaceId}:planner:legacy-day-task:${task.id}`,
    workspaceId: scope.workspaceId,
    listId: plannerDefaultId(scope.workspaceId, "inbox"),
    title: task.title,
    notes: task.notes,
    subjectCode: task.subject_code,
    status: task.done ? "completed" : "open",
    priority: task.priority,
    dueDate: scheduledStartAt ? null : task.day,
    scheduledStartAt,
    scheduledEndAt: scheduledStartAt ? addMinutesToInstant(scheduledStartAt, task.estimated_minutes) : null,
    scheduledTimezone: scheduledStartAt ? timezone : null,
    estimatedMinutes: task.estimated_minutes,
    sortOrder: task.sort_order,
    completedAt: task.done ? (task.done_at ?? task.created_at) : null,
    legacyId: task.id,
    createdAt: task.created_at,
    updatedAt: task.done_at ?? task.created_at,
  });
}

function mirrorDayTaskDeletion(db: Database.Database, scope: WorkspaceScope, dayTaskId: number): void {
  if (!tableExists(db, "planner_tasks")) return;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE planner_tasks SET deleted_at = ?, updated_at = ?, version = version + 1
    WHERE workspace_id = ? AND legacy_day_task_id = ?
  `).run(now, now, scope.workspaceId, dayTaskId);
}

function tableExists(db: Database.Database, table: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
  );
}

export type DayNote = {
  id: number;
  day: string;
  content: string;
  created_at: string;
};

export function listTasks(db: Database.Database, scope: WorkspaceScope, day: string): DayTask[] {
  assertDateKey(day);
  return db.prepare(`
    SELECT ${TASK_SELECT}
    FROM day_tasks
    WHERE workspace_id = @workspaceId AND day = @day
    ORDER BY CASE WHEN scheduled_start IS NULL THEN 1 ELSE 0 END ASC,
             scheduled_start ASC,
             priority ASC,
             sort_order ASC,
             id ASC
  `).all({ workspaceId: scope.workspaceId, day }) as DayTask[];
}

export function listCalendarTasks(
  db: Database.Database,
  scope: WorkspaceScope,
  input?: { from: string; to: string; includeDone?: boolean; limit?: number },
): DayTask[] {
  if (!input) {
    return db.prepare(`
      SELECT ${TASK_SELECT}
      FROM day_tasks
      WHERE workspace_id = @workspaceId
      ORDER BY day ASC,
               CASE WHEN scheduled_start IS NULL THEN 1 ELSE 0 END ASC,
               scheduled_start ASC, priority ASC, sort_order ASC, id ASC
    `).all({ workspaceId: scope.workspaceId }) as DayTask[];
  }
  const from = assertDateKey(input.from);
  const to = assertDateKey(input.to);
  if (to < from) throw new Error("任务日期范围无效");
  const rangeDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  if (rangeDays > 366) throw new Error("任务日期范围不能超过 366 天");
  const limit = Math.max(1, Math.min(5_000, Math.round(input.limit ?? 1_000)));
  return db.prepare(`
    SELECT ${TASK_SELECT}
    FROM day_tasks
    WHERE workspace_id = @workspaceId
      AND day BETWEEN @from AND @to
      AND (@includeDone = 1 OR done = 0)
    ORDER BY day ASC,
             CASE WHEN scheduled_start IS NULL THEN 1 ELSE 0 END ASC,
             scheduled_start ASC, priority ASC, sort_order ASC, id ASC
    LIMIT @limit
  `).all({
    workspaceId: scope.workspaceId,
    from,
    to,
    includeDone: input.includeDone === false ? 0 : 1,
    limit,
  }) as DayTask[];
}

export function addTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    day: string;
    title: string;
    subjectCode?: string;
    priority?: number;
    estimatedMinutes?: number;
    scheduledStart?: string | null;
    notes?: string;
    knowledgePointId?: string | null;
    activityType?: string;
    completionCriteria?: string;
    sourceType?: string;
    sourceId?: string | number;
    verificationMethod?: string;
  },
): DayTask {
  const day = assertDateKey(input.day);
  const title = input.title.trim();
  if (!title) throw new Error("任务内容必填");
  const point = normalizeKnowledgePoint(db, scope, input.knowledgePointId);
  const subjectCode = point?.subject_code ?? normalizeSubjectCode(db, scope, input.subjectCode);
  const priority = normalizePriority(input.priority);
  const estimatedMinutes = normalizeEstimatedMinutes(input.estimatedMinutes);
  const scheduledStart = normalizeScheduledStart(input.scheduledStart);
  const notes = normalizeTaskNotes(input.notes);
  const activityType = normalizeActivityType(input.activityType);
  const completionCriteria = normalizeTaskText(input.completionCriteria, 500);
  const sourceType = normalizeTaskText(input.sourceType, 50);
  const sourceId = normalizeTaskText(input.sourceId === undefined ? "" : String(input.sourceId), 100);
  const verificationMethod = normalizeTaskText(input.verificationMethod, 200);
  ensureDay(db, scope, day);
  const maxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) AS value
    FROM day_tasks WHERE workspace_id = ? AND day = ?
  `).get(scope.workspaceId, day) as { value: number };
  const result = db.prepare(`
    INSERT INTO day_tasks
      (workspace_id, day, title, subject_code, sort_order, priority, estimated_minutes,
       scheduled_start, notes, knowledge_point_id, activity_type, completion_criteria,
       source_type, source_id, planned_verification_method)
    VALUES
      (@workspaceId, @day, @title, @subjectCode, @sortOrder, @priority, @estimatedMinutes,
       @scheduledStart, @notes, @knowledgePointId, @activityType, @completionCriteria,
       @sourceType, @sourceId, @verificationMethod)
  `).run({
    workspaceId: scope.workspaceId,
    day,
    title,
    subjectCode,
    sortOrder: maxOrder.value + 1,
    priority,
    estimatedMinutes,
    scheduledStart,
    notes,
    knowledgePointId: point?.id ?? null,
    activityType,
    completionCriteria,
    sourceType,
    sourceId,
    verificationMethod,
  });
  const created = db.prepare(`
    SELECT ${TASK_SELECT}
    FROM day_tasks WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, Number(result.lastInsertRowid)) as DayTask;
  mirrorDayTaskToPlanner(db, scope, created.id);
  return created;
}

export function toggleTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: number; done: boolean } & TaskCompletionEvidenceInput,
): { subjectCode: string | null; retestDay: string | null } {
  const evidence = normalizeCompletionEvidence(input);
  const task = db.prepare(`
    SELECT day, title, subject_code, knowledge_point_id, source_type, planned_verification_method
    FROM day_tasks
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.id) as {
    day: string;
    title: string;
    subject_code: string | null;
    knowledge_point_id: string | null;
    source_type: string;
    planned_verification_method: string;
  } | undefined;
  if (!task) throw new Error("任务不存在");
  if (input.recordAsStudy && (!input.done || evidence.actualMinutes === null)) {
    throw new Error("记入学习活动需同时完成任务并填写实际时长");
  }
  if (
    task.source_type === "training_retest"
    && input.done
    && evidence.actualMinutes !== null
    && !evidence.verificationOutcome
  ) {
    throw new Error("保存复测证据时需记录相对训练前的改善结论");
  }
  const retestDelay = normalizeRetestDelay(input.scheduleRetestAfterDays);
  if (retestDelay !== null && (
    !input.done
    || !task.knowledge_point_id
    || !task.source_type
    || task.source_type === "training_retest"
  )) {
    throw new Error("只有关联诊断来源与知识点的训练任务才能安排复测");
  }
  const update = db.prepare(`
      UPDATE day_tasks
      SET done = @done,
          done_at = CASE WHEN @done = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
          actual_minutes = CASE WHEN @done = 1 THEN @actualMinutes ELSE actual_minutes END,
          completion_output = CASE WHEN @done = 1 THEN @completionOutput ELSE completion_output END,
          verification_method = CASE WHEN @done = 1 THEN @verificationMethod ELSE verification_method END,
          verification_result = CASE WHEN @done = 1 THEN @verificationResult ELSE verification_result END,
          verification_outcome = CASE WHEN @done = 1 THEN @verificationOutcome ELSE verification_outcome END
      WHERE workspace_id = @workspaceId AND id = @id
    `);
  const upsertStudy = db.prepare(`
    INSERT INTO study_sessions
      (workspace_id, day, subject_code, knowledge_point_id, task_id, title, duration_minutes, output)
    VALUES
      (@workspaceId, @day, @subjectCode, @knowledgePointId, @taskId, @title, @durationMinutes, @output)
    ON CONFLICT(workspace_id, task_id) WHERE task_id IS NOT NULL
    DO UPDATE SET
      day = excluded.day,
      subject_code = excluded.subject_code,
      knowledge_point_id = excluded.knowledge_point_id,
      title = excluded.title,
      duration_minutes = excluded.duration_minutes,
      output = excluded.output
  `);
  let retestDay: string | null = null;
  db.transaction(() => {
    update.run({
      workspaceId: scope.workspaceId,
      id: input.id,
      done: input.done ? 1 : 0,
      ...evidence,
    });
    mirrorDayTaskToPlanner(db, scope, input.id);
    if (input.recordAsStudy) {
      upsertStudy.run({
        workspaceId: scope.workspaceId,
        day: task.day,
        subjectCode: task.subject_code,
        knowledgePointId: task.knowledge_point_id,
        taskId: input.id,
        title: task.title,
        durationMinutes: evidence.actualMinutes,
        output: evidence.completionOutput,
      });
    }
    if (retestDelay !== null) {
      const existingRetest = db.prepare(`
        SELECT day
        FROM day_tasks
        WHERE workspace_id = ? AND source_type = 'training_retest' AND source_id = ?
        ORDER BY id ASC
        LIMIT 1
      `).get(scope.workspaceId, String(input.id)) as { day: string } | undefined;
      if (existingRetest) {
        retestDay = existingRetest.day;
      } else {
        retestDay = shiftDateKey(todayKey(), retestDelay);
        addTask(db, scope, {
          day: retestDay,
          title: `短复测：${task.title}`.slice(0, 120),
          subjectCode: task.subject_code || undefined,
          priority: 1,
          estimatedMinutes: 15,
          knowledgePointId: task.knowledge_point_id,
          activityType: "recall",
          completionCriteria: "不看原答案完成一次短复测，并记录相对训练前是改善、持平还是退步。",
          sourceType: "training_retest",
          sourceId: input.id,
          notes: `由训练任务 #${input.id} 自动安排；先独立作答，再核对结果。`,
          verificationMethod: task.planned_verification_method || evidence.verificationMethod || "同类小测",
        });
      }
    }
  })();
  return { subjectCode: task.subject_code, retestDay };
}

export function updateTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    id: number;
    title?: string;
    subjectCode?: string | null;
    priority?: number;
    estimatedMinutes?: number;
    scheduledStart?: string | null;
    notes?: string;
    knowledgePointId?: string | null;
    activityType?: string;
    completionCriteria?: string;
    plannedVerificationMethod?: string;
  },
): void {
  const task = db.prepare(`
    SELECT title, subject_code, priority, estimated_minutes, scheduled_start, notes,
           knowledge_point_id, activity_type, completion_criteria,
           planned_verification_method
    FROM day_tasks WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.id) as
    | {
        title: string;
        subject_code: string | null;
        priority: number;
        estimated_minutes: number;
        scheduled_start: string | null;
        notes: string;
        knowledge_point_id: string | null;
        activity_type: string;
        completion_criteria: string;
        planned_verification_method: string;
      }
    | undefined;
  if (!task) throw new Error("任务不存在");
  const title = input.title === undefined ? task.title : input.title.trim();
  if (!title) throw new Error("任务内容必填");
  const point = input.knowledgePointId === undefined
    ? undefined
    : normalizeKnowledgePoint(db, scope, input.knowledgePointId);
  const subjectCode = point
    ? point.subject_code
    : input.subjectCode === undefined
      ? task.subject_code
      : normalizeSubjectCode(db, scope, input.subjectCode || undefined);
  const knowledgePointId = input.knowledgePointId === undefined
    ? input.subjectCode === undefined ? task.knowledge_point_id : null
    : point?.id ?? null;
  const priority = input.priority === undefined ? task.priority : normalizePriority(input.priority);
  const estimatedMinutes = input.estimatedMinutes === undefined
    ? task.estimated_minutes
    : normalizeEstimatedMinutes(input.estimatedMinutes);
  const scheduledStart = input.scheduledStart === undefined
    ? task.scheduled_start
    : normalizeScheduledStart(input.scheduledStart);
  const notes = input.notes === undefined ? task.notes : normalizeTaskNotes(input.notes);
  const activityType = input.activityType === undefined
    ? task.activity_type
    : normalizeActivityType(input.activityType);
  const completionCriteria = input.completionCriteria === undefined
    ? task.completion_criteria
    : normalizeTaskText(input.completionCriteria, 500);
  const plannedVerificationMethod = input.plannedVerificationMethod === undefined
    ? task.planned_verification_method
    : normalizeTaskText(input.plannedVerificationMethod, 200);
  db.prepare(`
    UPDATE day_tasks
    SET title = ?, subject_code = ?, priority = ?, estimated_minutes = ?, scheduled_start = ?,
        notes = ?, knowledge_point_id = ?, activity_type = ?, completion_criteria = ?,
        planned_verification_method = ?
    WHERE workspace_id = ? AND id = ?
  `).run(
    title,
    subjectCode,
    priority,
    estimatedMinutes,
    scheduledStart,
    notes,
    knowledgePointId,
    activityType,
    completionCriteria,
    plannedVerificationMethod,
    scope.workspaceId,
    input.id,
  );
  mirrorDayTaskToPlanner(db, scope, input.id);
}

export function scheduleTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: number; day: string; scheduledStart?: string | null; estimatedMinutes?: number },
): { previousDay: string; day: string } {
  const day = assertDateKey(input.day);
  const task = db.prepare(`
    SELECT day, estimated_minutes FROM day_tasks WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.id) as { day: string; estimated_minutes: number } | undefined;
  if (!task) throw new Error("任务不存在");
  const scheduledStart = normalizeScheduledStart(input.scheduledStart);
  const estimatedMinutes = input.estimatedMinutes === undefined
    ? task.estimated_minutes
    : normalizeEstimatedMinutes(input.estimatedMinutes);
  ensureDay(db, scope, day);
  const maxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) AS value
    FROM day_tasks WHERE workspace_id = ? AND day = ? AND id != ?
  `).get(scope.workspaceId, day, input.id) as { value: number };
  db.prepare(`
    UPDATE day_tasks
    SET day = @day,
        scheduled_start = @scheduledStart,
        estimated_minutes = @estimatedMinutes,
        sort_order = CASE WHEN day = @day THEN sort_order ELSE @sortOrder END
    WHERE workspace_id = @workspaceId AND id = @id
  `).run({
    workspaceId: scope.workspaceId,
    id: input.id,
    day,
    scheduledStart,
    estimatedMinutes,
    sortOrder: maxOrder.value + 1,
  });
  mirrorDayTaskToPlanner(db, scope, input.id);
  return { previousDay: task.day, day };
}

export function deleteTask(db: Database.Database, scope: WorkspaceScope, id: number): void {
  db.transaction(() => {
    db.prepare(`
      UPDATE study_sessions
      SET task_id = NULL
      WHERE workspace_id = ? AND task_id = ?
    `).run(scope.workspaceId, id);
    db.prepare("DELETE FROM day_tasks WHERE workspace_id = ? AND id = ?").run(scope.workspaceId, id);
    mirrorDayTaskDeletion(db, scope, id);
  })();
}

/** 未完成的任务顺延到目标日期（跨天迁移）。 */
export function carryOverTasks(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { fromDay: string; toDay: string },
): number {
  const fromDay = assertDateKey(input.fromDay);
  const toDay = assertDateKey(input.toDay);
  if (fromDay === toDay) return 0;
  ensureDay(db, scope, toDay);
  const open = db.prepare(`
    SELECT id FROM day_tasks WHERE workspace_id = ? AND day = ? AND done = 0
  `).all(scope.workspaceId, fromDay) as Array<{ id: number }>;
  if (!open.length) return 0;
  const maxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) AS value
    FROM day_tasks WHERE workspace_id = ? AND day = ?
  `).get(scope.workspaceId, toDay) as { value: number };
  const move = db.prepare("UPDATE day_tasks SET day = ?, scheduled_start = NULL, sort_order = ? WHERE workspace_id = ? AND id = ?");
  const run = db.transaction(() => {
    open.forEach((task, index) => {
      move.run(toDay, maxOrder.value + index + 1, scope.workspaceId, task.id);
      mirrorDayTaskToPlanner(db, scope, task.id);
    });
  });
  run();
  return open.length;
}

function normalizePriority(value: number | undefined): 1 | 2 | 3 {
  const priority = value === undefined ? 2 : Math.round(Number(value));
  if (priority !== 1 && priority !== 2 && priority !== 3) throw new Error("任务优先级需为高、中或低");
  return priority;
}

function normalizeEstimatedMinutes(value: number | undefined): number {
  const minutes = value === undefined ? 30 : Math.round(Number(value));
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) throw new Error("预计时长需在 5-480 分钟之间");
  return minutes;
}

function normalizeScheduledStart(value: string | null | undefined): string | null {
  const start = value?.trim() || "";
  if (!start) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) throw new Error("开始时间格式需为 HH:MM");
  return start;
}

function normalizeTaskNotes(value: string | undefined): string {
  return (value || "").trim().slice(0, 500);
}

function normalizeTaskText(value: string | undefined, maxLength: number): string {
  return (value || "").trim().slice(0, maxLength);
}

function normalizeActivityType(value: string | undefined): TaskActivityType {
  const activityType = value?.trim() || "unspecified";
  if (!["unspecified", "study", "practice", "recall", "review", "mock", "mixed"].includes(activityType)) {
    throw new Error("任务活动类型无效");
  }
  return activityType as TaskActivityType;
}

function normalizeCompletionEvidence(input: TaskCompletionEvidenceInput) {
  const actualMinutes = input.actualMinutes === undefined || input.actualMinutes === null
    ? null
    : Math.round(Number(input.actualMinutes));
  if (actualMinutes !== null && (!Number.isInteger(actualMinutes) || actualMinutes < 1 || actualMinutes > 1440)) {
    throw new Error("实际时长需在 1-1440 分钟之间");
  }
  return {
    actualMinutes,
    completionOutput: normalizeTaskText(input.completionOutput, 1000),
    verificationMethod: normalizeTaskText(input.verificationMethod, 200),
    verificationResult: normalizeTaskText(input.verificationResult, 200),
    verificationOutcome: normalizeVerificationOutcome(input.verificationOutcome),
  };
}

function normalizeVerificationOutcome(value: unknown): TaskVerificationOutcome {
  if (value === undefined || value === null || value === "") return "";
  if (!["improved", "unchanged", "regressed", "unknown"].includes(String(value))) {
    throw new Error("复测结论无效");
  }
  return value as TaskVerificationOutcome;
}

function normalizeRetestDelay(value: unknown): 1 | 3 | 7 | null {
  if (value === undefined || value === null) return null;
  const days = Number(value);
  if (days !== 1 && days !== 3 && days !== 7) throw new Error("复测间隔需为 1、3 或 7 天");
  return days;
}

function normalizeKnowledgePoint(
  db: Database.Database,
  scope: WorkspaceScope,
  value: string | null | undefined,
): { id: string; subject_code: string } | null {
  const id = value?.trim() || "";
  if (!id) return null;
  const point = db.prepare(`
    SELECT id, subject_code
    FROM knowledge_points
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as { id: string; subject_code: string } | undefined;
  if (!point) throw new Error("知识点不存在");
  return point;
}

function normalizeSubjectCode(
  db: Database.Database,
  scope: WorkspaceScope,
  value: string | undefined,
): string | null {
  const subjectCode = value?.trim() || "";
  if (!subjectCode) return null;
  const subject = db.prepare("SELECT 1 FROM subjects WHERE workspace_id = ? AND code = ?")
    .get(scope.workspaceId, subjectCode);
  if (!subject) throw new Error("科目不存在");
  return subjectCode;
}

export function listNotes(db: Database.Database, scope: WorkspaceScope, day: string): DayNote[] {
  assertDateKey(day);
  return db.prepare(`
    SELECT id, day, content, created_at
    FROM day_notes
    WHERE workspace_id = @workspaceId AND day = @day
    ORDER BY id ASC
  `).all({ workspaceId: scope.workspaceId, day }) as DayNote[];
}

export function addNote(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { day: string; content: string },
): DayNote {
  const day = assertDateKey(input.day);
  const content = input.content.trim();
  if (!content) throw new Error("随笔内容必填");
  ensureDay(db, scope, day);
  const result = db.prepare(`
    INSERT INTO day_notes (workspace_id, day, content) VALUES (?, ?, ?)
  `).run(scope.workspaceId, day, content);
  return db.prepare(`
    SELECT id, day, content, created_at FROM day_notes WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, Number(result.lastInsertRowid)) as DayNote;
}

export function updateNote(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: number; content: string },
): void {
  const content = input.content.trim();
  if (!content) throw new Error("随笔内容必填");
  const result = db.prepare(`
    UPDATE day_notes SET content = ? WHERE workspace_id = ? AND id = ?
  `).run(content, scope.workspaceId, input.id);
  if (!result.changes) throw new Error("随笔不存在");
}

export function deleteNote(db: Database.Database, scope: WorkspaceScope, id: number): void {
  db.prepare("DELETE FROM day_notes WHERE workspace_id = ? AND id = ?").run(scope.workspaceId, id);
}
