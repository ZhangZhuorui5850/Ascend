import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SOURCE_ROOT = join(ROOT, "src");
const EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const EXCLUDED = new Set([
  "src/lib/motion/contracts.ts",
]);
const KNOWN_PLANNER_MOTION_CONSUMERS = new Set([
  "src/components/planner/PlannerBatchBar.tsx",
  "src/components/planner/PlannerTaskList.tsx",
  "src/components/planner/PlannerTaskRow.tsx",
  "src/components/planner/PlannerTasksWorkspace.tsx",
  // 重设计预览（/redesign）：均在 TrailShell / TasksTrail 的 MotionProvider 内消费语义契约
  "src/components/redesign/DayAgenda.tsx",
  "src/components/redesign/NextQueue.tsx",
  "src/components/redesign/TasksTrail.tsx",
  // 正式 Kinetic 产品空间由 src/app/kinetic/layout.tsx 的 MotionProvider 托管。
  "src/components/kinetic/KineticHome.tsx",
  "src/components/kinetic/KineticShell.tsx",
]);
const KEYFRAME_LEGACY_BASELINE = new Map();

// Existing violations are a migration baseline. New violations increase a
// category count and fail the audit; reduce guards and token declarations are
// intentionally excluded by the rules below.
const LEGACY_BASELINE = new Map(`
src/app/globals.css|bare-duration|.mainPane > .pageStack > *:nth-child(2) { animation-delay: 0.05s; }
src/app/globals.css|bare-duration|.mainPane > .pageStack > *:nth-child(3) { animation-delay: 0.1s; }
src/app/globals.css|bare-duration|.mainPane > .pageStack > *:nth-child(4) { animation-delay: 0.15s; }
src/app/globals.css|bare-duration|.mainPane > .pageStack > *:nth-child(5) { animation-delay: 0.2s; }
src/app/globals.css|bare-duration|.mainPane > .pageStack > *:nth-child(n + 6) { animation-delay: 0.24s; }
src/app/globals.css|bare-duration|animation-delay: 0s !important;
src/app/globals.css|bare-duration|animation: drawerIn 200ms ease;
src/app/globals.css|bare-duration|animation: riseIn 0.25s ease both;
src/app/globals.css|bare-duration|animation: riseIn 0.38s cubic-bezier(0.2, 0.7, 0.3, 1) both;
src/app/globals.css|bare-duration|animation: skeleton-shimmer 1.4s ease infinite;
src/app/globals.css|bare-duration|animation: skeleton-shimmer 1.4s infinite linear;
src/app/globals.css|bare-duration|animation: spin 0.9s linear infinite;
src/app/globals.css|bare-duration|animation: terminalCursor 1.1s steps(1) infinite;
src/app/globals.css|bare-duration|animation: toast-in 180ms ease both;
src/app/globals.css|bare-duration|transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
src/app/globals.css|bare-duration|transition: background 0.12s ease, color 0.12s ease;
src/app/globals.css|bare-duration|transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
src/app/globals.css|bare-duration|transition: border-color 0.12s ease, background 0.12s ease;
src/app/globals.css|bare-duration|transition: border-color 0.12s ease, box-shadow 0.12s ease;
src/app/globals.css|bare-duration|transition: border-color 0.12s ease, color 0.12s ease;
src/app/globals.css|bare-duration|transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
src/app/globals.css|bare-duration|transition: border-color 150ms ease, box-shadow 150ms ease;
src/app/globals.css|bare-duration|transition: color 0.12s ease, border-color 0.12s ease;
src/app/globals.css|bare-duration|transition: color 0.18s ease, opacity 0.18s ease;
src/app/globals.css|bare-duration|transition: filter 0.12s ease;
src/app/globals.css|bare-duration|transition: grid-template-columns 180ms ease;
src/app/globals.css|bare-duration|transition: opacity 120ms ease;
src/app/globals.css|bare-duration|transition: padding 180ms ease;
src/app/globals.css|bare-duration|transition: transform 0.08s ease, box-shadow 0.08s ease;
src/app/globals.css|bare-duration|transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
src/app/globals.css|bare-duration|transition: transform 0.12s ease, box-shadow 0.12s ease;
src/app/globals.css|bare-duration|transition: transform 0.12s ease;
src/app/globals.css|bare-duration|transition: transform 0.18s ease, visibility 0.18s;
src/app/globals.css|bare-duration|transition: transform 0.2s ease;
src/app/globals.css|bare-duration|transition: transform 150ms ease, color 0.12s ease, border-color 0.12s ease;
src/app/globals.css|bare-duration|transition: transform 180ms ease;
src/app/globals.css|bare-duration|transition: width 180ms ease;
src/app/globals.css|bare-easing|animation: riseIn 0.38s cubic-bezier(0.2, 0.7, 0.3, 1) both;
src/styles/summit.css|bare-duration|animation-duration: 240ms;
src/styles/summit.css|bare-duration|animation: calendar-popover-in-above 220ms var(--summit-ease) both;
src/styles/summit.css|bare-duration|animation: calendar-popover-in-below 220ms var(--summit-ease) both;
src/styles/summit.css|bare-duration|animation: summit-details-in 200ms var(--summit-ease) both;
src/styles/summit.css|bare-duration|animation: summit-home-fade 360ms var(--motion-ease-enter) calc(var(--motion-stagger) * 3) both;
src/styles/summit.css|bare-duration|animation: summit-home-rise 360ms var(--motion-ease-enter) calc(var(--motion-stagger) * 4) both;
src/styles/summit.css|bare-duration|animation: summit-home-rise 480ms var(--motion-ease-enter) both;
src/styles/summit.css|bare-duration|animation: summit-track-grow 420ms var(--motion-ease-enter) 330ms both;
src/styles/summit.css|bare-duration|transition: background 160ms ease, border-color 160ms ease, transform 180ms var(--summit-ease);
src/styles/summit.css|bare-duration|transition: background 180ms ease, color 180ms ease, border-color 180ms ease, transform 220ms var(--summit-ease);
src/styles/summit.css|bare-duration|transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
src/styles/summit.css|bare-duration|transition: border-color 180ms ease, transform 260ms var(--summit-ease), box-shadow 220ms ease;
src/styles/summit.css|bare-duration|transition: grid-template-columns 320ms var(--summit-ease);
src/styles/summit.css|bare-duration|transition: height 180ms var(--summit-ease), opacity 140ms ease;
src/styles/summit.css|bare-duration|transition: transform 160ms var(--summit-ease), box-shadow 160ms ease;
src/styles/summit.css|bare-duration|transition: transform 180ms var(--summit-ease), border-color 160ms ease, box-shadow 160ms ease;
src/styles/summit.css|bare-duration|transition: transform 180ms var(--summit-ease), box-shadow 180ms ease, background 180ms ease;
src/styles/summit.css|bare-duration|transition: width 320ms var(--summit-ease);
`.trim().split("\n").map((fingerprint) => [fingerprint, 1]));

