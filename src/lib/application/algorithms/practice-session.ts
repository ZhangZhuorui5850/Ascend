import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../../access-context";
import { assertDateKey, todayKey } from "../../dates";
import type { JudgeLanguage } from "../../judge-gateway";
import {
  ALGORITHM_REVIEW_KINDS,
  getAlgorithmProblem,
  type AlgorithmAttempt,
  type AlgorithmReviewKind,
} from "../../repo/algorithms";
import { requirePluginEnabled } from "../../repo/plugins";
import { recordAlgorithmAttemptCommand } from "./record-attempt";
import { finalizeAlgorithmTrainingResult } from "./finalize-training-result";

export type PracticeClientKind = "web" | "vscode" | "agent";

export type AlgorithmPracticeSession = {
  id: number;
  sessionId: string;
  problemId: number;
  day: string;
  language: JudgeLanguage;
  clientKind: PracticeClientKind;
  deviceId: string;
  activeSeconds: number;
  planText: string;
  preConfidence: number | null;
  maxHintLevel: number;
  reviewKind: AlgorithmReviewKind;
  transferSourceProblemId: number | null;
  outcome: string;
  startedAt: string;
  endedAt: string | null;
};

export function startPracticeSession(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    sessionId: string;
    problemId: number;
    day: string;
    language: JudgeLanguage;
    clientKind: PracticeClientKind;
    deviceId?: string;
    planText?: string;
    preConfidence?: number | null;
    reviewKind?: AlgorithmReviewKind;
    transferSourceProblemId?: number | null;
  },
): AlgorithmPracticeSession {
  requirePluginEnabled(db, scope, "algorithms");
  const sessionId = normalizeSessionId(input.sessionId);
  const problem = getAlgorithmProblem(db, scope, input.problemId);
  const day = assertDateKey(input.day);
  const language = normalizeLanguage(input.language, problem.supportedLanguages);
  const clientKind = normalizeClientKind(input.clientKind);
  const reviewKind = normalizeReviewKind(input.reviewKind);
  const preConfidence = normalizeConfidence(input.preConfidence);
  const planText = String(input.planText || "").trim().slice(0, 4_000);
  const transferSourceProblemId = normalizeOptionalId(input.transferSourceProblemId);
  const deviceId = String(input.deviceId || "").trim().slice(0, 160);

  db.prepare(`
    INSERT OR IGNORE INTO algorithm_attempts
      (workspace_id, problem_id, day, verdict, duration_minutes, max_hint_level,
       pre_confidence, independent, review_kind, source_verification, language,
       started_at, active_seconds, plan_text, outcome, session_id,
       transfer_source_problem_id, client_kind, device_id)
    VALUES
      (?, ?, ?, 'OTHER', 0, 0, ?, 0, ?, 'user_reported', ?,
       CURRENT_TIMESTAMP, 0, ?, 'in_progress', ?, ?, ?, ?)
  `).run(
    scope.workspaceId,
    problem.id,
    day,
    preConfidence,
    reviewKind,
    language,
    planText,
    sessionId,
    transferSourceProblemId,
    clientKind,
    deviceId,
  );

  const session = getPracticeSession(db, scope, sessionId);
  if (
    session.problemId !== problem.id
    || session.day !== day
    || session.language !== language
    || session.reviewKind !== reviewKind
    || session.transferSourceProblemId !== transferSourceProblemId
    || session.clientKind !== clientKind
  ) {
    throw new Error("同一训练会话不能切换题目、日期、语言或训练类型");
  }
  if (session.endedAt) throw new Error("训练会话已经结束");
  return session;
}

export function recordPracticeActivity(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    sessionId: string;
    activeSeconds: number;
    planText?: string;
    preConfidence?: number | null;
  },
): AlgorithmPracticeSession {
  requirePluginEnabled(db, scope, "algorithms");
  const session = getPracticeSession(db, scope, normalizeSessionId(input.sessionId));
  if (session.endedAt) return session;
  const activeSeconds = boundedInteger(input.activeSeconds, 0, 86_400, "有效作答时长");
  const planText = input.planText === undefined ? "" : input.planText.trim().slice(0, 4_000);
  const preConfidence = normalizeConfidence(input.preConfidence);
  db.prepare(`
    UPDATE algorithm_attempts
    SET active_seconds = MAX(active_seconds, ?),
        duration_minutes = MAX(duration_minutes, ?),
        plan_text = CASE WHEN ? != '' THEN ? ELSE plan_text END,
        pre_confidence = COALESCE(pre_confidence, ?)
    WHERE workspace_id = ? AND session_id = ? AND outcome = 'in_progress'
  `).run(
    activeSeconds,
    Math.ceil(activeSeconds / 60),
    planText,
    planText,
    preConfidence,
    scope.workspaceId,
    session.sessionId,
  );
  return getPracticeSession(db, scope, session.sessionId);
}

