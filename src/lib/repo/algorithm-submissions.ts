import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import type { WorkspaceScope } from "../access-context";
import {
  calculateCodeExpiry,
  readAlgorithmCodeBlob,
  redactAlgorithmCodeBlob,
  saveAlgorithmCodeBlob,
  type JudgeCodeKey,
} from "../algorithm-code-crypto";
import { assertDateKey } from "../dates";
import {
  JUDGE_LANGUAGES,
  type JudgeGatewayResult,
  type JudgeLanguage,
  type JudgeStatus,
} from "../judge-gateway";
import {
  nextAlgorithmEvidenceStatus,
  nextAlgorithmReviewDay,
  resolveAlgorithmTransferSource,
  type AlgorithmEvidenceStatus,
  type AlgorithmReviewKind,
  type AlgorithmVerdict,
} from "./algorithms";
import { getSessionMaxHintLevel } from "./algorithm-hints";
import { requirePluginEnabled } from "./plugins";

const TERMINAL_STATUSES = new Set<JudgeStatus>([
  "AC",
  "WA",
  "TLE",
  "MLE",
  "RE",
  "CE",
  "JE",
  "CANCELLED",
]);
const LEARNING_STATUSES = new Set<JudgeStatus>(["AC", "WA", "TLE", "MLE", "RE", "CE"]);

export function isTerminalAlgorithmSubmissionStatus(status: JudgeStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export type AlgorithmSubmission = {
  id: number;
  attemptId: number;
  problemId: number;
  operationId: string;
  gatewaySubmissionId: string;
  codeBlobId: string | null;
  codeSha256: string;
  language: JudgeLanguage;
  submissionKind: "sample" | "formal";
  status: JudgeStatus;
  timeMs: number | null;
  memoryKb: number | null;
  compilerExcerpt: string;
  publicFeedback: JudgeGatewayResult["publicFeedback"];
  failureCode: string;
  submittedAt: string;
  judgedAt: string | null;
};

export type AlgorithmAttemptStudyContext = {
  attemptId: number;
  day: string;
  title: string;
  activeSeconds: number;
};

type SubmissionRow = {
  id: number;
  attempt_id: number;
  problem_id: number;
  operation_id: string;
  gateway_submission_id: string;
  code_blob_id: string | null;
  code_sha256: string;
  language: string;
  submission_kind: string;
  status: string;
  time_ms: number | null;
  memory_kb: number | null;
  compiler_excerpt: string;
  public_feedback_json: string;
  failure_code: string;
  submitted_at: string;
  judged_at: string | null;
};

type ManagedProblemRow = {
  id: number;
  title: string;
  judge_problem_ref: string;
  supported_languages_json: string;
};

export function saveAlgorithmDraft(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    problemId: number;
    language: JudgeLanguage;
    sourceCode: string;
  },
  key: JudgeCodeKey,
): { codeBlobId: string; sha256: string } {
  requirePluginEnabled(db, scope, "algorithms");
  requireManagedProblem(db, scope, input.problemId, input.language);
  const existing = db.prepare(`
    SELECT d.code_blob_id, b.sha256
    FROM algorithm_code_drafts d
    JOIN algorithm_code_blobs b
      ON b.workspace_id = d.workspace_id AND b.id = d.code_blob_id
    WHERE d.workspace_id = ? AND d.problem_id = ? AND d.language = ?
  `).get(scope.workspaceId, input.problemId, input.language) as {
    code_blob_id: string;
    sha256: string;
  } | undefined;
  const sha256 = createHash("sha256").update(input.sourceCode, "utf8").digest("hex");
  if (existing?.sha256 === sha256) return { codeBlobId: existing.code_blob_id, sha256 };

  return db.transaction(() => {
    const saved = saveAlgorithmCodeBlob(db, scope, input.sourceCode, key);
    db.prepare(`
      INSERT INTO algorithm_code_drafts
        (workspace_id, problem_id, language, code_blob_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(workspace_id, problem_id, language) DO UPDATE SET
        code_blob_id = excluded.code_blob_id,
        updated_at = CURRENT_TIMESTAMP
    `).run(scope.workspaceId, input.problemId, input.language, saved.id);
    if (existing) redactAlgorithmCodeBlob(db, scope, existing.code_blob_id);
    return { codeBlobId: saved.id, sha256: saved.sha256 };
  })();
}