for (const fingerprint of [
  "src/app/globals.css|bare-duration|animation-delay: 0s !important;",
  "src/app/globals.css|bare-duration|transition: opacity 120ms ease;",
  "src/app/globals.css|bare-duration|transition: border-color 0.12s ease, background 0.12s ease;",
  "src/app/globals.css|bare-duration|transition: background 0.12s ease, color 0.12s ease;",
  "src/app/globals.css|bare-duration|transition: border-color 0.12s ease, color 0.12s ease;",
]) LEGACY_BASELINE.set(fingerprint, 2);

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return files(path);
    return EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf("."))) ? [path] : [];
  });
}

function violations(path, source) {
  const isCss = path.endsWith(".css");
  const result = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (/0\.001ms/.test(line) || /--motion-[\w-]+\s*:/.test(line)) continue;
    if (/cubic-bezier\(/.test(line)) result.push({ rule: "bare-easing", line: index + 1, text: line.trim() });
    if (/transition\s*:\s*all\b/.test(line)) result.push({ rule: "transition-all", line: index + 1, text: line.trim() });
    if (isCss && /(?:transition|animation)[^;{]*\b\d+(?:\.\d+)?m?s\b/.test(line)) {
      result.push({ rule: "bare-duration", line: index + 1, text: line.trim() });
    }
    if (!isCss && /\bduration\s*:\s*\d+(?:\.\d+)?\b/.test(line)) {
      result.push({ rule: "bare-duration", line: index + 1, text: line.trim() });
    }
  }
  return result;
}

function motionConsumerViolations(path, source) {
  if (!source.includes('from "motion/react"') || path.endsWith(".test.ts") || path === "src/components/ui/MotionProvider.tsx" || path === "src/lib/motion/contracts.ts") return [];
  const result = [];
  if (!KNOWN_PLANNER_MOTION_CONSUMERS.has(path)) result.push({ rule: "motion-consumer-boundary", line: 1, text: "consumer is outside a known MotionProvider workspace" });
  if (/\bm\./.test(source) && !source.includes('from "@/lib/motion/contracts"')) {
    result.push({ rule: "motion-semantic-contract", line: 1, text: "m transform/layout consumer must import semantic contracts" });
  }
  return result;
}

function duplicateKeyframeViolations(sources) {
  const declarations = new Map();
  for (const { path, source } of sources.filter(({ path }) => path.endsWith(".css"))) {
    for (const match of source.matchAll(/@keyframes\s+([\w-]+)/g)) {
      const name = match[1];
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      declarations.set(name, [...(declarations.get(name) ?? []), { path, line }]);
    }
  }
  return [...declarations.entries()].flatMap(([name, entries]) => entries.length > 1
    ? entries.map((entry) => ({
      ...entry,
      rule: "duplicate-keyframes",
      text: `${name}|${entries.map(({ path }) => path).sort().join(",")}`,
    }))
    : []);
}

const sources = files(SOURCE_ROOT)
  .map((path) => ({ path: relative(ROOT, path).replaceAll("\\", "/"), source: readFileSync(path, "utf8") }))
  .filter(({ path }) => !path.endsWith(".test.ts"));
const found = sources
  .filter(({ path }) => !EXCLUDED.has(path))
  .flatMap(({ path, source }) => [
    ...violations(path, source),
    ...motionConsumerViolations(path, source),
  ].map((violation) => ({ path, ...violation })))
  .concat(duplicateKeyframeViolations(sources));

const fingerprints = found.map(({ path, rule, text }) => `${path}|${rule}|${text.replace(/\s+/g, " ")}`);
if (process.argv.includes("--print-baseline")) {
  process.stdout.write(`${JSON.stringify([...new Set(fingerprints)].sort(), null, 2)}\n`);
  process.exit(0);
}

const remainingBaseline = new Map([...LEGACY_BASELINE, ...KEYFRAME_LEGACY_BASELINE]);
const regressions = found.filter((item) => {
  const fingerprint = `${item.path}|${item.rule}|${item.text.replace(/\s+/g, " ")}`;
  const remaining = remainingBaseline.get(fingerprint) ?? 0;
  if (!remaining) return true;
  remainingBaseline.set(fingerprint, remaining - 1);
  return false;
});

if (regressions.length) {
  console.error("Motion audit failed: new bare motion declarations are not allowed.");
  console.error(regressions.map((item) => `${item.path}:${item.line} ${item.rule}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Motion audit passed (${LEGACY_BASELINE.size} legacy fingerprints).`);
}
