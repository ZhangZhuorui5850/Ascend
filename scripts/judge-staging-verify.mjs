import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

if (process.env.ASCEND_JUDGE_STAGING_VERIFY !== "dedicated-vm-only") {
  throw new Error(
    "Refusing staging verification. Set ASCEND_JUDGE_STAGING_VERIFY=dedicated-vm-only on the isolated VM.",
  );
}

const root = process.cwd();
const composePath = path.resolve(
  process.env.ASCEND_JUDGE_STAGING_COMPOSE ||
    "deploy/judge0-staging/compose.yml",
);
const configPath = path.resolve(
  process.env.ASCEND_JUDGE_STAGING_ENV ||
    "deploy/judge0-staging/staging-secrets.env",
);
const reportPath = process.env.ASCEND_JUDGE_STAGING_REPORT
  ? path.resolve(process.env.ASCEND_JUDGE_STAGING_REPORT)
  : "";
const composeArgs = ["compose", "-f", composePath, "--env-file", configPath];
const config = parseEnv(readFileSync(configPath, "utf8"));
const failures = [];

const judgeHeaders = {
  "X-Auth-Token": config.JUDGE0_AUTH_TOKEN || "",
};
const [version, isolate, languages, workers, gatewayHealth] = await Promise.all([
  requestText("http://127.0.0.1:2358/version", judgeHeaders),
  requestText("http://127.0.0.1:2358/isolate", judgeHeaders),
  requestJson("http://127.0.0.1:2358/languages", judgeHeaders),
  requestJson("http://127.0.0.1:2358/workers", judgeHeaders),
  requestJson("http://127.0.0.1:4100/health", {
    authorization: `Bearer ${config.ASCEND_JUDGE_GATEWAY_TOKEN || ""}`,
  }),
]);

check(version.ok && version.value.includes("1.13.1"), `Judge0 /version is not 1.13.1: ${version.error || version.value}`);
check(isolate.ok && isolate.value.trim().length > 0, `Judge0 /isolate unavailable: ${isolate.error}`);
check(languages.ok && Array.isArray(languages.value), `Judge0 /languages unavailable: ${languages.error}`);
check(workers.ok && Array.isArray(workers.value), `Judge0 /workers unavailable: ${workers.error}`);
check(
  workers.ok && workers.value.some((item) => Number(item.available) > 0),
  "Judge0 reports no available worker",
);
check(gatewayHealth.ok && gatewayHealth.value?.ok === true, `Gateway health failed: ${gatewayHealth.error}`);

let configuredLanguageIds = {};
try {
  configuredLanguageIds = JSON.parse(config.JUDGE0_LANGUAGE_IDS_JSON || "");
} catch {
  failures.push("JUDGE0_LANGUAGE_IDS_JSON is invalid");
}
const languageEvidence = {};
if (languages.ok && Array.isArray(languages.value)) {
  for (const [key, expectedPattern] of Object.entries({
    cpp17: /C\+\+.*GCC/i,
    python3: /Python.*3/i,
  })) {
    const item = languages.value.find((candidate) => candidate.id === configuredLanguageIds[key]);
    check(Boolean(item), `Configured ${key} language ID ${configuredLanguageIds[key]} is absent`);
    check(Boolean(item && expectedPattern.test(item.name || "")), `Configured ${key} maps to an unexpected language`);
    languageEvidence[key] = item ? { id: item.id, name: item.name } : null;
  }
}

const services = dockerJson([...composeArgs, "--profile", "gateway", "ps", "--format", "json"]);
check(services.ok, `Cannot inspect Compose services: ${services.error}`);
if (services.ok) {
  const expected = new Set([
    "gateway",
    "judge0-db",
    "judge0-redis",
    "judge0-server",
    "judge0-workers",
  ]);
  for (const service of services.value) {
    expected.delete(service.Service);
    check(service.State === "running", `${service.Service || "unknown service"} is not running`);
  }
  check(expected.size === 0, `Missing services: ${[...expected].join(", ")}`);
}

const network = dockerJson([
  "network",
  "inspect",
  "ascend-judge-staging_judge_internal",
  "--format",
  "{{json .}}",
]);
check(network.ok && network.value[0]?.Internal === true, "judge_internal Docker network is not internal");

