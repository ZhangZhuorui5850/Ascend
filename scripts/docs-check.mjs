import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const scanRoots = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "QUICKSTART.md",
  ".agents",
  ".claude",
  "deploy",
  "docs",
  "extensions",
  "public",
];
const ignoredSegments = new Set(["node_modules", ".git", ".next", ".vscode-test", "coverage", "dist", "out"]);
const failures = [];
const packageCache = new Map();

const markdownFiles = [];
let checkedFiles = 0;
let archivedFiles = 0;
for (const entry of scanRoots) {
  await collectMarkdown(path.join(root, entry), markdownFiles);
}

for (const file of markdownFiles.sort()) {
  const relativeFile = path.relative(root, file);
  const archived = relativeFile.startsWith(`docs${path.sep}archive${path.sep}`);
  checkedFiles += 1;
  if (archived) archivedFiles += 1;
  const content = await readFile(file, "utf8");
  if (!archived) await validateNpmScripts(file, relativeFile, content);
  await validateLinks(file, relativeFile, content);
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `docs check passed (${checkedFiles - archivedFiles} current Markdown files, ${archivedFiles} archived Markdown files)\n`,
  );
}

async function collectMarkdown(target, result) {
  const info = await access(target).then(() => true).catch(() => false);
  if (!info) return;
  const entries = await readdir(target, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    if (target.endsWith(".md")) result.push(target);
    return;
  }
  for (const entry of entries) {
    if (ignoredSegments.has(entry.name)) continue;
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) await collectMarkdown(child, result);
    else if (entry.isFile() && entry.name.endsWith(".md")) result.push(child);
  }
}

async function validateNpmScripts(file, relativeFile, content) {
  const packageJson = await nearestPackageJson(path.dirname(file));
  const scripts = packageJson?.scripts || {};
  const matches = content.matchAll(/\bnpm run ([A-Za-z0-9:_-]+)/g);
  for (const match of matches) {
    if (!Object.hasOwn(scripts, match[1])) {
      failures.push(`${relativeFile}: unknown npm script ${match[1]}`);
    }
  }
}

async function nearestPackageJson(start) {
  let directory = start;
  while (directory.startsWith(root)) {
    const candidate = path.join(directory, "package.json");
    if (!packageCache.has(candidate)) {
      const parsed = await readFile(candidate, "utf8").then(JSON.parse).catch(() => null);
      packageCache.set(candidate, parsed);
    }
    const value = packageCache.get(candidate);
    if (value) return value;
    if (directory === root) break;
    directory = path.dirname(directory);
  }
  return null;
}

async function validateLinks(file, relativeFile, content) {
  const matches = content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g);
  for (const match of matches) {
    let target = match[1].trim().replace(/^<|>$/g, "");
    target = target.split(/\s+["']/)[0];
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    target = target.split("#")[0].split("?")[0];
    if (!target || /[<$*]/.test(target)) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      failures.push(`${relativeFile}: malformed link ${target}`);
      continue;
    }
    const absolute = path.isAbsolute(decoded) ? decoded : path.resolve(path.dirname(file), decoded);
    const exists = await access(absolute).then(() => true).catch(() => false);
    if (!exists) failures.push(`${relativeFile}: broken link ${target}`);
  }
}
