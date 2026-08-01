import Database from "better-sqlite3";
import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  authenticateBearer,
  GatewayHttpError,
  ReferenceJudgeGateway,
  validateProblemDefinitions,
} from "./core.mjs";

const port = parseInteger(process.env.ASCEND_JUDGE_GATEWAY_PORT || "4100", 1024, 65535, "port");
const token = requireSecret("ASCEND_JUDGE_GATEWAY_TOKEN", 32);
const judge0Url = requireSecret("JUDGE0_URL");
const judge0Token = process.env.JUDGE0_AUTH_TOKEN || "";
const dataRoot = path.resolve(process.env.ASCEND_JUDGE_GATEWAY_DATA || "/var/lib/ascend-judge-gateway");
const problemPath = path.resolve(
  process.env.ASCEND_JUDGE_PROBLEMS_FILE || new URL("./problems.json", import.meta.url).pathname,
);
const languageIds = parseLanguageIds(process.env.JUDGE0_LANGUAGE_IDS_JSON || "");
const maxActive = parseInteger(process.env.ASCEND_JUDGE_MAX_ACTIVE || "100", 1, 10_000, "max active submissions");
const maxDaily = parseInteger(process.env.ASCEND_JUDGE_MAX_DAILY || "10000", 1, 1_000_000, "max daily submissions");
mkdirSync(dataRoot, { recursive: true });
const db = new Database(path.join(dataRoot, "gateway.sqlite"));
const problems = validateProblemDefinitions(JSON.parse(readFileSync(problemPath, "utf8")));
const gateway = new ReferenceJudgeGateway({
  db,
  problems,
  judge0Url,
  judge0Token,
  languageIds,
  maxActive,
  maxDaily,
});

const server = createServer(async (request, response) => {
  try {
    if (!authenticateBearer(request.headers.authorization, token)) {
      throw new GatewayHttpError(401, "UNAUTHORIZED", "Unauthorized");
    }
    if (request.method === "GET" && request.url === "/health") {
      return json(response, 200, await gateway.health());
    }
    if (request.method === "POST" && request.url === "/v1/submissions") {
      const body = await readJsonBody(request, 72 * 1024);
      const idempotencyKey = headerValue(request.headers["idempotency-key"]);
      return json(response, 202, await gateway.createSubmission({
        idempotencyKey,
        problemRef: body.problemRef,
        language: body.language,
        sourceCode: body.sourceCode,
        mode: body.mode,
      }));
    }
    if (request.method === "GET" && request.url?.startsWith("/v1/submissions/")) {
      const id = decodeURIComponent(request.url.slice("/v1/submissions/".length));
      return json(response, 200, await gateway.getSubmission(id));
    }
    throw new GatewayHttpError(404, "NOT_FOUND", "Not found");
  } catch (error) {
    const normalized = error instanceof GatewayHttpError
      ? error
      : new GatewayHttpError(500, "INTERNAL_ERROR", "Internal error");
    json(response, normalized.status, { code: normalized.code, error: normalized.message });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Ascend Judge Gateway listening on :${port}`);
});

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(payload);
}

async function readJsonBody(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new GatewayHttpError(413, "BODY_TOO_LARGE", "Body too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new GatewayHttpError(400, "INVALID_JSON", "Invalid JSON");
  }
}

function requireSecret(name, minBytes = 1) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name}`);
  if (Buffer.byteLength(value, "utf8") < minBytes) {
    throw new Error(`${name} must be at least ${minBytes} bytes`);
  }
  return value;
}

function parseLanguageIds(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("JUDGE0_LANGUAGE_IDS_JSON must be JSON");
  }
  const result = {};
  for (const language of ["cpp17", "python3"]) {
    result[language] = parseInteger(parsed?.[language], 1, 10000, `${language} language id`);
  }
  return result;
}

function parseInteger(value, min, max, label) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`Invalid ${label}`);
  return parsed;
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