const judgePort = dockerText([...composeArgs, "port", "judge0-server", "2358"]);
const gatewayPort = dockerText([...composeArgs, "--profile", "gateway", "port", "gateway", "4100"]);
check(judgePort.ok && normalizePort(judgePort.value) === "127.0.0.1:2358", "Judge0 is not bound only to 127.0.0.1:2358");
check(gatewayPort.ok && normalizePort(gatewayPort.value) === "127.0.0.1:4100", "Gateway is not bound only to 127.0.0.1:4100");

const judgeImage = dockerJson([
  "image",
  "inspect",
  "judge0/judge0:1.13.1",
  "--format",
  "{{json .}}",
]);
const gatewayImageId = serviceImageId("gateway");
const evidence = {
  checkedAt: new Date().toISOString(),
  ok: failures.length === 0,
  failures,
  judge0: {
    version: version.ok ? version.value.trim() : null,
    isolate: isolate.ok ? isolate.value.trim() : null,
    workers: workers.ok
      ? workers.value.map((item) => ({
          queue: item.queue,
          available: item.available,
          idle: item.idle,
          working: item.working,
          failed: item.failed,
        }))
      : [],
    languages: languageEvidence,
    imageId: judgeImage.ok ? judgeImage.value[0]?.Id || null : null,
    repoDigests: judgeImage.ok ? judgeImage.value[0]?.RepoDigests || [] : [],
  },
  gateway: {
    health: gatewayHealth.ok ? gatewayHealth.value : null,
    imageId: gatewayImageId,
  },
  topology: {
    internalNetwork: network.ok ? network.value[0]?.Internal === true : false,
    judge0Bind: judgePort.ok ? normalizePort(judgePort.value) : null,
    gatewayBind: gatewayPort.ok ? normalizePort(gatewayPort.value) : null,
    services: services.ok
      ? services.value.map((service) => ({
          service: service.Service,
          state: service.State,
          health: service.Health || "",
        }))
      : [],
  },
};

const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
if (reportPath) writeFileSync(reportPath, serialized, { mode: 0o600 });
console.log(serialized.trimEnd());
if (failures.length) process.exit(1);

async function requestText(url, headers) {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    const value = await response.text();
    return response.ok
      ? { ok: true, value, error: "" }
      : { ok: false, value, error: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, value: "", error: error instanceof Error ? error.message : "request failed" };
  }
}

async function requestJson(url, headers) {
  const result = await requestText(url, headers);
  if (!result.ok) return { ok: false, value: null, error: result.error };
  try {
    return { ok: true, value: JSON.parse(result.value), error: "" };
  } catch {
    return { ok: false, value: null, error: "invalid JSON" };
  }
}

function serviceImageId(service) {
  const container = dockerText([
    ...composeArgs,
    "--profile",
    "gateway",
    "ps",
    "-q",
    service,
  ]);
  if (!container.ok || !container.value) return null;
  const inspect = dockerText([
    "inspect",
    "--format",
    "{{.Image}}",
    container.value.trim(),
  ]);
  return inspect.ok ? inspect.value.trim() : null;
}

function dockerText(args) {
  const result = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 15_000,
  });
  return result.status === 0
    ? { ok: true, value: result.stdout.trim(), error: "" }
    : {
        ok: false,
        value: "",
        error: result.error?.message || result.stderr.trim() || `exit ${result.status}`,
      };
}

function dockerJson(args) {
  const result = dockerText(args);
  if (!result.ok) return { ok: false, value: [], error: result.error };
  try {
    const text = result.value.trim();
    if (!text) return { ok: true, value: [], error: "" };
    if (text.startsWith("[")) return { ok: true, value: JSON.parse(text), error: "" };
    return {
      ok: true,
      value: text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
      error: "",
    };
  } catch {
    return { ok: false, value: [], error: "Docker returned invalid JSON" };
  }
}

function normalizePort(value) {
  return value.trim().replace(/^\[::\]:/, "0.0.0.0:");
}

function parseEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

function check(condition, message) {
  if (!condition) failures.push(message);
}
