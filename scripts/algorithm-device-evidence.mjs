import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

if (process.env.ASCEND_DEVICE_EVIDENCE_CONFIRM !== "real-devices-observed") {
  throw new Error(
    "Refusing device evidence validation. Set ASCEND_DEVICE_EVIDENCE_CONFIRM=real-devices-observed only after observing the listed real devices.",
  );
}

const reportPath = process.argv[2] ? path.resolve(process.argv[2]) : "";
if (!reportPath || !existsSync(reportPath)) {
  throw new Error("Pass an existing real-device evidence JSON file.");
}
const reportRoot = path.dirname(reportPath);
const raw = readFileSync(reportPath, "utf8");
if (/(password|token|secret|sourceCode|source_code|email|phoneNumber|ipAddress)/i.test(raw)) {
  throw new Error("Evidence report contains a forbidden sensitive-data field.");
}
const report = JSON.parse(raw);
const failures = [];

check(report.schemaVersion === 2, "schemaVersion must be 2");
check(/^[0-9a-f]{40}$/.test(report.appCommit || ""), "appCommit must be a full 40-character Git SHA");
check(isRecentTimestamp(report.testedAt), "testedAt must be a valid timestamp within the last 30 days");
validateUrl(report.appUrl);

const expectedDevices = new Map([
  ["phone-ios-pwa", {
    width: [375, 430],
    required: ["standalonePwa", "safeArea", "keyboardNoOcclusion", "relaunchRestore"],
  }],
  ["tablet", {
    width: [700, 1100],
    required: ["portrait", "landscape"],
  }],
  ["desktop", {
    width: [1280, 2560],
    required: ["keyboardNavigation"],
  }],
]);
const commonChecks = [
  "login",
  "trainingBoard",
  "cppImport",
  "managedEditor",
  "noHorizontalOverflow",
  "draftRestore",
  "sampleJudge",
  "formalJudge",
  "pollRecovery",
  "reflectionRestore",
];
const devices = Array.isArray(report.devices) ? report.devices : [];
check(devices.length === expectedDevices.size, "Exactly phone-ios-pwa, tablet, and desktop evidence is required");
const seen = new Set();
for (const device of devices) {
  const contract = expectedDevices.get(device?.id);
  check(Boolean(contract), `Unknown device id ${device?.id || "missing"}`);
  if (!contract) continue;
  check(!seen.has(device.id), `Duplicate device id ${device.id}`);
  seen.add(device.id);
  check(typeof device.os === "string" && device.os.trim().length >= 3, `${device.id}: OS/version missing`);
  check(typeof device.browser === "string" && device.browser.trim().length >= 3, `${device.id}: browser/version missing`);
  const width = Number(device.viewport?.width);
  const height = Number(device.viewport?.height);
  const dpr = Number(device.viewport?.dpr);
  check(width >= contract.width[0] && width <= contract.width[1], `${device.id}: viewport width out of contract`);
  check(height >= 500 && height <= 1600, `${device.id}: viewport height out of contract`);
  check(dpr >= 1 && dpr <= 4, `${device.id}: device pixel ratio out of contract`);
  for (const key of [...commonChecks, ...contract.required]) {
    check(device.checks?.[key] === true, `${device.id}: ${key} is not proven`);
  }
  validateArtifacts(device.id, device.artifacts);
}
for (const deviceId of expectedDevices.keys()) {
  check(seen.has(deviceId), `Missing device ${deviceId}`);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  appCommit: report.appCommit,
  testedAt: report.testedAt,
  deviceIds: [...seen],
  artifactCount: devices.reduce((sum, device) => sum + device.artifacts.length, 0),
}, null, 2));

function validateArtifacts(deviceId, artifacts) {
  check(Array.isArray(artifacts) && artifacts.length >= 2, `${deviceId}: at least two screenshots are required`);
  if (!Array.isArray(artifacts)) return;
  for (const artifact of artifacts) {
    const relative = artifact?.path || "";
    check(
      typeof relative === "string" && relative && !path.isAbsolute(relative) && !relative.includes(".."),
      `${deviceId}: artifact path must stay relative to the report`,
    );
    const absolute = path.resolve(reportRoot, relative);
    check(absolute.startsWith(`${reportRoot}${path.sep}`), `${deviceId}: artifact escapes report directory`);
    check(existsSync(absolute), `${deviceId}: artifact missing ${relative}`);
    if (!existsSync(absolute)) continue;
    const digest = createHash("sha256").update(readFileSync(absolute)).digest("hex");
    check(artifact.sha256 === digest, `${deviceId}: artifact hash mismatch ${relative}`);
  }
}

function validateUrl(value) {
  try {
    const url = new URL(value);
    check(url.protocol === "https:", "appUrl must use HTTPS");
    check(
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname),
      "appUrl must be reachable from real devices, not loopback",
    );
    check(!url.username && !url.password, "appUrl must not contain credentials");
  } catch {
    check(false, "appUrl is invalid");
  }
}

function isRecentTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    && timestamp <= Date.now() + 5 * 60_000
    && timestamp >= Date.now() - 30 * 24 * 60 * 60_000;
}

function check(condition, message) {
  if (!condition) failures.push(message);
}