export function getAlgorithmDraft(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { problemId: number; language: JudgeLanguage },
  keys: JudgeCodeKey[],
): { sourceCode: string; updatedAt: string } | null {
  requirePluginEnabled(db, scope, "algorithms");
  requireManagedProblem(db, scope, input.problemId, input.language);
  const row = db.prepare(`
    SELECT code_blob_id, updated_at
    FROM algorithm_code_drafts
    WHERE workspace_id = ? AND problem_id = ? AND language = ?
  `).get(scope.workspaceId, input.problemId, input.language) as {
    code_blob_id: string;
    updated_at: string;
  } | undefined;
  if (!row) return null;
  return {
    sourceCode: readAlgorithmCodeBlob(db, scope, row.code_blob_id, keys),
    updatedAt: row.updated_at,
  };
}

export function prepareAlgorithmSubmission(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    operationId: string;
    sessionId: string;
    problemId: number;
    day: string;
    language: JudgeLanguage;
    sourceCode: string;
    planText?: string;
    preConfidence?: number | null;
    maxHintLevel?: number;
    reviewKind?: AlgorithmReviewKind;
    activeSeconds?: number;
    submissionKind?: "sample" | "formal";
    sourceTaskId?: number | null;
    transferSourceProblemId?: number | null;
  },
  key: JudgeCodeKey,
  retentionDays: number,
  decryptionKeys: JudgeCodeKey[] = [key],
): { submission: AlgorithmSubmission; sourceCode: string; problemRef: string; created: boolean } {
  requirePluginEnabled(db, scope, "algorithms");
  assertOperationId(input.operationId);
  assertOperationId(input.sessionId);
  const day = assertDateKey(input.day);
  const problem = requireManagedProblem(db, scope, input.problemId, input.language);
  const submissionKind = input.submissionKind === "sample" ? "sample" : "formal";
  const codeSha256 = createHash("sha256").update(input.sourceCode, "utf8").digest("hex");
  const existing = getSubmissionByOperationId(db, scope, input.operationId);
  if (existing) {
    const attemptContext = db.prepare(`
      SELECT session_id, source_task_id, transfer_source_problem_id
      FROM algorithm_attempts
      WHERE workspace_id = ? AND id = ?
    `).get(scope.workspaceId, existing.attemptId) as {
      session_id: string;
      source_task_id: number | null;
      transfer_source_problem_id: number | null;
    };
    if (
      existing.problemId !== problem.id
      || existing.language !== input.language
      || existing.submissionKind !== submissionKind
      || existing.codeSha256 !== codeSha256
      || attemptContext.session_id !== input.sessionId
      || (
        input.sourceTaskId !== undefined
        && input.sourceTaskId !== attemptContext.source_task_id
      )
      || (
        input.transferSourceProblemId !== undefined
        && input.transferSourceProblemId !== attemptContext.transfer_source_problem_id
      )
    ) {
      throw new Error("同一幂等键不能用于不同提交");
    }
    if (!existing.codeBlobId) throw new Error("该提交的代码已按保留策略删除");
    return {
      submission: existing,
      sourceCode: readAlgorithmCodeBlob(db, scope, existing.codeBlobId, decryptionKeys),
      problemRef: problem.judge_problem_ref,
      created: false,
    };
  }
  const preConfidence = input.preConfidence === null || input.preConfidence === undefined
    ? null
    : boundedInteger(input.preConfidence, 0, 3, "作答前信心");
  const reportedHintLevel = boundedInteger(input.maxHintLevel ?? 0, 0, 4, "提示级别");
  const maxHintLevel = Math.max(
    reportedHintLevel,
    getSessionMaxHintLevel(db, scope, input.sessionId),
  );
  const activeSeconds = boundedInteger(input.activeSeconds ?? 0, 0, 86_400, "有效作答时长");
  const reviewKind = normalizeReviewKind(input.reviewKind);
  const transferSource = resolveAlgorithmTransferSource(db, scope, {
    targetProblemId: problem.id,
    sourceProblemId: input.transferSourceProblemId,
    reviewKind,
    day,
  });
  const planText = (input.planText || "").trim().slice(0, 4_000);
  if (submissionKind === "formal" && planText.length < 10) {
    throw new Error("正式提交前需记录至少 10 个字符的解题思路");
  }
  if (submissionKind === "formal" && preConfidence === null) {
    throw new Error("正式提交前需记录作答前信心");
  }
  const sourceTaskId = resolveAlgorithmTaskId(db, scope, {
    day,
    problemId: problem.id,
    sourceTaskId: input.sourceTaskId,
  });
  const expiresAt = calculateCodeExpiry(retentionDays);

  const submissionId = db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO algorithm_attempts
        (workspace_id, problem_id, day, verdict, duration_minutes, max_hint_level,
         pre_confidence, independent, review_kind, source_verification, language,
         started_at, active_seconds, plan_text, outcome, session_id, source_task_id,
         transfer_source_problem_id)
      VALUES
        (?, ?, ?, 'OTHER', ?, ?, ?, 0, ?, 'provider_verified', ?,
         CURRENT_TIMESTAMP, ?, ?, 'in_progress', ?, ?, ?)
    `).run(
      scope.workspaceId,
      problem.id,
      day,
      Math.ceil(activeSeconds / 60),
      maxHintLevel,
      preConfidence,
      reviewKind,
      input.language,
      activeSeconds,
      planText,
      input.sessionId,
      sourceTaskId,
      transferSource?.problemId ?? null,
    );
    const attempt = db.prepare(`
      SELECT id, problem_id, language, review_kind, transfer_source_problem_id, ended_at
      FROM algorithm_attempts
      WHERE workspace_id = ? AND session_id = ?
    `).get(scope.workspaceId, input.sessionId) as {
      id: number;
      problem_id: number;
      language: string;
      review_kind: string;
      transfer_source_problem_id: number | null;
      ended_at: string | null;
    };
    if (
      attempt.problem_id !== problem.id
      || attempt.language !== input.language
      || attempt.review_kind !== reviewKind
      || attempt.transfer_source_problem_id !== (transferSource?.problemId ?? null)
    ) {
      throw new Error("同一训练会话不能切换题目、语言或训练类型");
    }
    if (attempt.ended_at) throw new Error("训练会话已结束，请开始新训练");
    db.prepare(`
      UPDATE algorithm_attempts
      SET active_seconds = MAX(active_seconds, ?),
          duration_minutes = MAX(duration_minutes, ?),
          plan_text = CASE WHEN ? != '' THEN ? ELSE plan_text END,
          max_hint_level = MAX(max_hint_level, ?),
          pre_confidence = COALESCE(pre_confidence, ?),
          source_task_id = COALESCE(source_task_id, ?),
          transfer_source_problem_id = COALESCE(transfer_source_problem_id, ?)
      WHERE workspace_id = ? AND id = ?
    `).run(
      activeSeconds,
      Math.ceil(activeSeconds / 60),
      planText,
      planText,
      maxHintLevel,
      preConfidence,
      sourceTaskId,
      transferSource?.problemId ?? null,
      scope.workspaceId,
      attempt.id,
    );
    const code = saveAlgorithmCodeBlob(db, scope, input.sourceCode, key, { expiresAt });
    const inserted = db.prepare(`
      INSERT INTO algorithm_submissions
        (workspace_id, attempt_id, problem_id, operation_id, code_blob_id,
         code_sha256, language, submission_kind, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CREATING')
    `).run(
      scope.workspaceId,
      attempt.id,
      problem.id,
      input.operationId,
      code.id,
      code.sha256,
      input.language,
      submissionKind,
    );
    return Number(inserted.lastInsertRowid);
  })();

  return {
    submission: getAlgorithmSubmission(db, scope, submissionId),
    sourceCode: input.sourceCode,
    problemRef: problem.judge_problem_ref,
    created: true,
  };
}

export function attachGatewaySubmission(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    submissionId: number;
    gatewaySubmissionId: string;
    status: "QUEUED" | "RUNNING";
    gatewayLatencyMs: number;
  },
): AlgorithmSubmission {
  requirePluginEnabled(db, scope, "algorithms");
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(input.gatewaySubmissionId)) {
    throw new Error("Judge submission ID 无效");
  }
  db.prepare(`
    UPDATE algorithm_submissions
    SET gateway_submission_id = ?, status = ?, gateway_latency_ms = ?,
        failure_code = '', updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND id = ?
      AND status IN ('CREATING', 'RETRYABLE_ERROR', 'QUEUED', 'RUNNING')
  `).run(
    input.gatewaySubmissionId,
    input.status,
    boundedInteger(input.gatewayLatencyMs, 0, 300_000, "Gateway 延迟"),
    scope.workspaceId,
    input.submissionId,
  );
  return getAlgorithmSubmission(db, scope, input.submissionId);
}

export function markGatewaySubmissionFailure(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    submissionId: number;
    failureCode: string;
    retryable: boolean;
  },
): AlgorithmSubmission {
  requirePluginEnabled(db, scope, "algorithms");
  db.prepare(`
    UPDATE algorithm_submissions
    SET status = ?, failure_code = ?, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND id = ? AND status NOT IN ('AC','WA','TLE','MLE','RE','CE','JE','CANCELLED')
  `).run(
    input.retryable ? "RETRYABLE_ERROR" : "JE",
    input.failureCode.trim().slice(0, 80),
    scope.workspaceId,
    input.submissionId,
  );
  return getAlgorithmSubmission(db, scope, input.submissionId);
}

export function applyGatewaySubmissionResult(
  db: Database.Database,
  scope: WorkspaceScope,
  submissionId: number,
  result: JudgeGatewayResult,
  retentionDays: number,
): AlgorithmSubmission {
  requirePluginEnabled(db, scope, "algorithms");
  const current = getAlgorithmSubmission(db, scope, submissionId);
  if (current.gatewaySubmissionId && current.gatewaySubmissionId !== result.id) {
    throw new Error("Judge submission ID 不匹配");
  }
  if (isTerminalAlgorithmSubmissionStatus(current.status) && current.status !== result.status) {
    throw new Error("算法提交已进入不可变终态");
  }
  const terminal = isTerminalAlgorithmSubmissionStatus(result.status);
  db.transaction(() => {
    db.prepare(`
      UPDATE algorithm_submissions
      SET status = ?, time_ms = ?, memory_kb = ?, compiler_excerpt = ?,
          public_feedback_json = ?, failure_code = ?, judged_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ?
    `).run(
      result.status,
      result.timeMs,
      result.memoryKb,
      result.compilerExcerpt.slice(0, 4_000),
      JSON.stringify(result.publicFeedback),
      result.failureCode.slice(0, 80),
      terminal ? (result.judgedAt || new Date().toISOString()) : null,
      scope.workspaceId,
      submissionId,
    );
    if (terminal && current.submissionKind === "formal") {
      finalizeAttempt(db, scope, current.attemptId, result.status);
    }
    if (terminal && retentionDays === 0 && current.codeBlobId) {
      redactAlgorithmCodeBlob(db, scope, current.codeBlobId);
    }
  })();
  return getAlgorithmSubmission(db, scope, submissionId);
}

export function getAlgorithmSubmission(
  db: Database.Database,
  scope: WorkspaceScope,
  id: number,
): AlgorithmSubmission {
  requirePluginEnabled(db, scope, "algorithms");
  const row = db.prepare(`
    SELECT id, attempt_id, problem_id, operation_id, gateway_submission_id,
           code_blob_id, code_sha256, language, submission_kind, status, time_ms, memory_kb,
           compiler_excerpt, public_feedback_json, failure_code, submitted_at, judged_at
    FROM algorithm_submissions
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as SubmissionRow | undefined;
  if (!row) throw new Error("算法提交不存在");
  return mapSubmission(row);
}

export function getSubmissionByOperationId(
  db: Database.Database,
  scope: WorkspaceScope,
  operationId: string,
): AlgorithmSubmission | null {
  const row = db.prepare(`
    SELECT id, attempt_id, problem_id, operation_id, gateway_submission_id,
           code_blob_id, code_sha256, language, submission_kind, status, time_ms, memory_kb,
           compiler_excerpt, public_feedback_json, failure_code, submitted_at, judged_at
    FROM algorithm_submissions
    WHERE workspace_id = ? AND operation_id = ?
  `).get(scope.workspaceId, operationId) as SubmissionRow | undefined;
  return row ? mapSubmission(row) : null;
}

export function getAlgorithmAttemptStudyContext(
  db: Database.Database,
  scope: WorkspaceScope,
  attemptId: number,
): AlgorithmAttemptStudyContext {
  requirePluginEnabled(db, scope, "algorithms");
  const normalizedId = boundedInteger(attemptId, 1, Number.MAX_SAFE_INTEGER, "训练记录");
  const row = db.prepare(`
    SELECT a.id, a.day, a.active_seconds, p.title
    FROM algorithm_attempts a
    JOIN algorithm_problems p
      ON p.workspace_id = a.workspace_id AND p.id = a.problem_id
    WHERE a.workspace_id = ? AND a.id = ?
  `).get(scope.workspaceId, normalizedId) as {
    id: number;
    day: string;
    active_seconds: number;
    title: string;
  } | undefined;
  if (!row) throw new Error("算法训练记录不存在");
  return {
    attemptId: row.id,
    day: row.day,
    title: row.title,
    activeSeconds: row.active_seconds,
  };
}

function finalizeAttempt(
  db: Database.Database,
  scope: WorkspaceScope,
  attemptId: number,
  status: JudgeStatus,
): void {
  const attempt = db.prepare(`
    SELECT id, problem_id, day, max_hint_level, review_kind, active_seconds,
           transfer_source_problem_id
    FROM algorithm_attempts
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, attemptId) as {
    id: number;
    problem_id: number;
    day: string;
    max_hint_level: number;
    review_kind: AlgorithmReviewKind;
    active_seconds: number;
    transfer_source_problem_id: number | null;
  };
  const verdict = judgeStatusToVerdict(status);
  if (!LEARNING_STATUSES.has(status)) {
    db.prepare(`
      UPDATE algorithm_attempts
      SET verdict = 'OTHER', outcome = ?, independent = 0,
          ended_at = CURRENT_TIMESTAMP,
          duration_minutes = MAX(duration_minutes, ?)
      WHERE workspace_id = ? AND id = ?
    `).run(
      status,
      Math.ceil(attempt.active_seconds / 60),
      scope.workspaceId,
      attempt.id,
    );
    return;
  }
  const independent = status === "AC" && attempt.max_hint_level <= 1;
  const prior = db.prepare(`
    SELECT day FROM algorithm_attempts
    WHERE workspace_id = ? AND problem_id = ? AND id != ? AND day < ?
    ORDER BY day DESC, id DESC LIMIT 1
  `).get(scope.workspaceId, attempt.problem_id, attempt.id, attempt.day) as { day: string } | undefined;
  const evidenceStatus = nextAlgorithmEvidenceStatus({
    verdict,
    independent,
    maxHintLevel: attempt.max_hint_level,
    reviewKind: attempt.review_kind,
    hasPriorCrossDayAttempt: Boolean(prior || attempt.transfer_source_problem_id),
  });
  const nextReview = nextAlgorithmReviewDay(attempt.day, {
    verdict,
    independent,
    maxHintLevel: attempt.max_hint_level,
    evidenceStatus,
  });
  db.prepare(`
    UPDATE algorithm_attempts
    SET verdict = ?, outcome = ?, independent = ?, ended_at = CURRENT_TIMESTAMP,
        duration_minutes = MAX(duration_minutes, ?),
        error_category = CASE
          WHEN error_category = '' AND ? != 'AC' THEN ?
          ELSE error_category
        END
    WHERE workspace_id = ? AND id = ?
  `).run(
    verdict,
    status,
    independent ? 1 : 0,
    Math.ceil(attempt.active_seconds / 60),
    status,
    statusErrorCategory(status),
    scope.workspaceId,
    attempt.id,
  );
  db.prepare(`
    UPDATE algorithm_problems
    SET evidence_status = ?, next_review = ?, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND id = ?
  `).run(evidenceStatus, nextReview, scope.workspaceId, attempt.problem_id);
  completePendingAlgorithmReview(db, scope, attempt);
  db.prepare(`
    DELETE FROM algorithm_reviews
    WHERE workspace_id = ? AND source_attempt_id = ? AND completed_at IS NULL
  `).run(scope.workspaceId, attempt.id);
  const reviewKind = nextReviewKind(evidenceStatus);
  db.prepare(`
    INSERT OR IGNORE INTO algorithm_reviews
      (workspace_id, problem_id, source_attempt_id, review_kind, due_day)
    VALUES (?, ?, ?, ?, ?)
  `).run(scope.workspaceId, attempt.problem_id, attempt.id, reviewKind, nextReview);

  if (status !== "AC") {
    db.prepare(`
      INSERT OR IGNORE INTO algorithm_error_cases
        (workspace_id, problem_id, attempt_id, error_category)
      VALUES (?, ?, ?, ?)
    `).run(scope.workspaceId, attempt.problem_id, attempt.id, statusErrorCategory(status));
  }
}

function completePendingAlgorithmReview(
  db: Database.Database,
  scope: WorkspaceScope,
  attempt: {
    id: number;
    problem_id: number;
    review_kind: AlgorithmReviewKind;
    transfer_source_problem_id?: number | null;
  },
): void {
  if (attempt.review_kind === "initial") return;
  const reviewedProblemId = attempt.transfer_source_problem_id ?? attempt.problem_id;
  const review = db.prepare(`
    SELECT id
    FROM algorithm_reviews
    WHERE workspace_id = ? AND problem_id = ? AND review_kind = ?
      AND completed_at IS NULL AND source_attempt_id != ?
    ORDER BY due_day ASC, id ASC
    LIMIT 1
  `).get(
    scope.workspaceId,
    reviewedProblemId,
    attempt.review_kind,
    attempt.id,
  ) as { id: number } | undefined;
  if (!review) return;
  db.prepare(`
    UPDATE algorithm_reviews
    SET completed_at = CURRENT_TIMESTAMP, attempt_id = ?
    WHERE workspace_id = ? AND id = ? AND completed_at IS NULL
  `).run(attempt.id, scope.workspaceId, review.id);
  if (attempt.transfer_source_problem_id) {
    db.prepare(`
      UPDATE algorithm_problems
      SET next_review = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ?
    `).run(scope.workspaceId, attempt.transfer_source_problem_id);
  }
}

function resolveAlgorithmTaskId(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { day: string; problemId: number; sourceTaskId?: number | null },
): number | null {
  if (input.sourceTaskId === null) return null;
  const requestedId = input.sourceTaskId === undefined
    ? null
    : boundedInteger(input.sourceTaskId, 1, Number.MAX_SAFE_INTEGER, "来源任务");
  const row = requestedId === null
    ? db.prepare(`
        SELECT id
        FROM day_tasks
        WHERE workspace_id = ? AND day = ? AND source_type = 'plugin:algorithms'
          AND source_id = ?
        ORDER BY done ASC, id DESC
        LIMIT 1
      `).get(scope.workspaceId, input.day, String(input.problemId)) as { id: number } | undefined
    : db.prepare(`
        SELECT id
        FROM day_tasks
        WHERE workspace_id = ? AND id = ? AND day = ?
          AND source_type = 'plugin:algorithms' AND source_id = ?
      `).get(
        scope.workspaceId,
        requestedId,
        input.day,
        String(input.problemId),
      ) as { id: number } | undefined;
  if (requestedId !== null && !row) throw new Error("来源任务与当前算法训练不匹配");
  return row?.id ?? null;
}

function requireManagedProblem(
  db: Database.Database,
  scope: WorkspaceScope,
  problemId: number,
  language: string,
): ManagedProblemRow {
  const normalizedId = Math.round(Number(problemId));
  const row = db.prepare(`
    SELECT id, title, judge_problem_ref, supported_languages_json
    FROM algorithm_problems
    WHERE workspace_id = ? AND id = ? AND problem_mode = 'managed'
  `).get(scope.workspaceId, normalizedId) as ManagedProblemRow | undefined;
  if (!row || !row.judge_problem_ref) throw new Error("该题不支持 Ascend 正式评测");
  const languages = parseLanguages(row.supported_languages_json);
  if (!languages.includes(language as JudgeLanguage)) throw new Error("该题不支持所选语言");
  return row;
}

function parseLanguages(value: string): JudgeLanguage[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((language): language is JudgeLanguage => (
        JUDGE_LANGUAGES.includes(language as JudgeLanguage)
      ))
      : [];
  } catch {
    return [];
  }
}

function mapSubmission(row: SubmissionRow): AlgorithmSubmission {
  let publicFeedback: JudgeGatewayResult["publicFeedback"] = [];
  try {
    const parsed = JSON.parse(row.public_feedback_json || "[]");
    if (Array.isArray(parsed)) publicFeedback = parsed;
  } catch {
    publicFeedback = [];
  }
  return {
    id: row.id,
    attemptId: row.attempt_id,
    problemId: row.problem_id,
    operationId: row.operation_id,
    gatewaySubmissionId: row.gateway_submission_id,
    codeBlobId: row.code_blob_id,
    codeSha256: row.code_sha256,
    language: JUDGE_LANGUAGES.includes(row.language as JudgeLanguage)
      ? row.language as JudgeLanguage
      : "cpp17",
    submissionKind: row.submission_kind === "sample" ? "sample" : "formal",
    status: normalizeJudgeStatus(row.status),
    timeMs: row.time_ms,
    memoryKb: row.memory_kb,
    compilerExcerpt: row.compiler_excerpt,
    publicFeedback,
    failureCode: row.failure_code,
    submittedAt: row.submitted_at,
    judgedAt: row.judged_at,
  };
}

function normalizeJudgeStatus(value: string): JudgeStatus {
  const statuses: JudgeStatus[] = [
    "CREATING", "QUEUED", "RUNNING", "AC", "WA", "TLE", "MLE",
    "RE", "CE", "JE", "CANCELLED", "RETRYABLE_ERROR",
  ];
  return statuses.includes(value as JudgeStatus) ? value as JudgeStatus : "JE";
}

function normalizeReviewKind(value: AlgorithmReviewKind | undefined): AlgorithmReviewKind {
  return ["initial", "original_retest", "isomorphic_variant", "unseen_variant"].includes(value || "")
    ? value as AlgorithmReviewKind
    : "initial";
}

function nextReviewKind(status: AlgorithmEvidenceStatus): AlgorithmReviewKind {
  if (status === "guided_completed" || status === "attempted") return "original_retest";
  if (status === "delayed_stable") return "unseen_variant";
  if (status === "transfer_verified") return "original_retest";
  return "original_retest";
}

function judgeStatusToVerdict(status: JudgeStatus): AlgorithmVerdict {
  if (["AC", "WA", "CE", "TLE", "MLE", "RE"].includes(status)) {
    return status as AlgorithmVerdict;
  }
  return "OTHER";
}

function statusErrorCategory(status: JudgeStatus): string {
  if (status === "CE") return "编译错误";
  if (status === "TLE") return "复杂度或死循环";
  if (status === "MLE") return "空间复杂度";
  if (status === "RE") return "运行时错误";
  if (status === "WA") return "逻辑或边界错误";
  return "评测异常";
}

function assertOperationId(value: string): void {
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(value)) throw new Error("幂等键无效");
}

function boundedInteger(value: number, min: number, max: number, label: string): number {
  const normalized = Math.round(Number(value));
  if (!Number.isFinite(normalized) || normalized < min || normalized > max) {
    throw new Error(`${label}需在 ${min}-${max} 之间`);
  }
  return normalized;
}
