import { existsSync, readFileSync, statfsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const confirmation = process.env.ASCEND_JUDGE_HOST_CONFIRM;
if (confirmation !== "dedicated-disposable-vm") {
  throw new Error(
    "Refusing Judge host checks. Set ASCEND_JUDGE_HOST_CONFIRM=dedicated-disposable-vm only on the isolated VM.",
  );
}
if (process.platform !== "linux" || existsSync("/.dockerenv")) {
  throw new Error("Judge staging must run on a dedicated Linux VM host, not macOS or a container.");
}
if (existsSync("/opt/apps/ascend")) {
  throw new Error("Refusing a host that contains /opt/apps/ascend; Judge must not share the production application host.");
}

const root = process.cwd();
const configPath = path.resolve(
  process.env.ASCEND_JUDGE_STAGING_ENV ||
    "deploy/judge0-staging/staging-secrets.env",
);
const composePath = path.resolve(
  process.env.ASCEND_JUDGE_STAGING_COMPOSE ||
    "deploy/judge0-staging/compose.yml",
);
const failures = [];
const warnings = [];

const release = parseOsRelease(readFile("/etc/os-release"));
check(release.ID === "ubuntu", `Expected Ubuntu, found ${release.ID || "unknown"}`);
check(
  release.VERSION_ID === "22.04",
  `Judge0 1.13.1 staging requires the upstream-tested Ubuntu 22.04, found ${release.VERSION_ID || "unknown"}`,
);
check(process.arch === "x64", `Judge0 1.13.1 image is validated here only for linux/amd64, found ${process.arch}`);

const cmdline = readFile("/proc/cmdline");
check(
  cmdline.includes("systemd.unified_cgroup_hierarchy=0"),
  "GRUB kernel command line does not force cgroup v1",
);
check(
  existsSync("/sys/fs/cgroup/memory"),
  "cgroup v1 memory controller is unavailable at /sys/fs/cgroup/memory",
);
const procCgroups = readFile("/proc/cgroups");
check(
  procCgroups.split("\n").some((line) => /^memory\s+\d+\s+\d+\s+1$/.test(line.trim())),
  "cgroup v1 memory controller is not enabled",
);

const cpuCount = os.cpus().length;
const memoryGiB = os.totalmem() / 1024 ** 3;
const disk = statfsSync(root);
const diskFreeGiB = Number(disk.bavail) * Number(disk.bsize) / 1024 ** 3;
check(cpuCount >= 4, `Pilot host requires at least 4 vCPU, found ${cpuCount}`);
check(memoryGiB >= 7.5, `Pilot host requires at least 8 GiB RAM, found ${memoryGiB.toFixed(1)} GiB`);
check(diskFreeGiB >= 40, `Pilot host requires at least 40 GiB free disk, found ${diskFreeGiB.toFixed(1)} GiB`);

check(existsSync(composePath), `Compose file missing: ${composePath}`);
check(existsSync(configPath), `Staging environment file missing: ${configPath}`);
let config = {};
if (existsSync(configPath)) {
  const mode = statSync(configPath).mode & 0o777;
  check((mode & 0o077) === 0, `Environment file must not be group/world-readable; current mode is ${mode.toString(8)}`);
  config = parseEnv(readFile(configPath));
  validateConfig(config);
}
if (existsSync(composePath)) validateCompose(readFile(composePath));

const dockerVersion = command("docker", ["version", "--format", "{{.Server.Version}}"]);
check(dockerVersion.ok, `Docker daemon unavailable: ${dockerVersion.error}`);
const composeVersion = command("docker", ["compose", "version", "--short"]);
check(composeVersion.ok, `Docker Compose plugin unavailable: ${composeVersion.error}`);

if (failures.length) {
  console.error(JSON.stringify({
    ok: false,
    failures,
    warnings,
    host: hostSummary(),
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  failures: [],
  warnings,
  host: hostSummary(),
  docker: dockerVersion.value,
  compose: composeVersion.value,
  configPath,
  composePath,
}, null, 2));

function validateConfig(values) {
  const secretKeys = [
    "JUDGE0_AUTH_TOKEN",
    "REDIS_PASSWORD",
    "POSTGRES_PASSWORD",
    "SECRET_KEY_BASE",
    "ASCEND_JUDGE_GATEWAY_TOKEN",
  ];
  for (const key of secretKeys) {
    const minimum = key === "SECRET_KEY_BASE" ? 64 : 32;
    check(Buffer.byteLength(values[key] || "", "utf8") >= minimum, `${key} must be at least ${minimum} bytes`);
    check(!/replace|change|example|<|>/i.test(values[key] || ""), `${key} still contains a placeholder`);
  }
  const uniqueSecrets = new Set(secretKeys.map((key) => values[key]));
  check(uniqueSecrets.size === secretKeys.length, "Judge, database, Redis, Rails, and Gateway secrets must be distinct");
  try {
    const languageIds = JSON.parse(values.JUDGE0_LANGUAGE_IDS_JSON || "");
    check(Number.isInteger(languageIds.cpp17) && languageIds.cpp17 > 0, "cpp17 language ID is invalid");
    check(Number.isInteger(languageIds.python3) && languageIds.python3 > 0, "python3 language ID is invalid");
    check(languageIds.cpp17 !== languageIds.python3, "C++17 and Python 3 language IDs must differ");
  } catch {
    check(false, "JUDGE0_LANGUAGE_IDS_JSON must be valid JSON");
  }
}

function validateCompose(text) {
  check(!/judge0\/judge0:latest(?:\s|$)/m.test(text), "Judge0 image must not use latest");
  check(text.includes("judge0/judge0:1.13.1"), "Judge0 image must be pinned to 1.13.1");
  check(text.includes('"127.0.0.1:2358:2358"'), "Judge0 API must bind only to loopback");
  check(text.includes('"127.0.0.1:4100:4100"'), "Gateway must bind only to loopback");
  check(text.includes("internal: true"), "Runtime Docker network must be internal");
  check(!/docker\.sock|\/opt\/apps\/ascend|\/app\/data|\/app\/backups/.test(text), "Compose mounts a forbidden host resource");
  for (const fragment of [
    'ENABLE_COMPILER_OPTIONS: "false"',
    'ENABLE_COMMAND_LINE_ARGUMENTS: "false"',
    'ENABLE_CALLBACKS: "false"',
    'ENABLE_ADDITIONAL_FILES: "false"',
    'MAX_PROCESSES_AND_OR_THREADS: "1"',
    'MAX_MAX_PROCESSES_AND_OR_THREADS: "1"',
    'ALLOW_ENABLE_NETWORK: "false"',
    'ENABLE_NETWORK: "false"',
  ]) {
    check(text.includes(fragment), `Compose is missing hardening setting ${fragment}`);
  }
}

function parseEnv(text) {
  const values = {};
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error(`Invalid env line ${index + 1}`);
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`Invalid env key at line ${index + 1}`);
    if (Object.hasOwn(values, key)) throw new Error(`Duplicate env key ${key}`);
    values[key] = line.slice(separator + 1).trim();
  }
  return values;
}

function parseOsRelease(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

function command(bin, args) {
  const result = spawnSync(bin, args, { encoding: "utf8", timeout: 10_000 });
  return result.status === 0
    ? { ok: true, value: result.stdout.trim(), error: "" }
    : { ok: false, value: "", error: result.error?.message || result.stderr.trim() || `exit ${result.status}` };
}

function readFile(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    failures.push(`Cannot read ${file}: ${error instanceof Error ? error.message : "unknown error"}`);
    return "";
  }
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function hostSummary() {
  return {
    platform: process.platform,
    arch: process.arch,
    cpuCount,
    memoryGiB: Number(memoryGiB.toFixed(1)),
    diskFreeGiB: Number(diskFreeGiB.toFixed(1)),
    os: `${release.ID || "unknown"} ${release.VERSION_ID || "unknown"}`,
    cgroupV1Memory: existsSync("/sys/fs/cgroup/memory"),
  };
}
