import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../../access-context";
import { assertDateKey } from "../../dates";
import type {
  LearningActivityType,
  LearningEvidence,
} from "../../learning/types";
import {
  appendLearningEvidence,
  getLearningTaskLink,
} from "../../repo/learning-evidence";
import { ensureDay } from "../../repo/days";
import { getPlannerTask } from "../../repo/planner-tasks";
import { markPointLearned } from "../../repo/reviews";

export type RecordStudyInput = {
  idempotencyKey: string;
  day: string;
  title?: string;
  taskId?: string | null;
  completionCycle?: number;
  subjectCode?: string | null;
  knowledgePointId?: string | null;
  activityType?: LearningActivityType;
  actualMinutes?: number | null;
  output?: string;
  outcome?: string;
  difficulty?: string;
  verificationMethod?: string;
  verificationResult?: string;
  verificationOutcome?: string;
  confidence?: number | null;
  sourceType?: string;
  sourceId?: string | number;
  /** Keep the old aggregate read model populated while consumers migrate. */
  projectLegacySession?: boolean;
};

export type RecordStudyResult = {
  evidence: LearningEvidence;
  studySessionId: number | null;
  subjectCode: string | null;
  knowledgePointId: string | null;
};

/**
 * Canonical learning write boundary shared by manual capture and task completion.
 * Evidence is authoritative; study_sessions is only an idempotent compatibility
 * projection for aggregate readers that have not moved to learning_evidence yet.
 */
export function recordStudy(
  db: Database.Database,
  scope: WorkspaceScope,
  input: RecordStudyInput,
): RecordStudyResult {
  return db.transaction(() => {
    const day = assertDateKey(input.day);
    const taskId = input.taskId?.trim() || null;
    const task = taskId ? getPlannerTask(db, scope, taskId) : null;
    if (taskId && !task) throw new Error("任务不存在");
    const link = taskId ? getLearningTaskLink(db, scope, taskId) : null;
    const title = (input.title ?? task?.title ?? "").trim();
    if (!title) throw new Error("学习记录标题必填");

    const knowledgePointId = input.knowledgePointId === undefined
      ? link?.knowledgePointId ?? null
      : input.knowledgePointId?.trim() || null;
    const requestedSubject = input.subjectCode === undefined
      ? task?.subject_code ?? null
      : input.subjectCode?.trim() || null;
    const subjectCode = resolveStudySubject(db, scope, {
      requestedSubject,
      knowledgePointId,
    });
    const activityType = input.activityType ?? link?.activityType ?? "unspecified";
    const source = input.sourceType === undefined && input.sourceId === undefined
      ? { sourceType: link?.sourceType ?? "", sourceId: link?.sourceId ?? "" }
      : { sourceType: input.sourceType, sourceId: input.sourceId };
    const actualMinutes = normalizeActualMinutes(input.actualMinutes);
    const completionCycle = input.completionCycle ?? 1;

    const evidence = appendLearningEvidence(db, scope, {
      idempotencyKey: input.idempotencyKey,
      taskId,
      completionCycle,
      day,
      knowledgePointId,
      activityType,
      actualMinutes,
      output: input.output,
      outcome: input.outcome,
      difficulty: input.difficulty,
      verificationMethod: input.verificationMethod,
      verificationResult: input.verificationResult,
      verificationOutcome: input.verificationOutcome,
      confidence: input.confidence,
      ...source,
    });

    if (knowledgePointId) markPointLearned(db, scope, { knowledgePointId, day });
    const shouldProject = input.projectLegacySession !== false && (
      !taskId
      || knowledgePointId !== null
      || activityType !== "unspecified"
      || actualMinutes !== null
      || Boolean(input.output?.trim())
    );
    const studySessionId = shouldProject
      ? upsertStudySessionProjection(db, scope, {
          day,
          title,
          subjectCode,
          knowledgePointId,
          taskLegacyId: task?.legacy_day_task_id ?? null,
          actualMinutes,
          output: input.output?.trim() ?? "",
          evidenceId: evidence.id,
        })
      : null;
    return { evidence, studySessionId, subjectCode, knowledgePointId };
  })();
}

