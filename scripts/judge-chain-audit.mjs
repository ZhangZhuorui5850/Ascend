import Database from "better-sqlite3";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const appPort = parsePort(process.env.JUDGE_E2E_APP_PORT || "3115", "JUDGE_E2E_APP_PORT");
const gatewayPort = parsePort(process.env.JUDGE_E2E_GATEWAY_PORT || "4115", "JUDGE_E2E_GATEWAY_PORT");
const dataRoot = requireIsolatedDataRoot();
const email = process.env.APP_LOGIN_EMAIL || "";
const password = process.env.APP_LOGIN_PASSWORD || "";
if (!email || !password) throw new Error("Set CI-only APP_LOGIN_EMAIL and APP_LOGIN_PASSWORD.");
const gatewayToken = "judge-e2e-gateway-token";
const codeKey = Buffer.alloc(32, 23).toString("base64");
const baseUrl = `http://127.0.0.1:${appPort}`;
const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;
const nextCli = path.resolve("node_modules/next/dist/bin/next");
const submissions = new Map();
const gateway = createMockGateway();
await listen(gateway, gatewayPort);

const app = spawn(process.execPath, [nextCli, "dev", "-p", String(appPort), "--hostname", "127.0.0.1"], {
  env: {
    ...process.env,
    NODE_ENV: "development",
    ZGCA_DATA_ROOT: dataRoot,
    ZGCA_UPLOAD_ROOT: path.join(dataRoot, "uploads"),
    APP_LOGIN_EMAIL: email,
    APP_LOGIN_PASSWORD: password,
    ASCEND_JUDGE_GATEWAY_URL: gatewayUrl,
    ASCEND_JUDGE_GATEWAY_TOKEN: gatewayToken,
    ASCEND_JUDGE_CODE_KEY: codeKey,
    ASCEND_JUDGE_CODE_KEY_VERSION: "1",
    ASCEND_JUDGE_CODE_RETENTION_DAYS: "0",
  },
  stdio: ["ignore", "inherit", "inherit"],
});

let browser;
try {
  await waitForHealthyApp(app);
  const executablePath = findChromiumExecutable();
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await login(page);
  await enablePlugin(page);
  await page.goto(`${baseUrl}/practice/algorithms`, { waitUntil: "domcontentloaded" });
  const problem = page.locator(".algorithmProblemCard").filter({ hasText: "两数求和" });
  await problem.getByRole("button", { name: "开始训练" }).click();
  await problem.getByLabel("关键思路、不变量和边界").fill("读取两个整数，使用足够宽的整数类型求和并输出。");
  await problem.getByLabel("提交前信心").selectOption("3");
  await problem.getByLabel("算法代码").fill([
    "#include <iostream>",
    "using namespace std;",
    "int main(){ long long a,b; cin>>a>>b; cout<<a+b<<'\\n'; }",
  ].join("\n"));

  await problem.getByRole("button", { name: "运行公开样例" }).click();
  await expectStatus(problem, "AC · 通过");
  await problem.getByRole("button", { name: "提交正式评测" }).click();
  await expectStatus(problem, "AC · 通过");
  await problem.getByLabel("时间复杂度").fill("O(1)");
  await problem.getByLabel("空间复杂度").fill("O(1)");
  await problem.getByLabel("纠正规则").fill("提交前检查整数范围，并手算一个负数样例。");
  await problem.getByLabel("一句话带走").fill("先确认数值范围，再选择整数类型。");
  await problem.getByRole("button", { name: "保存复盘" }).click();
  await problem.getByText("已保存", { exact: true }).waitFor({ state: "visible" });

  const db = new Database(path.join(dataRoot, "workbench.sqlite"), { readonly: true });
  try {
    expectEqual(db.prepare(`
      SELECT submission_kind, status
      FROM algorithm_submissions
      ORDER BY id ASC
    `).all(), [
      { submission_kind: "sample", status: "AC" },
      { submission_kind: "formal", status: "AC" },
    ], "sample/formal submissions");
    expectEqual(db.prepare(`
      SELECT verdict, outcome, independent
      FROM algorithm_attempts
      WHERE outcome != 'in_progress'
    `).get(), { verdict: "AC", outcome: "AC", independent: 1 }, "formal learning evidence");
    expectEqual(db.prepare(`
      SELECT complexity_time, complexity_space
      FROM algorithm_reflections
    `).get(), { complexity_time: "O(1)", complexity_space: "O(1)" }, "structured reflection");
    expectEqual(db.prepare(`
      SELECT COUNT(*) AS count
      FROM algorithm_code_blobs
      WHERE deleted_at IS NULL AND id IN (
        SELECT code_blob_id FROM algorithm_submissions WHERE code_blob_id IS NOT NULL
      )
    `).get(), { count: 0 }, "terminal code redaction");
  } finally {
    db.close();
  }
  console.log(`judge chain audit passed for ${baseUrl}`);
} finally {
  if (browser) await browser.close();
  await stopChild(app);
  await closeServer(gateway);
}

