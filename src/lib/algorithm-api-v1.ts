import { randomUUID } from "node:crypto";
import { z, type ZodType } from "zod";
import { AlgorithmDraftConflictError } from "./repo/algorithm-submissions";

export const ALGORITHM_API_VERSION = 1 as const;

const operationId = z.string().trim().regex(/^[A-Za-z0-9:_-]{8,160}$/);
const positiveId = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const language = z.enum(["cpp17", "python3"]);
const reviewKind = z.enum(["initial", "original_retest", "isomorphic_variant", "unseen_variant"]);

export const draftSaveSchema = z.object({
  problemId: positiveId,
  language,
  sourceCode: z.string().max(96 * 1024),
  baseRevision: z.coerce.number().int().min(0),
  operationId,
  versionKind: z.enum(["autosave", "manual"]).default("autosave"),
  label: z.string().trim().max(120).default("VS Code 自动保存"),
});

export const practiceSessionStartSchema = z.object({
  sessionId: operationId,
  problemId: positiveId,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  language,
  planText: z.string().max(4_000).optional(),
  preConfidence: z.coerce.number().int().min(0).max(3).nullable().optional(),
  reviewKind: reviewKind.default("initial"),
  transferSourceProblemId: positiveId.nullable().optional(),
});

export const practiceActivitySchema = z.object({
  sessionId: operationId,
  activeSeconds: z.coerce.number().int().min(0).max(86_400),
  planText: z.string().max(4_000).optional(),
  preConfidence: z.coerce.number().int().min(0).max(3).nullable().optional(),
});

export const practiceSessionAbandonSchema = z.object({
  sessionId: operationId,
});

export const practiceFinishSchema = z.object({
  sessionId: operationId,
  verdict: z.enum(["AC", "WA", "CE", "TLE", "MLE", "RE", "OTHER"]),
  activeSeconds: z.coerce.number().int().min(0).max(86_400).optional(),
  maxHintLevel: z.coerce.number().int().min(0).max(4).optional(),
  errorCategory: z.string().max(80).optional(),
  reflection: z.string().max(2_000).optional(),
  reviewChoice: z.enum(["schedule", "stop", "unchanged"]).optional(),
  attemptDayMode: z.enum(["now", "backfill"]).optional(),
  plan: z.object({
    taskId: z.string().trim().min(1).max(160),
    expectedVersion: z.coerce.number().int().min(0),
  }).optional(),
});

export const practiceHintSchema = z.object({
  problemId: positiveId,
  sessionId: operationId,
  level: z.coerce.number().int().min(1).max(4),
});

export const algorithmPlanCreateSchema = z.object({
  operationId,
  problemIds: z.array(positiveId).min(1).max(200),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const algorithmPlanUpdateSchema = z.object({
  operationId,
  expectedVersion: z.coerce.number().int().min(0),
  targetDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const algorithmPlanDeleteSchema = z.object({
  operationId,
  expectedVersion: z.coerce.number().int().min(0),
});

export const practiceSubmissionSchema = z.object({
  operationId,
  sessionId: operationId,
  problemId: positiveId,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  language,
  sourceCode: z.string().min(1).max(64 * 1024),
  planText: z.string().max(4_000).optional(),
  preConfidence: z.coerce.number().int().min(0).max(3).nullable().optional(),
  maxHintLevel: z.coerce.number().int().min(0).max(4).optional(),
  reviewKind: reviewKind.optional(),
  activeSeconds: z.coerce.number().int().min(0).max(86_400).optional(),
  submissionKind: z.enum(["sample", "formal"]).default("formal"),
  transferSourceProblemId: positiveId.nullable().optional(),
});

export async function readAlgorithmApiJson<T>(
  request: Request,
  schema: ZodType<T>,
  maxBytes = 96 * 1024,
): Promise<T> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > maxBytes) throw new AlgorithmApiError("BODY_TOO_LARGE", "请求内容过大", 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new AlgorithmApiError("BODY_TOO_LARGE", "请求内容过大", 413);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AlgorithmApiError("INVALID_JSON", "请求 JSON 无效", 400);
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AlgorithmApiError("VALIDATION_FAILED", "请求字段无效", 400, false, {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })).slice(0, 12),
    });
  }
  return result.data;
}

export function algorithmApiSuccess(request: Request, data: unknown, status = 200): Response {
  const requestId = algorithmRequestId(request);
  return Response.json({ ok: true, apiVersion: ALGORITHM_API_VERSION, requestId, data }, {
    status,
    headers: apiHeaders(requestId),
  });
}

export function algorithmApiFailure(request: Request, error: unknown): Response {
  const requestId = algorithmRequestId(request);
  const normalized = normalizeAlgorithmApiError(error);
  return Response.json({
    ok: false,
    apiVersion: ALGORITHM_API_VERSION,
    requestId,
    error: {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      details: normalized.details,
    },
  }, {
    status: normalized.status,
    headers: apiHeaders(requestId),
  });
}

export class AlgorithmApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AlgorithmApiError";
  }
}

function normalizeAlgorithmApiError(error: unknown): AlgorithmApiError {
  if (error instanceof AlgorithmApiError) return error;
  if (error instanceof AlgorithmDraftConflictError) {
    return new AlgorithmApiError(error.code, error.message, error.status, false, { current: error.current });
  }
  const message = error instanceof Error ? error.message : "Ascend 算法 API 请求失败";
  if (/token|required|expired|授权|权限/i.test(message)) {
    return new AlgorithmApiError("AUTH_REQUIRED", "设备授权无效或已经过期", 401);
  }
  if (/扩展未启用/.test(message)) return new AlgorithmApiError("PLUGIN_DISABLED", message, 403);
  if (/不存在/.test(message)) return new AlgorithmApiError("NOT_FOUND", message, 404);
  const declared = error as { code?: unknown; status?: unknown; retryable?: unknown };
  const status = Number(declared?.status || 0);
  if (status >= 400 && status <= 599) {
    return new AlgorithmApiError(
      typeof declared.code === "string" ? declared.code : "REQUEST_FAILED",
      message,
      status,
      declared.retryable === true,
    );
  }
  return new AlgorithmApiError("BAD_REQUEST", message, 400);
}

function algorithmRequestId(request: Request): string {
  const supplied = request.headers.get("x-request-id")?.trim() || "";
  return /^[A-Za-z0-9:_-]{8,120}$/.test(supplied) ? supplied : randomUUID();
}

function apiHeaders(requestId: string): HeadersInit {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
  };
}