function resolveStudySubject(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { requestedSubject: string | null; knowledgePointId: string | null },
): string | null {
  if (input.knowledgePointId) {
    const point = db.prepare(`
      SELECT subject_code FROM knowledge_points WHERE workspace_id = ? AND id = ?
    `).get(scope.workspaceId, input.knowledgePointId) as { subject_code: string } | undefined;
    if (!point) throw new Error("知识点不存在");
    if (input.requestedSubject && input.requestedSubject !== point.subject_code) {
      throw new Error("学习记录学科与知识点不一致");
    }
    return point.subject_code;
  }
  if (!input.requestedSubject) return null;
  const subject = db.prepare(`
    SELECT 1 FROM subjects WHERE workspace_id = ? AND code = ?
  `).get(scope.workspaceId, input.requestedSubject);
  if (!subject) throw new Error("学科不存在");
  return input.requestedSubject;
}

function normalizeActualMinutes(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number(value) === 0) return null;
  if (!Number.isFinite(value)) throw new Error("学习时长无效");
  const minutes = Math.round(value);
  if (minutes < 1 || minutes > 1440) throw new Error("学习时长必须为 1-1440 分钟");
  return minutes;
}

function upsertStudySessionProjection(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    day: string;
    title: string;
    subjectCode: string | null;
    knowledgePointId: string | null;
    taskLegacyId: number | null;
    actualMinutes: number | null;
    output: string;
    evidenceId: string;
  },
): number {
  ensureDay(db, scope, input.day);
  const values = {
    workspaceId: scope.workspaceId,
    day: input.day,
    subjectCode: input.subjectCode,
    knowledgePointId: input.knowledgePointId,
    taskId: input.taskLegacyId,
    title: input.title,
    durationMinutes: input.actualMinutes ?? 0,
    output: input.output,
    sourceType: "learning_evidence",
    sourceId: input.evidenceId,
  };
  if (input.taskLegacyId !== null) {
    db.prepare(`
      INSERT INTO study_sessions
        (workspace_id, day, subject_code, knowledge_point_id, task_id, title,
         duration_minutes, output, source_type, source_id)
      VALUES
        (@workspaceId, @day, @subjectCode, @knowledgePointId, @taskId, @title,
         @durationMinutes, @output, @sourceType, @sourceId)
      ON CONFLICT(workspace_id, task_id) WHERE task_id IS NOT NULL DO UPDATE SET
        day = excluded.day,
        subject_code = excluded.subject_code,
        knowledge_point_id = excluded.knowledge_point_id,
        title = excluded.title,
        duration_minutes = excluded.duration_minutes,
        output = excluded.output,
        source_type = excluded.source_type,
        source_id = excluded.source_id
    `).run(values);
    return (db.prepare(`
      SELECT id FROM study_sessions WHERE workspace_id = ? AND task_id = ?
    `).get(scope.workspaceId, input.taskLegacyId) as { id: number }).id;
  }
  db.prepare(`
    INSERT INTO study_sessions
      (workspace_id, day, subject_code, knowledge_point_id, task_id, title,
       duration_minutes, output, source_type, source_id)
    VALUES
      (@workspaceId, @day, @subjectCode, @knowledgePointId, NULL, @title,
       @durationMinutes, @output, @sourceType, @sourceId)
    ON CONFLICT(workspace_id, source_type, source_id)
      WHERE source_type != '' AND source_id != ''
    DO UPDATE SET
      day = excluded.day,
      subject_code = excluded.subject_code,
      knowledge_point_id = excluded.knowledge_point_id,
      title = excluded.title,
      duration_minutes = excluded.duration_minutes,
      output = excluded.output
  `).run(values);
  return (db.prepare(`
    SELECT id FROM study_sessions
    WHERE workspace_id = ? AND source_type = 'learning_evidence' AND source_id = ?
  `).get(scope.workspaceId, input.evidenceId) as { id: number }).id;
}