export function finishPracticeSession(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    sessionId: string;
    verdict: string;
    activeSeconds?: number;
    maxHintLevel?: number;
    errorCategory?: string;
    reflection?: string;
    reviewChoice?: "schedule" | "stop" | "unchanged";
    attemptDayMode?: "now" | "backfill";
    plan?: { taskId: string; expectedVersion: number };
  },
): AlgorithmAttempt {
  const session = getPracticeSession(db, scope, normalizeSessionId(input.sessionId));
  const activeSeconds = Math.max(session.activeSeconds, boundedInteger(input.activeSeconds ?? 0, 0, 86_400, "有效作答时长"));
  if (input.plan) {
    return finalizeAlgorithmTrainingResult(db, scope, {
      operationId: session.sessionId,
      problemId: session.problemId,
      attemptDay: input.attemptDayMode === "backfill" ? session.day : todayKey(),
      verdict: input.verdict,
      durationMinutes: Math.ceil(activeSeconds / 60),
      maxHintLevel: Math.max(session.maxHintLevel, boundedInteger(input.maxHintLevel ?? 0, 0, 4, "提示级别")),
      preConfidence: session.preConfidence,
      reviewKind: session.reviewKind,
      transferSourceProblemId: session.transferSourceProblemId,
      errorCategory: input.errorCategory,
      reflection: input.reflection,
      reviewChoice: input.reviewChoice,
      plan: {
        ...input.plan,
        disposition: input.verdict === "AC" ? "complete" : "keep",
      },
    });
  }
  return recordAlgorithmAttemptCommand(db, scope, {
    operationId: session.sessionId,
    problemId: session.problemId,
    day: session.day,
    verdict: input.verdict,
    durationMinutes: Math.ceil(activeSeconds / 60),
    maxHintLevel: Math.max(session.maxHintLevel, boundedInteger(input.maxHintLevel ?? 0, 0, 4, "提示级别")),
    preConfidence: session.preConfidence,
    reviewKind: session.reviewKind,
    transferSourceProblemId: session.transferSourceProblemId,
    errorCategory: input.errorCategory,
    reflection: input.reflection,
  });
}

export function abandonPracticeSession(
  db: Database.Database,
  scope: WorkspaceScope,
  sessionId: string,
): AlgorithmPracticeSession {
  requirePluginEnabled(db, scope, "algorithms");
  const session = getPracticeSession(db, scope, normalizeSessionId(sessionId));
  if (session.endedAt) return session;
  db.prepare(`
    UPDATE algorithm_attempts
    SET outcome = 'abandoned', ended_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND session_id = ? AND outcome = 'in_progress'
  `).run(scope.workspaceId, session.sessionId);
  return getPracticeSession(db, scope, session.sessionId);
}

export function getPracticeSession(
  db: Database.Database,
  scope: WorkspaceScope,
  sessionId: string,
): AlgorithmPracticeSession {
  const row = db.prepare(`
    SELECT id, session_id AS sessionId, problem_id AS problemId, day, language,
           client_kind AS clientKind, device_id AS deviceId,
           active_seconds AS activeSeconds, plan_text AS planText,
           pre_confidence AS preConfidence, max_hint_level AS maxHintLevel,
           review_kind AS reviewKind,
           transfer_source_problem_id AS transferSourceProblemId,
           outcome, started_at AS startedAt, ended_at AS endedAt
    FROM algorithm_attempts
    WHERE workspace_id = ? AND session_id = ?
  `).get(scope.workspaceId, normalizeSessionId(sessionId)) as AlgorithmPracticeSession | undefined;
  if (!row) throw new Error("训练会话不存在");
  return {
    ...row,
    language: row.language === "python3" ? "python3" : "cpp17",
    clientKind: normalizeClientKind(row.clientKind),
    reviewKind: normalizeReviewKind(row.reviewKind),
  };
}

function normalizeSessionId(value: string): string {
  const sessionId = String(value || "").trim();
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(sessionId)) throw new Error("训练会话 ID 无效");
  return sessionId;
}

function normalizeClientKind(value: string): PracticeClientKind {
  if (value === "vscode" || value === "agent") return value;
  return "web";
}

function normalizeLanguage(value: JudgeLanguage, supported: JudgeLanguage[]): JudgeLanguage {
  const available = supported.length ? supported : ["cpp17"];
  if ((value === "cpp17" || value === "python3") && available.includes(value)) return value;
  throw new Error("该题不支持所选语言");
}

function normalizeReviewKind(value: string | undefined): AlgorithmReviewKind {
  return ALGORITHM_REVIEW_KINDS.includes(value as AlgorithmReviewKind)
    ? value as AlgorithmReviewKind
    : "initial";
}

function normalizeConfidence(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return boundedInteger(value, 0, 3, "作答前信心");
}

function normalizeOptionalId(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return boundedInteger(value, 1, Number.MAX_SAFE_INTEGER, "关联题目 ID");
}

function boundedInteger(value: number, min: number, max: number, label: string): number {
  const parsed = Math.round(Number(value));
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label}无效`);
  return parsed;
}
