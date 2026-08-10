import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey } from "../dates";
import {
  LEARNING_ACTIVITY_TYPES,
  type AppendLearningEvidenceInput,
  type LearningActivityType,
  type LearningEvidence,
  type LearningTaskLink,
  type ListLearningEvidenceInput,
  type UpsertLearningTaskLinkInput,
  type VoidLearningEvidenceInput,
} from "../learning/types";

export type {
  AppendLearningEvidenceInput,
  LearningActivityType,
  LearningEvidence,
  LearningTaskLink,
  ListLearningEvidenceInput,
  UpsertLearningTaskLinkInput,
  VoidLearningEvidenceInput,
} from "../learning/types";

type LearningTaskLinkRow = {
  workspace_id: string;
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

type LearningEvidenceRow = {
  id: string;
  workspace_id: string;
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

type NormalizedEvidence = {
  taskId: string | null;
  completionCycle: number;
  day: string;
  knowledgePointId: string | null;
  activityType: LearningActivityType;
  actualMinutes: number | null;
  output: string;
  outcome: string;
  difficulty: string;
  verificationMethod: string;
  verificationResult: string;
  verificationOutcome: string;
  confidence: number | null;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  correctsEvidenceId: string | null;
};

const LINK_COLUMNS = `
  workspace_id, task_id, knowledge_point_id, activity_type,
  completion_criteria, planned_verification_method, source_type, source_id,
  created_at, updated_at, version
`;

const EVIDENCE_COLUMNS = `
  id, workspace_id, task_id, completion_cycle, day, knowledge_point_id,
  activity_type, actual_minutes, output, outcome, difficulty,
  verification_method, verification_result, verification_outcome, confidence,
  source_type, source_id, idempotency_key, corrected_by, voided_at,
  void_reason, created_at
`;

export function upsertLearningTaskLink(
  db: Database.Database,
  scope: WorkspaceScope,
  input: UpsertLearningTaskLinkInput,
): LearningTaskLink {
  const taskId = requiredId(input.taskId, "任务 ID");
  requireTask(db, scope, taskId);
  const current = getLearningTaskLink(db, scope, taskId);
  assertExpectedLinkVersion(current, input.expectedVersion);

  const knowledgePointId = input.knowledgePointId === undefined
    ? current?.knowledgePointId ?? null
    : optionalId(input.knowledgePointId, "知识点 ID");
  requireKnowledgePoint(db, scope, knowledgePointId);
  const activityType = input.activityType === undefined
    ? current?.activityType ?? "unspecified"
    : normalizeActivityType(input.activityType);
  const completionCriteria = input.completionCriteria === undefined
    ? current?.completionCriteria ?? ""
    : boundedText(input.completionCriteria, 500, "完成标准");
  const plannedVerificationMethod = input.plannedVerificationMethod === undefined
    ? current?.plannedVerificationMethod ?? ""
    : boundedText(input.plannedVerificationMethod, 200, "计划验证方式");
  const source = input.sourceType === undefined && input.sourceId === undefined
    ? { sourceType: current?.sourceType ?? "", sourceId: current?.sourceId ?? "" }
    : normalizeSource(input.sourceType, input.sourceId);
  const now = new Date().toISOString();

  if (!current) {
    db.prepare(`
      INSERT INTO learning_task_links
        (workspace_id, task_id, knowledge_point_id, activity_type,
         completion_criteria, planned_verification_method, source_type, source_id,
         created_at, updated_at, version)
      VALUES
        (@workspaceId, @taskId, @knowledgePointId, @activityType,
         @completionCriteria, @plannedVerificationMethod, @sourceType, @sourceId,
         @now, @now, 1)
    `).run({
      workspaceId: scope.workspaceId,
      taskId,
      knowledgePointId,
      activityType,
      completionCriteria,
      plannedVerificationMethod,
      ...source,
      now,
    });
  } else {
    const result = db.prepare(`
      UPDATE learning_task_links
      SET knowledge_point_id = @knowledgePointId,
          activity_type = @activityType,
          completion_criteria = @completionCriteria,
          planned_verification_method = @plannedVerificationMethod,
          source_type = @sourceType,
          source_id = @sourceId,
          updated_at = @now,
          version = version + 1
      WHERE workspace_id = @workspaceId AND task_id = @taskId AND version = @currentVersion
    `).run({
      workspaceId: scope.workspaceId,
      taskId,
      knowledgePointId,
      activityType,
      completionCriteria,
      plannedVerificationMethod,
      ...source,
      now,
      currentVersion: current.version,
    });
    if (result.changes !== 1) throw new Error("学习任务关联版本冲突");
  }

  return getLearningTaskLink(db, scope, taskId)!;
}

export function getLearningTaskLink(
  db: Database.Database,
  scope: WorkspaceScope,
  taskId: string,
): LearningTaskLink | null {
  const id = requiredId(taskId, "任务 ID");
  const row = db.prepare(`
    SELECT ${LINK_COLUMNS}
    FROM learning_task_links
    WHERE workspace_id = ? AND task_id = ?
  `).get(scope.workspaceId, id) as LearningTaskLinkRow | undefined;
  return row ? mapLearningTaskLink(row) : null;
}

export function appendLearningEvidence(
  db: Database.Database,
  scope: WorkspaceScope,
  input: AppendLearningEvidenceInput,
): LearningEvidence {
  const normalized = normalizeEvidence(db, scope, input);

  return db.transaction(() => {
    const replay = getEvidenceByIdempotencyKey(db, scope, normalized.idempotencyKey);
    if (replay) {
      if (!sameEvidencePayload(replay, normalized)) {
        throw new Error("学习证据幂等键已用于不同请求");
      }
      assertCorrectionReplay(db, scope, replay.id, normalized.correctsEvidenceId);
      return replay;
    }

    const correctionTarget = normalized.correctsEvidenceId
      ? requireEvidence(db, scope, normalized.correctsEvidenceId)
      : null;
    if (correctionTarget?.voidedAt) throw new Error("已作废的学习证据不能被纠正");
    if (correctionTarget?.correctedBy) throw new Error("学习证据已被其他记录纠正");

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO learning_evidence
        (id, workspace_id, task_id, completion_cycle, day, knowledge_point_id,
         activity_type, actual_minutes, output, outcome, difficulty,
         verification_method, verification_result, verification_outcome, confidence,
         source_type, source_id, idempotency_key, created_at)
      VALUES
        (@id, @workspaceId, @taskId, @completionCycle, @day, @knowledgePointId,
         @activityType, @actualMinutes, @output, @outcome, @difficulty,
         @verificationMethod, @verificationResult, @verificationOutcome, @confidence,
         @sourceType, @sourceId, @idempotencyKey, @now)
    `).run({ id, workspaceId: scope.workspaceId, ...normalized, now });

    if (correctionTarget) {
      const corrected = db.prepare(`
        UPDATE learning_evidence
        SET corrected_by = ?
        WHERE workspace_id = ? AND id = ? AND corrected_by IS NULL
      `).run(id, scope.workspaceId, correctionTarget.id);
      if (corrected.changes !== 1) throw new Error("学习证据已被其他记录纠正");
    }

    return requireEvidence(db, scope, id);
  })();
}

export function listLearningEvidence(
  db: Database.Database,
  scope: WorkspaceScope,
  input: ListLearningEvidenceInput = {},
): LearningEvidence[] {
  const taskId = input.taskId === undefined ? null : requiredId(input.taskId, "任务 ID");
  const knowledgePointId = input.knowledgePointId === undefined
    ? null
    : requiredId(input.knowledgePointId, "知识点 ID");
  const fromDay = input.fromDay === undefined ? null : assertDateKey(input.fromDay);
  const throughDay = input.throughDay === undefined ? null : assertDateKey(input.throughDay);
  if (fromDay && throughDay && fromDay > throughDay) throw new Error("学习证据日期范围无效");
  const limit = normalizeLimit(input.limit);

  const rows = db.prepare(`
    SELECT ${EVIDENCE_COLUMNS}
    FROM learning_evidence
    WHERE workspace_id = @workspaceId
      AND (@taskId IS NULL OR task_id = @taskId)
      AND (@knowledgePointId IS NULL OR knowledge_point_id = @knowledgePointId)
      AND (@fromDay IS NULL OR day >= @fromDay)
      AND (@throughDay IS NULL OR day <= @throughDay)
      AND (@includeVoided = 1 OR voided_at IS NULL)
    ORDER BY day DESC, created_at DESC, id DESC
    LIMIT @limit
  `).all({
    workspaceId: scope.workspaceId,
    taskId,
    knowledgePointId,
    fromDay,
    throughDay,
    includeVoided: input.includeVoided ? 1 : 0,
    limit,
  }) as LearningEvidenceRow[];
  return rows.map(mapLearningEvidence);
}

export function voidLearningEvidence(
  db: Database.Database,
  scope: WorkspaceScope,
  input: VoidLearningEvidenceInput,
): LearningEvidence {
  const id = requiredId(input.id, "学习证据 ID");
  const reason = boundedText(input.reason, 500, "作废原因");
  if (!reason) throw new Error("作废原因必填");
  const current = requireEvidence(db, scope, id);
  if (current.voidedAt) return current;

  const result = db.prepare(`
    UPDATE learning_evidence
    SET voided_at = ?, void_reason = ?
    WHERE workspace_id = ? AND id = ? AND voided_at IS NULL
  `).run(new Date().toISOString(), reason, scope.workspaceId, id);
  if (result.changes !== 1) throw new Error("学习证据作废冲突");
  return requireEvidence(db, scope, id);
}

function normalizeEvidence(
  db: Database.Database,
  scope: WorkspaceScope,
  input: AppendLearningEvidenceInput,
): NormalizedEvidence {
  const taskId = optionalId(input.taskId, "任务 ID");
  if (taskId) requireTask(db, scope, taskId);
  const link = taskId ? getLearningTaskLink(db, scope, taskId) : null;
  const knowledgePointId = input.knowledgePointId === undefined
    ? link?.knowledgePointId ?? null
    : optionalId(input.knowledgePointId, "知识点 ID");
  requireKnowledgePoint(db, scope, knowledgePointId);
  const completionCycle = boundedInteger(input.completionCycle, 1, Number.MAX_SAFE_INTEGER, "完成周期");
  const activityType = input.activityType === undefined
    ? link?.activityType ?? "unspecified"
    : normalizeActivityType(input.activityType);
  const source = input.sourceType === undefined && input.sourceId === undefined
    ? { sourceType: link?.sourceType ?? "", sourceId: link?.sourceId ?? "" }
    : normalizeSource(input.sourceType, input.sourceId);
  return {
    taskId,
    completionCycle,
    day: assertDateKey(input.day),
    knowledgePointId,
    activityType,
    actualMinutes: input.actualMinutes === undefined || input.actualMinutes === null
      ? null
      : boundedInteger(input.actualMinutes, 1, 1440, "实际时长"),
    output: boundedText(input.output, 4000, "学习产出"),
    outcome: boundedText(input.outcome, 100, "学习结果"),
    difficulty: boundedText(input.difficulty, 100, "学习难度"),
    verificationMethod: boundedText(input.verificationMethod, 200, "验证方式"),
    verificationResult: boundedText(input.verificationResult, 1000, "验证结果"),
    verificationOutcome: boundedText(input.verificationOutcome, 100, "验证结论"),
    confidence: input.confidence === undefined || input.confidence === null
      ? null
      : boundedInteger(input.confidence, 0, 100, "学习信心"),
    ...source,
    idempotencyKey: boundedText(input.idempotencyKey, 200, "幂等键", true),
    correctsEvidenceId: input.correctsEvidenceId === undefined
      ? null
      : requiredId(input.correctsEvidenceId, "被纠正证据 ID"),
  };
}

function getEvidenceByIdempotencyKey(
  db: Database.Database,
  scope: WorkspaceScope,
  key: string,
): LearningEvidence | null {
  const row = db.prepare(`
    SELECT ${EVIDENCE_COLUMNS}
    FROM learning_evidence
    WHERE workspace_id = ? AND idempotency_key = ?
  `).get(scope.workspaceId, key) as LearningEvidenceRow | undefined;
  return row ? mapLearningEvidence(row) : null;
}

function requireEvidence(db: Database.Database, scope: WorkspaceScope, id: string): LearningEvidence {
  const row = db.prepare(`
    SELECT ${EVIDENCE_COLUMNS}
    FROM learning_evidence
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as LearningEvidenceRow | undefined;
  if (!row) throw new Error("学习证据不存在");
  return mapLearningEvidence(row);
}

function assertCorrectionReplay(
  db: Database.Database,
  scope: WorkspaceScope,
  replayId: string,
  correctsEvidenceId: string | null,
): void {
  const priorTarget = db.prepare(`
    SELECT id FROM learning_evidence
    WHERE workspace_id = ? AND corrected_by = ?
  `).get(scope.workspaceId, replayId) as { id: string } | undefined;
  if (!correctsEvidenceId) {
    if (priorTarget) throw new Error("学习证据幂等键已用于纠正请求");
    return;
  }
  const target = requireEvidence(db, scope, correctsEvidenceId);
  if (target.correctedBy !== replayId || priorTarget?.id !== target.id) {
    throw new Error("学习证据幂等纠正状态不一致");
  }
}

function sameEvidencePayload(evidence: LearningEvidence, normalized: NormalizedEvidence): boolean {
  return evidence.taskId === normalized.taskId
    && evidence.completionCycle === normalized.completionCycle
    && evidence.day === normalized.day
    && evidence.knowledgePointId === normalized.knowledgePointId
    && evidence.activityType === normalized.activityType
    && evidence.actualMinutes === normalized.actualMinutes
    && evidence.output === normalized.output
    && evidence.outcome === normalized.outcome
    && evidence.difficulty === normalized.difficulty
    && evidence.verificationMethod === normalized.verificationMethod
    && evidence.verificationResult === normalized.verificationResult
    && evidence.verificationOutcome === normalized.verificationOutcome
    && evidence.confidence === normalized.confidence
    && evidence.sourceType === normalized.sourceType
    && evidence.sourceId === normalized.sourceId;
}

function requireTask(db: Database.Database, scope: WorkspaceScope, taskId: string): void {
  const exists = db.prepare(`
    SELECT 1 FROM planner_tasks WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, taskId);
  if (!exists) throw new Error("任务不存在");
}

function requireKnowledgePoint(
  db: Database.Database,
  scope: WorkspaceScope,
  knowledgePointId: string | null,
): void {
  if (!knowledgePointId) return;
  const exists = db.prepare(`
    SELECT 1 FROM knowledge_points WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, knowledgePointId);
  if (!exists) throw new Error("知识点不存在");
}

function assertExpectedLinkVersion(current: LearningTaskLink | null, expectedVersion: number | undefined): void {
  if (expectedVersion === undefined) return;
  const normalized = boundedInteger(expectedVersion, 0, Number.MAX_SAFE_INTEGER, "学习任务关联版本");
  const actual = current?.version ?? 0;
  if (normalized !== actual) throw new Error("学习任务关联版本冲突");
}

function normalizeActivityType(value: LearningActivityType): LearningActivityType {
  if (!LEARNING_ACTIVITY_TYPES.includes(value)) throw new Error("学习活动类型无效");
  return value;
}

function normalizeSource(
  sourceTypeValue: string | undefined,
  sourceIdValue: string | number | undefined,
): { sourceType: string; sourceId: string } {
  const sourceType = boundedText(sourceTypeValue, 50, "来源类型");
  const sourceId = boundedText(sourceIdValue === undefined ? "" : String(sourceIdValue), 200, "来源 ID");
  if (Boolean(sourceType) !== Boolean(sourceId)) throw new Error("来源类型与来源 ID 必须同时提供");
  return { sourceType, sourceId };
}

function requiredId(value: string, label: string): string {
  return boundedText(value, 200, label, true);
}

function optionalId(value: string | null | undefined, label: string): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return boundedText(normalized, 200, label, true);
}

function boundedText(
  value: string | undefined,
  maxLength: number,
  label: string,
  required = false,
): string {
  const normalized = (value ?? "").trim();
  if (required && !normalized) throw new Error(`${label}必填`);
  if (normalized.length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符`);
  return normalized;
}

function boundedInteger(value: number, min: number, max: number, label: string): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < min || normalized > max) {
    throw new Error(`${label}需为 ${min}-${max} 的整数`);
  }
  return normalized;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return 200;
  return boundedInteger(value, 1, 1000, "学习证据条数");
}

function mapLearningTaskLink(row: LearningTaskLinkRow): LearningTaskLink {
  return {
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    knowledgePointId: row.knowledge_point_id,
    activityType: normalizeActivityType(row.activity_type as LearningActivityType),
    completionCriteria: row.completion_criteria,
    plannedVerificationMethod: row.planned_verification_method,
    sourceType: row.source_type,
    sourceId: row.source_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function mapLearningEvidence(row: LearningEvidenceRow): LearningEvidence {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    completionCycle: row.completion_cycle,
    day: row.day,
    knowledgePointId: row.knowledge_point_id,
    activityType: normalizeActivityType(row.activity_type as LearningActivityType),
    actualMinutes: row.actual_minutes,
    output: row.output,
    outcome: row.outcome,
    difficulty: row.difficulty,
    verificationMethod: row.verification_method,
    verificationResult: row.verification_result,
    verificationOutcome: row.verification_outcome,
    confidence: row.confidence,
    sourceType: row.source_type,
    sourceId: row.source_id,
    idempotencyKey: row.idempotency_key,
    correctedBy: row.corrected_by,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    createdAt: row.created_at,
  };
}
