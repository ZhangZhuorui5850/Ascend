import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const allowedSuites = new Map([
  ["smoke", "smoke"],
  ["multi-user", "audit:multi-user"],
  ["offline-review", "audit:offline-review"],
  ["responsive", "responsive:audit"],
]);

const port = parsePort(process.env.CI_E2E_PORT || "3105");
const baseUrl = `http://127.0.0.1:${port}`;
const dataRoot = requireIsolatedDataRoot();
const suites = parseSuites(process.env.CI_E2E_SUITES || "smoke,multi-user,offline-review,responsive");
const responsiveMode = parseResponsiveMode(process.env.RESPONSIVE_AUDIT_MODE || "critical");
const logPath = path.resolve(process.env.CI_E2E_LOG || ".ci-e2e-server.log");
const nextCli = path.resolve("node_modules/next/dist/bin/next");
const auditEnv = {
  ...process.env,
  NODE_ENV: "production",
  ZGCA_DATA_ROOT: dataRoot,
  ZGCA_UPLOAD_ROOT: path.join(dataRoot, "uploads"),
  SMOKE_URL: baseUrl,
  MULTI_USER_AUDIT_URL: baseUrl,
  OFFLINE_AUDIT_URL: baseUrl,
  RESPONSIVE_AUDIT_URL: baseUrl,
  RESPONSIVE_AUDIT_MODE: responsiveMode,
};

requireCredential("APP_LOGIN_EMAIL");
requireCredential("APP_LOGIN_PASSWORD");
requireCredential("APP_ADMIN_EMAIL");
requireCredential("APP_ADMIN_PASSWORD");
if (auditEnv.APP_LOGIN_EMAIL.trim().toLowerCase() === auditEnv.APP_ADMIN_EMAIL.trim().toLowerCase()) {
  throw new Error("CI E2E ordinary and admin accounts must be different.");
}
if (!existsSync(nextCli)) throw new Error("Next.js CLI is missing. Run npm ci and npm run build before CI E2E.");

const serverLog = createWriteStream(logPath, { flags: "w" });
await new Promise((resolve, reject) => {
  serverLog.once("open", resolve);
  serverLog.once("error", reject);
});
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const server = spawn(process.execPath, [nextCli, "start", "-p", String(port)], {
  env: auditEnv,
  stdio: ["ignore", serverLog, serverLog],
});

try {
  await waitForHealthyServer(server, `${baseUrl}/api/health`);
  for (const suite of suites) {
    const script = allowedSuites.get(suite);
    console.log(`\n=== CI E2E: ${suite}${suite === "responsive" ? ` (${responsiveMode})` : ""} ===`);
    await run(npmCommand, ["run", script], auditEnv);
  }
  console.log(`\nCI E2E passed: ${suites.join(", ")}`);
} finally {
  await stopServer(server);
  await new Promise((resolve) => serverLog.end(resolve));
}

function requireIsolatedDataRoot() {
  if (process.env.ASCEND_E2E_ISOLATED !== "1") {
    throw new Error("Refusing to run: set ASCEND_E2E_ISOLATED=1 for an explicitly isolated E2E instance.");
  }
  const value = process.env.ZGCA_DATA_ROOT;
  if (!value) throw new Error("Refusing to run: ZGCA_DATA_ROOT is required.");
  const resolved = path.resolve(value);
  const repositoryData = path.resolve("data");
  if (resolved === repositoryData || !resolved.toLowerCase().includes("ascend-e2e")) {
    throw new Error(`Refusing non-isolated E2E data root: ${resolved}`);
  }
  if (existsSync(path.join(resolved, "workbench.sqlite"))) {
    throw new Error(`Refusing to reuse an existing E2E database: ${resolved}`);
  }
  const uploadRoot = process.env.ZGCA_UPLOAD_ROOT
    ? path.resolve(process.env.ZGCA_UPLOAD_ROOT)
    : path.join(resolved, "uploads");
  if (uploadRoot !== path.join(resolved, "uploads")) {
    throw new Error("ZGCA_UPLOAD_ROOT must be the uploads directory inside ZGCA_DATA_ROOT.");
  }
  return resolved;
}

function requireCredential(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} to a CI-only credential before running E2E.`);
  return value;
}

function parsePort(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    throw new Error(`CI_E2E_PORT must be an unprivileged TCP port, got ${value}.`);
  }
  return parsed;
}

function parseSuites(value) {
  const parsed = value
    .split(",")
    .map((suite) => suite.trim())
    .filter(Boolean);
  if (!parsed.length) throw new Error("CI_E2E_SUITES must select at least one audit.");
  const unknown = parsed.filter((suite) => !allowedSuites.has(suite));
  if (unknown.length) throw new Error(`Unknown CI E2E suite(s): ${unknown.join(", ")}`);
  return [...new Set(parsed)];
}

function parseResponsiveMode(value) {
  if (value !== "critical" && value !== "full") {
    throw new Error(`RESPONSIVE_AUDIT_MODE must be critical or full, got ${value}.`);
  }
  return value;
}

async function waitForHealthyServer(child, url) {
  const deadline = Date.now() + 45_000;
  let lastError = "";
  while (Date.now() < deadline) {
    if (hasExited(child)) {
      throw new Error(`E2E server exited before becoming healthy (${exitDescription(child)}). See ${logPath}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`Isolated E2E server ready at ${baseUrl}`);
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`E2E server did not become healthy within 45s (${lastError}). See ${logPath}.`);
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed (${signal || `code ${code}`}).`));
    });
  });
}

async function stopServer(child) {
  if (hasExited(child)) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!stopped && !hasExited(child)) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function exitDescription(child) {
  return child.signalCode ? `signal ${child.signalCode}` : `code ${child.exitCode}`;
}
