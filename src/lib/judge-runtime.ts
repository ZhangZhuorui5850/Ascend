import type Database from "better-sqlite3";
import type { WorkspaceScope } from "./access-context";
import {
  getJudgeCodeRetentionDays,
  loadJudgeCodeKey,
  loadJudgeCodeKeys,
} from "./algorithm-code-crypto";
import {
  JudgeGatewayClient,
  JudgeGatewayError,
  loadJudgeGatewayConfig,
  type JudgeLanguage,
} from "./judge-gateway";
import {
  applyGatewaySubmissionResult,
  attachGatewaySubmission,
  getAlgorithmSubmission,
  markGatewaySubmissionFailure,
  prepareAlgorithmSubmission,
  type AlgorithmSubmission,
} from "./repo/algorithm-submissions";
import {
  getAlgorithmPilotEnrollment,
  isAlgorithmPilotRequired,
  requireAlgorithmPilotJudgeAccess,
  type AlgorithmPilotStatus,
} from "./repo/algorithm-pilot";
import type { AlgorithmReviewKind } from "./repo/algorithms";

let cachedClient: JudgeGatewayClient | null = null;
let cachedFingerprint = "";

export type JudgeRuntimeAvailability = {
  configured: boolean;
  submissionAllowed: boolean;
  reason: string;
  languages: JudgeLanguage[];
  retentionDays: number;
  pilotStatus: AlgorithmPilotStatus;
};

export function getJudgeRuntimeAvailability(
  db?: Database.Database,
  scope?: WorkspaceScope,
): JudgeRuntimeAvailability {
  const pilotStatus = db && scope
    ? getAlgorithmPilotEnrollment(db, scope).status
    : "not_requested";
  try {
    const config = loadJudgeGatewayConfig();
    const key = loadJudgeCodeKey();
    if (!config) {
      return {
        configured: false,
        submissionAllowed: false,
        reason: "尚未配置独立 Judge Gateway",
        languages: [],
        retentionDays: 0,
        pilotStatus,
      };
    }
    if (!key) {
      return {
        configured: false,
        submissionAllowed: false,
        reason: "尚未配置独立代码加密密钥",
        languages: [],
        retentionDays: 0,
        pilotStatus,
      };
    }
    const pilotRequired = isAlgorithmPilotRequired();
    const pilotVerified = !pilotRequired || (Boolean(db && scope) && pilotStatus === "approved");
    return {
      configured: true,
      submissionAllowed: pilotVerified,
      reason: pilotVerified
        ? ""
        : db && scope
          ? "在线评测试点尚未获批；题目、提示和草稿仍可使用"
          : "在线评测试点准入状态无法验证",
      languages: ["cpp17", "python3"],
      retentionDays: getJudgeCodeRetentionDays(),
      pilotStatus,
    };
  } catch {
    return {
      configured: false,
      submissionAllowed: false,
      reason: "Judge 配置无效，请由管理员检查",
      languages: [],
      retentionDays: 0,
      pilotStatus,
    };
  }
}

export async function submitAlgorithmCode(
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
): Promise<AlgorithmSubmission> {
  requireAlgorithmPilotJudgeAccess(db, scope);
  const key = requireCodeKey();
  const keys = loadJudgeCodeKeys();
  const retentionDays = getJudgeCodeRetentionDays();
  const prepared = prepareAlgorithmSubmission(db, scope, input, key, retentionDays, keys);
  if (
    prepared.submission.gatewaySubmissionId
    || !["CREATING", "RETRYABLE_ERROR"].includes(prepared.submission.status)
  ) {
    return prepared.submission;
  }
  const client = requireGatewayClient();
  const startedAt = Date.now();
  try {
    const remote = await client.createSubmission({
      idempotencyKey: input.operationId,
      problemRef: prepared.problemRef,
      language: input.language,
      sourceCode: prepared.sourceCode,
      mode: input.submissionKind || "formal",
    });
    return attachGatewaySubmission(db, scope, {
      submissionId: prepared.submission.id,
      gatewaySubmissionId: remote.id,
      status: remote.status,
      gatewayLatencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    const normalized = error instanceof JudgeGatewayError
      ? error
      : new JudgeGatewayError("Judge Gateway 创建提交失败", {
        code: "CREATE_FAILED",
        retryable: true,
      });
    if (normalized.retryable) {
      return markGatewaySubmissionFailure(db, scope, {
        submissionId: prepared.submission.id,
        failureCode: normalized.code,
        retryable: true,
      });
    }
    return applyGatewaySubmissionResult(db, scope, prepared.submission.id, {
      id: "",
      status: "JE",
      timeMs: null,
      memoryKb: null,
      compilerExcerpt: "",
      publicFeedback: [],
      failureCode: normalized.code,
      judgedAt: new Date().toISOString(),
    }, retentionDays);
  }
}

export async function refreshAlgorithmSubmission(
  db: Database.Database,
  scope: WorkspaceScope,
  submissionId: number,
): Promise<AlgorithmSubmission> {
  requireAlgorithmPilotJudgeAccess(db, scope);
  const submission = getAlgorithmSubmission(db, scope, submissionId);
  if (isTerminal(submission.status)) return submission;
  if (!submission.gatewaySubmissionId) return submission;
  const client = requireGatewayClient();
  try {
    const result = await client.getSubmission(submission.gatewaySubmissionId);
    return applyGatewaySubmissionResult(
      db,
      scope,
      submission.id,
      result,
      getJudgeCodeRetentionDays(),
    );
  } catch (error) {
    const normalized = error instanceof JudgeGatewayError
      ? error
      : new JudgeGatewayError("Judge Gateway 查询失败", {
        code: "POLL_FAILED",
        retryable: true,
      });
    return markGatewaySubmissionFailure(db, scope, {
      submissionId: submission.id,
      failureCode: normalized.code,
      retryable: true,
    });
  }
}

function requireGatewayClient(): JudgeGatewayClient {
  const config = loadJudgeGatewayConfig();
  if (!config) throw new Error("尚未配置独立 Judge Gateway");
  const fingerprint = `${config.baseUrl}\0${config.token}\0${config.timeoutMs}`;
  if (!cachedClient || fingerprint !== cachedFingerprint) {
    cachedClient = new JudgeGatewayClient(config, (input, init) => fetch(input, init));
    cachedFingerprint = fingerprint;
  }
  return cachedClient;
}

function requireCodeKey() {
  const key = loadJudgeCodeKey();
  if (!key) throw new Error("尚未配置代码加密密钥");
  return key;
}

function isTerminal(status: AlgorithmSubmission["status"]): boolean {
  return ["AC", "WA", "TLE", "MLE", "RE", "CE", "JE", "CANCELLED"].includes(status);
}
