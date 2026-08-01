export const JUDGE_LANGUAGES = ["cpp17", "python3"] as const;
export const JUDGE_STATUSES = [
  "CREATING",
  "QUEUED",
  "RUNNING",
  "AC",
  "WA",
  "TLE",
  "MLE",
  "RE",
  "CE",
  "JE",
  "CANCELLED",
  "RETRYABLE_ERROR",
] as const;

export type JudgeLanguage = (typeof JUDGE_LANGUAGES)[number];
export type JudgeStatus = (typeof JUDGE_STATUSES)[number];

export type JudgePublicFeedback = {
  caseIndex: number;
  visibility: "public";
  status: Exclude<JudgeStatus, "CREATING" | "QUEUED" | "RUNNING" | "RETRYABLE_ERROR">;
  stdoutExcerpt: string;
  expectedExcerpt: string;
};

export type JudgeGatewayResult = {
  id: string;
  status: JudgeStatus;
  timeMs: number | null;
  memoryKb: number | null;
  compilerExcerpt: string;
  publicFeedback: JudgePublicFeedback[];
  failureCode: string;
  judgedAt: string | null;
};

export type JudgeGatewayConfig = {
  baseUrl: string;
  token: string;
  timeoutMs: number;
};

type JudgeGatewayEnv = {
  NODE_ENV?: string;
  ASCEND_JUDGE_GATEWAY_URL?: string;
  ASCEND_JUDGE_GATEWAY_TOKEN?: string;
  ASCEND_JUDGE_GATEWAY_TIMEOUT_MS?: string;
};

export class JudgeGatewayError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(
    message: string,
    input: { code: string; retryable: boolean; status?: number | null },
  ) {
    super(message);
    this.name = "JudgeGatewayError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.status = input.status ?? null;
  }
}

export function loadJudgeGatewayConfig(
  env: JudgeGatewayEnv = process.env,
): JudgeGatewayConfig | null {
  const rawUrl = env.ASCEND_JUDGE_GATEWAY_URL?.trim();
  const token = env.ASCEND_JUDGE_GATEWAY_TOKEN?.trim();
  if (!rawUrl && !token) return null;
  if (!rawUrl || !token) throw new Error("Judge Gateway URL 与 token 必须同时配置");
  const url = new URL(rawUrl);
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && isLoopback))) {
    throw new Error("生产 Judge Gateway 必须使用不含账号信息的 HTTPS URL");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  const timeoutMs = Number(env.ASCEND_JUDGE_GATEWAY_TIMEOUT_MS || "5000");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error("ASCEND_JUDGE_GATEWAY_TIMEOUT_MS 需在 1000-30000 之间");
  }
  return { baseUrl: url.toString().replace(/\/$/, ""), token, timeoutMs };
}

export class JudgeGatewayClient {
  private consecutiveFailures = 0;
  private openUntil = 0;