function createMockGateway() {
  return createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${gatewayToken}`) {
      return sendJson(response, 401, { code: "UNAUTHORIZED" });
    }
    if (request.method === "GET" && request.url === "/health") {
      return sendJson(response, 200, { ok: true, queueDepth: 0 });
    }
    if (request.method === "POST" && request.url === "/v1/submissions") {
      const operationId = String(request.headers["idempotency-key"] || "");
      const body = await readJson(request);
      if (!operationId || !["sample", "formal"].includes(body.mode)) {
        return sendJson(response, 400, { code: "INVALID_REQUEST" });
      }
      const existing = submissions.get(operationId);
      if (existing && existing.sha !== sha(body)) return sendJson(response, 409, { code: "IDEMPOTENCY_CONFLICT" });
      const id = existing?.id || `submission:e2e:${submissions.size + 1}`;
      submissions.set(operationId, { id, sha: sha(body), polls: 0 });
      return sendJson(response, 202, { id, status: "QUEUED" });
    }
    if (request.method === "GET" && request.url?.startsWith("/v1/submissions/")) {
      const id = decodeURIComponent(request.url.slice("/v1/submissions/".length));
      const submission = [...submissions.values()].find((item) => item.id === id);
      if (!submission) return sendJson(response, 404, { code: "NOT_FOUND" });
      submission.polls += 1;
      const status = submission.polls < 2 ? "RUNNING" : "AC";
      return sendJson(response, 200, {
        id,
        status,
        timeMs: status === "AC" ? 7 : null,
        memoryKb: status === "AC" ? 1024 : null,
        compilerExcerpt: "",
        publicFeedback: [],
        failureCode: "",
        judgedAt: status === "AC" ? new Date().toISOString() : null,
      });
    }
    return sendJson(response, 404, { code: "NOT_FOUND" });
  });
}

async function login(page) {
  await page.goto(`${baseUrl}/login?next=/extensions`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("账号").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 15_000 });
  if (new URL(page.url()).pathname === "/onboarding") {
    for (let step = 0; step < 4; step += 1) {
      const next = page.getByRole("button", { name: /下一步|完成设置|进入 Ascend/ }).last();
      if (await next.count()) await next.click();
    }
    await page.waitForURL((url) => url.pathname !== "/onboarding", { timeout: 15_000 });
  }
}

async function enablePlugin(page) {
  await page.goto(`${baseUrl}/extensions`, { waitUntil: "domcontentloaded" });
  const enable = page.getByLabel("启用算法训练");
  if (await enable.count()) await enable.check();
  await page.getByRole("link", { name: "打开扩展" }).waitFor({ state: "visible" });
}

async function expectStatus(problem, label) {
  await problem.getByText(label, { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
}

async function waitForHealthyApp(child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Isolated app exited early.");
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still compiling.
    }
    await delay(500);
  }
  throw new Error("Isolated app did not become healthy within 60 seconds.");
}

function requireIsolatedDataRoot() {
  if (process.env.ASCEND_E2E_ISOLATED !== "1") {
    throw new Error("Set ASCEND_E2E_ISOLATED=1 for an explicitly isolated Judge audit.");
  }
  const raw = process.env.ZGCA_DATA_ROOT;
  if (!raw) throw new Error("ZGCA_DATA_ROOT is required.");
  const resolved = path.resolve(raw);
  if (resolved === path.resolve("data") || !resolved.toLowerCase().includes("ascend-e2e")) {
    throw new Error(`Refusing non-isolated data root: ${resolved}`);
  }
  if (existsSync(path.join(resolved, "workbench.sqlite"))) {
    throw new Error(`Refusing to reuse an existing E2E database: ${resolved}`);
  }
  return resolved;
}

function findChromiumExecutable() {
  return [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean).find((candidate) => existsSync(candidate));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function sha(body) {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    delay(5_000).then(() => false),
  ]);
  if (!stopped && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

function parsePort(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) throw new Error(`${label} is invalid.`);
  return parsed;
}

function expectEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
