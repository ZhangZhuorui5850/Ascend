import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

const TERMINAL = new Set(["AC", "WA", "TLE", "MLE", "RE", "CE", "JE", "CANCELLED"]);

export class GatewayHttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function initializeGatewayDatabase(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS gateway_submissions (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      request_sha256 TEXT NOT NULL,
      problem_ref TEXT NOT NULL,
      language TEXT NOT NULL,
      submission_mode TEXT NOT NULL DEFAULT 'formal',
      judge_tokens_json TEXT NOT NULL DEFAULT '[]',
      case_manifest_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'CREATING',
      result_json TEXT NOT NULL DEFAULT '{}',
      failure_code TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gateway_submission_status
      ON gateway_submissions(status, updated_at);
  `);
  const columns = new Set(db.prepare("PRAGMA table_info(gateway_submissions)")
    .all()
    .map((column) => column.name));
  if (!columns.has("submission_mode")) {
    db.exec("ALTER TABLE gateway_submissions ADD COLUMN submission_mode TEXT NOT NULL DEFAULT 'formal'");
  }
}

export class ReferenceJudgeGateway {
  constructor({
    db,
    problems,
    judge0Url,
    judge0Token = "",
    languageIds,
    request = fetch,
    timeoutMs = 5000,
    maxActive = 100,
    maxDaily = 10_000,
  }) {
    this.db = db;
    this.problems = problems;
    this.judge0Url = normalizeBaseUrl(judge0Url);
    this.judge0Token = judge0Token;
    this.languageIds = languageIds;
    this.request = request;
    this.timeoutMs = timeoutMs;
    this.maxActive = boundedInteger(maxActive, 1, 10_000, "max active submissions");
    this.maxDaily = boundedInteger(maxDaily, 1, 1_000_000, "max daily submissions");
    initializeGatewayDatabase(db);
  }

  async createSubmission({ idempotencyKey, problemRef, language, sourceCode, mode = "formal" }) {
    assertId(idempotencyKey, "Idempotency-Key");
    const problem = this.problems.get(problemRef);
    if (!problem) throw new GatewayHttpError(404, "PROBLEM_NOT_FOUND", "Unknown problem");
    if (!problem.languages.includes(language) || !Number.isInteger(this.languageIds[language])) {
      throw new GatewayHttpError(400, "LANGUAGE_NOT_SUPPORTED", "Unsupported language");
    }
    const sourceBytes = Buffer.byteLength(sourceCode || "", "utf8");
    if (!sourceBytes || sourceBytes > 64 * 1024) {
      throw new GatewayHttpError(413, "SOURCE_SIZE_INVALID", "Source must be 1-65536 bytes");
    }
    if (!["sample", "formal"].includes(mode)) {
      throw new GatewayHttpError(400, "INVALID_MODE", "Invalid submission mode");
    }
    const selectedCases = mode === "sample"
      ? problem.cases.filter((testCase) => testCase.visibility === "public")
      : problem.cases;
    if (!selectedCases.length) throw new GatewayHttpError(400, "NO_PUBLIC_CASES", "Problem has no public cases");
    const requestSha256 = sha256(JSON.stringify({ problemRef, language, sourceCode, mode }));
    const existing = this.db.prepare(`
      SELECT id, request_sha256, status FROM gateway_submissions
      WHERE idempotency_key = ?
    `).get(idempotencyKey);
    if (existing) {
      if (existing.request_sha256 !== requestSha256) {
        throw new GatewayHttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key payload changed");
      }
      if (existing.status !== "RETRYABLE_ERROR") {
        return { id: existing.id, status: normalizeCreateStatus(existing.status) };
      }
    }
    const active = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM gateway_submissions
      WHERE status IN ('CREATING', 'QUEUED', 'RUNNING')
    `).get().count;
    if (active >= this.maxActive) {
      throw new GatewayHttpError(503, "GATEWAY_CAPACITY_FULL", "Gateway capacity is full");
    }
    if (!existing) {
      const daily = this.db.prepare(`
        SELECT COUNT(*) AS count
        FROM gateway_submissions
        WHERE created_at >= datetime('now', '-1 day')
      `).get().count;
      if (daily >= this.maxDaily) {
        throw new GatewayHttpError(429, "DAILY_QUOTA_EXCEEDED", "Daily submission quota exceeded");
      }
    }

    const id = existing?.id || `submission:${randomUUID()}`;
    const cases = selectedCases.map((testCase, index) => ({
      index,
      visibility: testCase.visibility === "public" ? "public" : "hidden",
    }));
    if (!existing) {
      this.db.prepare(`
        INSERT INTO gateway_submissions
          (id, idempotency_key, request_sha256, problem_ref, language, submission_mode, case_manifest_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, idempotencyKey, requestSha256, problemRef, language, mode, JSON.stringify(cases));
    } else {
      this.db.prepare(`
        UPDATE gateway_submissions
        SET status = 'CREATING', failure_code = '', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'RETRYABLE_ERROR'
      `).run(id);
    }

    let response;
    try {
      response = await this.request(`${this.judge0Url}/submissions/batch?base64_encoded=true`, {
        method: "POST",
        headers: this.judge0Headers({ "content-type": "application/json" }),
        body: JSON.stringify({
          submissions: selectedCases.map((testCase) => ({
            source_code: encodeBase64(sourceCode),
            language_id: this.languageIds[language],
            stdin: encodeBase64(testCase.input),
            expected_output: encodeBase64(testCase.output),
            cpu_time_limit: problem.timeLimitMs / 1000,
            wall_time_limit: Math.max(2, (problem.timeLimitMs / 1000) * 2),
            memory_limit: problem.memoryLimitKb,
            stack_limit: Math.min(problem.memoryLimitKb, 64 * 1024),
            max_processes_and_or_threads: 1,
            enable_per_process_and_thread_time_limit: true,
            enable_per_process_and_thread_memory_limit: true,
            max_file_size: 64,
            number_of_runs: 1,
            enable_network: false,
          })),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      this.failSubmission(id, "JE", "UPSTREAM_AMBIGUOUS");
      return { id, status: "RUNNING" };
    }
    const body = await parseBoundedJson(response);
    if (!response.ok) {
      const retryable = response.status === 429 || response.status === 503;
      this.failSubmission(id, retryable ? "RETRYABLE_ERROR" : "JE", retryable ? "QUEUE_FULL" : "UPSTREAM_REJECTED");
      if (retryable) throw new GatewayHttpError(503, "QUEUE_FULL", "Judge queue is full");
      throw new GatewayHttpError(502, "UPSTREAM_REJECTED", "Judge rejected submission");
    }
    if (!Array.isArray(body) || body.length !== selectedCases.length) {
      this.failSubmission(id, "JE", "INVALID_UPSTREAM_RESPONSE");
      throw new GatewayHttpError(502, "INVALID_UPSTREAM_RESPONSE", "Invalid Judge0 batch response");
    }
    const tokens = body.map((item) => typeof item?.token === "string" ? item.token : "");
    if (tokens.some((token) => !token)) {
      this.failSubmission(id, "JE", "UPSTREAM_CREATE_FAILED");
      throw new GatewayHttpError(502, "UPSTREAM_CREATE_FAILED", "Judge0 rejected one or more cases");
    }
    this.db.prepare(`
      UPDATE gateway_submissions
      SET judge_tokens_json = ?, status = 'QUEUED', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(tokens), id);
    return { id, status: "QUEUED" };
  }

  async getSubmission(id) {
    assertId(id, "submission ID");
    const row = this.db.prepare(`
      SELECT id, problem_ref, submission_mode, judge_tokens_json, case_manifest_json, status,
             result_json, failure_code
      FROM gateway_submissions WHERE id = ?
    `).get(id);
    if (!row) throw new GatewayHttpError(404, "SUBMISSION_NOT_FOUND", "Unknown submission");
    if (TERMINAL.has(row.status)) return storedResult(row);
    const tokens = parseArray(row.judge_tokens_json);
    if (!tokens.length) {
      if (row.failure_code) return storedResult(row);
      return emptyResult(row.id, "RUNNING");
    }

    let response;
    try {
      const query = new URLSearchParams({
        tokens: tokens.join(","),
        base64_encoded: "true",
        fields: "token,stdout,stderr,compile_output,time,memory,status",
      });
      response = await this.request(`${this.judge0Url}/submissions/batch?${query}`, {
        method: "GET",
        headers: this.judge0Headers(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new GatewayHttpError(503, "UPSTREAM_UNREACHABLE", "Judge0 unavailable");
    }
    const body = await parseBoundedJson(response);
    if (!response.ok || !Array.isArray(body?.submissions)) {
      throw new GatewayHttpError(503, "UPSTREAM_UNAVAILABLE", "Judge0 unavailable");
    }
    const problem = this.problems.get(row.problem_ref);
    if (!problem || body.submissions.length !== tokens.length) {
      this.failSubmission(id, "JE", "CASE_MANIFEST_MISMATCH");
      return storedResult(this.db.prepare(`
        SELECT id, status, result_json, failure_code FROM gateway_submissions WHERE id = ?
      `).get(id));
    }
    const cases = row.submission_mode === "sample"
      ? problem.cases.filter((testCase) => testCase.visibility === "public")
      : problem.cases;
    const result = aggregateJudge0Results(id, { ...problem, cases }, body.submissions);
    this.db.prepare(`
      UPDATE gateway_submissions
      SET status = ?, result_json = ?, failure_code = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(result.status, JSON.stringify(result), result.failureCode, id);
    return result;
  }

  async health() {
    let upstream = false;
    try {
      const response = await this.request(`${this.judge0Url}/statuses`, {
        method: "GET",
        headers: this.judge0Headers(),
        signal: AbortSignal.timeout(Math.min(this.timeoutMs, 3000)),
      });
      upstream = response.ok;
    } catch {
      upstream = false;
    }
    const queueDepth = this.db.prepare(`
      SELECT COUNT(*) AS count FROM gateway_submissions
      WHERE status IN ('CREATING','QUEUED','RUNNING')
    `).get().count;
    return { ok: upstream, queueDepth };
  }

  judge0Headers(extra = {}) {
    return {
      accept: "application/json",
      ...(this.judge0Token ? { "x-auth-token": this.judge0Token } : {}),
      ...extra,
    };
  }

  failSubmission(id, status, code) {
    const result = {
      ...emptyResult(id, status === "RETRYABLE_ERROR" ? "JE" : status),
      failureCode: code,
      judgedAt: status === "RETRYABLE_ERROR" ? null : new Date().toISOString(),
    };
    this.db.prepare(`
      UPDATE gateway_submissions
      SET status = ?, failure_code = ?, result_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, code, JSON.stringify(result), id);
  }
}

export function authenticateBearer(header, expectedToken) {
  if (!expectedToken) return false;
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return false;
  const actual = Buffer.from(header.slice(prefix.length), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validateProblemDefinitions(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new Error("At least one problem is required");
  const map = new Map();
  for (const problem of raw) {
    if (!problem || typeof problem !== "object") throw new Error("Invalid problem definition");
    assertId(problem.ref, "problem ref");
    if (map.has(problem.ref)) throw new Error(`Duplicate problem ref: ${problem.ref}`);
    if (!Array.isArray(problem.languages) || !problem.languages.length) {
      throw new Error(`Problem ${problem.ref} has no languages`);
    }
    if (
      new Set(problem.languages).size !== problem.languages.length
      || problem.languages.some((language) => !["cpp17", "python3"].includes(language))
    ) {
      throw new Error(`Problem ${problem.ref} has unsupported or duplicate languages`);
    }
    if (
      !problem.license
      || typeof problem.license.id !== "string"
      || problem.license.redistribution !== true
    ) {
      throw new Error(`Problem ${problem.ref} lacks redistributable license metadata`);
    }
    if (!Array.isArray(problem.cases) || !problem.cases.length) {
      throw new Error(`Problem ${problem.ref} has no cases`);
    }
    if (problem.cases.length > 100) throw new Error(`Problem ${problem.ref} has too many cases`);
    for (const testCase of problem.cases) {
      if (!["public", "hidden"].includes(testCase.visibility)) throw new Error("Invalid case visibility");
      if (typeof testCase.input !== "string" || typeof testCase.output !== "string") {
        throw new Error("Invalid test case");
      }
      if (Buffer.byteLength(testCase.input) > 32 * 1024 || Buffer.byteLength(testCase.output) > 32 * 1024) {
        throw new Error("Test case exceeds 32 KiB");
      }
    }
    map.set(problem.ref, Object.freeze({
      ref: problem.ref,
      languages: [...problem.languages],
      timeLimitMs: boundedInteger(problem.timeLimitMs, 100, 10_000, "time limit"),
      memoryLimitKb: boundedInteger(problem.memoryLimitKb, 16 * 1024, 1024 * 1024, "memory limit"),
      cases: problem.cases.map((testCase) => ({ ...testCase })),
    }));
  }
  return map;
}

export function aggregateJudge0Results(id, problem, submissions) {
  const normalized = submissions.map((submission) => normalizeJudge0Case(submission));
  if (normalized.some((item) => item.status === "RUNNING")) return emptyResult(id, "RUNNING");
  if (normalized.some((item) => item.status === "QUEUED")) return emptyResult(id, "QUEUED");
  const failure = normalized.find((item) => item.status !== "AC");
  const status = failure?.status || "AC";
  const compilerExcerpt = normalized
    .map((item) => item.compilerExcerpt)
    .find(Boolean)?.slice(0, 4000) || "";
  const publicFeedback = normalized.flatMap((item, index) => {
    const testCase = problem.cases[index];
    if (testCase.visibility !== "public" || item.status === "AC") return [];
    return [{
      caseIndex: index,
      visibility: "public",
      status: item.status,
      stdoutExcerpt: item.stdout.slice(0, 2000),
      expectedExcerpt: testCase.output.slice(0, 2000),
    }];
  });
  return {
    id,
    status,
    timeMs: maximum(normalized.map((item) => item.timeMs)),
    memoryKb: maximum(normalized.map((item) => item.memoryKb)),
    compilerExcerpt,
    publicFeedback,
    failureCode: status === "JE" ? "UPSTREAM_INTERNAL_ERROR" : "",
    judgedAt: new Date().toISOString(),
  };
}

function normalizeJudge0Case(raw) {
  const description = typeof raw?.status?.description === "string" ? raw.status.description : "";
  const statusId = Number(raw?.status?.id);
  let status = "JE";
  if (statusId === 1) status = "QUEUED";
  else if (statusId === 2) status = "RUNNING";
  else if (statusId === 3) status = "AC";
  else if (statusId === 4) status = "WA";
  else if (statusId === 5) status = "TLE";
  else if (statusId === 6) status = "CE";
  else if (/memory limit/i.test(description)) status = "MLE";
  else if (statusId >= 7 && statusId <= 12) status = "RE";
  return {
    status,
    stdout: decodeBase64(raw?.stdout),
    compilerExcerpt: decodeBase64(raw?.compile_output),
    timeMs: raw?.time === null || raw?.time === undefined ? null : Math.max(0, Math.round(Number(raw.time) * 1000)),
    memoryKb: raw?.memory === null || raw?.memory === undefined ? null : Math.max(0, Math.round(Number(raw.memory))),
  };
}

function storedResult(row) {
  try {
    const parsed = JSON.parse(row.result_json || "{}");
    if (parsed.id && parsed.status) return parsed;
  } catch {
    // Fall through to a bounded failure-only result.
  }
  return {
    ...emptyResult(row.id, TERMINAL.has(row.status) ? row.status : "JE"),
    failureCode: row.failure_code || "",
  };
}

function emptyResult(id, status) {
  return {
    id,
    status,
    timeMs: null,
    memoryKb: null,
    compilerExcerpt: "",
    publicFeedback: [],
    failureCode: "",
    judgedAt: TERMINAL.has(status) ? new Date().toISOString() : null,
  };
}

async function parseBoundedJson(response) {
  const text = await readBoundedResponseText(response, 256 * 1024);
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new GatewayHttpError(502, "UPSTREAM_INVALID_JSON", "Invalid upstream JSON");
  }
}

async function readBoundedResponseText(response, maxBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new GatewayHttpError(502, "UPSTREAM_RESPONSE_TOO_LARGE", "Response too large");
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
        throw new GatewayHttpError(502, "UPSTREAM_RESPONSE_TOO_LARGE", "Response too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Invalid Judge0 URL");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function assertId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{8,160}$/.test(value)) {
    throw new GatewayHttpError(400, "INVALID_ID", `Invalid ${label}`);
  }
}

function boundedInteger(value, min, max, label) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`Invalid ${label}`);
  return parsed;
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeCreateStatus(status) {
  if (status === "QUEUED" || status === "RUNNING") return status;
  return "RUNNING";
}

function encodeBase64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function decodeBase64(value) {
  if (typeof value !== "string") return "";
  try {
    return Buffer.from(value, "base64").toString("utf8").slice(0, 4000);
  } catch {
    return "";
  }
}

function maximum(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  return numeric.length ? Math.max(...numeric) : null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