  constructor(
    private readonly config: JudgeGatewayConfig,
    private readonly request: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async createSubmission(input: {
    idempotencyKey: string;
    problemRef: string;
    language: JudgeLanguage;
    sourceCode: string;
    mode?: "sample" | "formal";
  }): Promise<{ id: string; status: "QUEUED" | "RUNNING" }> {
    assertOperationId(input.idempotencyKey);
    if (!input.problemRef.trim() || input.problemRef.length > 160) throw new Error("Judge 题目标识无效");
    if (!JUDGE_LANGUAGES.includes(input.language)) throw new Error("不支持的评测语言");
    const body = await this.call("/v1/submissions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        problemRef: input.problemRef,
        language: input.language,
        sourceCode: input.sourceCode,
        mode: input.mode || "formal",
      }),
    });
    const record = asObject(body);
    const id = boundedText(record.id, 160);
    const status = normalizeStatus(record.status);
    if (!id || (status !== "QUEUED" && status !== "RUNNING")) {
      throw new JudgeGatewayError("Judge Gateway 创建响应无效", {
        code: "INVALID_RESPONSE",
        retryable: true,
      });
    }
    return { id, status };
  }

  async getSubmission(id: string): Promise<JudgeGatewayResult> {
    if (!/^[A-Za-z0-9:_-]{8,160}$/.test(id)) throw new Error("Judge submission ID 无效");
    const record = asObject(await this.call(`/v1/submissions/${encodeURIComponent(id)}`, {
      method: "GET",
    }));
    return {
      id: boundedText(record.id, 160),
      status: normalizeStatus(record.status),
      timeMs: nullableBoundedInteger(record.timeMs, 0, 86_400_000),
      memoryKb: nullableBoundedInteger(record.memoryKb, 0, 16 * 1024 * 1024),
      compilerExcerpt: boundedText(record.compilerExcerpt, 4_000),
      publicFeedback: normalizePublicFeedback(record.publicFeedback),
      failureCode: boundedText(record.failureCode, 80),
      judgedAt: normalizeTimestamp(record.judgedAt),
    };
  }

  async health(): Promise<{ ok: boolean; queueDepth: number | null }> {
    const record = asObject(await this.call("/health", { method: "GET" }));
    return {
      ok: record.ok === true,
      queueDepth: nullableBoundedInteger(record.queueDepth, 0, 1_000_000),
    };
  }

  private async call(pathname: string, init: RequestInit): Promise<unknown> {
    if (this.openUntil > this.now()) {
      throw new JudgeGatewayError("Judge Gateway 熔断中，请稍后重试", {
        code: "CIRCUIT_OPEN",
        retryable: true,
      });
    }
    let response: Response;
    try {
      response = await this.request(`${this.config.baseUrl}${pathname}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.config.token}`,
          accept: "application/json",
          ...init.headers,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      this.noteFailure();
      throw new JudgeGatewayError(
        error instanceof DOMException && error.name === "TimeoutError"
          ? "Judge Gateway 请求超时"
          : "Judge Gateway 暂时不可达",
        { code: "UNREACHABLE", retryable: true },
      );
    }
    let text: string;
    try {
      text = await readBoundedResponseText(response, 128 * 1024);
    } catch {
      this.noteFailure();
      throw new JudgeGatewayError("Judge Gateway 响应超出上限", {
        code: "RESPONSE_TOO_LARGE",
        retryable: true,
        status: response.status,
      });
    }
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        this.noteFailure();
        throw new JudgeGatewayError("Judge Gateway 返回了无效 JSON", {
          code: "INVALID_RESPONSE",
          retryable: true,
          status: response.status,
        });
      }
    }
    if (!response.ok) {
      const retryable = response.status === 429 || response.status === 503 || response.status >= 500;
      if (retryable) this.noteFailure();
      const gatewayCode = boundedText(asObject(body).code, 80);
      throw new JudgeGatewayError(
        response.status === 503 ? "Judge 队列已满，请稍后重试" : "Judge Gateway 拒绝了请求",
        {
          code: gatewayCode || `HTTP_${response.status}`,
          retryable,
          status: response.status,
        },
      );
    }
    this.consecutiveFailures = 0;
    this.openUntil = 0;
    return body;
  }

  private noteFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= 3) this.openUntil = this.now() + 30_000;
  }
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("response too large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("response too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function normalizeStatus(value: unknown): JudgeStatus {
  return JUDGE_STATUSES.includes(value as JudgeStatus) ? value as JudgeStatus : "JE";
}

function normalizePublicFeedback(value: unknown): JudgePublicFeedback[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((raw) => {
    const row = asObject(raw);
    if (row.visibility !== "public") return [];
    const caseIndex = nullableBoundedInteger(row.caseIndex, 0, 10_000);
    if (caseIndex === null) return [];
    const status = normalizeStatus(row.status);
    if (["CREATING", "QUEUED", "RUNNING", "RETRYABLE_ERROR"].includes(status)) return [];
    return [{
      caseIndex,
      visibility: "public" as const,
      status: status as JudgePublicFeedback["status"],
      stdoutExcerpt: boundedText(row.stdoutExcerpt, 2_000),
      expectedExcerpt: boundedText(row.expectedExcerpt, 2_000),
    }];
  });
}

function assertOperationId(value: string): void {
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(value)) throw new Error("幂等键无效");
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function nullableBoundedInteger(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
