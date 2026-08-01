import { readFileSync } from "node:fs";
import path from "node:path";

const files = [
  "src/app/globals.css",
  "src/styles/domains/assets-mobile.css",
  "src/styles/summit.css",
];
const selectors = new Map();
const summaries = [];
const errors = [];

for (const relative of files) {
  const source = readFileSync(path.resolve(relative), "utf8");
  const lines = source.split(/\r?\n/).length;
  const open = [...source].filter((character) => character === "{").length;
  const close = [...source].filter((character) => character === "}").length;
  if (open !== close) errors.push(`${relative}: unbalanced braces (${open}/${close})`);
  if (source.includes("animation:") && !source.includes("prefers-reduced-motion")) {
    errors.push(`${relative}: animations require a prefers-reduced-motion guard`);
  }
  const fileSelectors = new Set();
  for (const match of source.matchAll(/([^{}]+)\{/g)) {
    const candidate = match[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (!candidate || candidate.startsWith("@") || candidate === "from" || candidate === "to") continue;
    for (const selector of candidate.split(",").map((value) => value.trim()).filter(Boolean)) {
      fileSelectors.add(selector);
      const locations = selectors.get(selector) ?? [];
      locations.push(relative);
      selectors.set(selector, locations);
    }
  }
  summaries.push({ file: relative, lines, bytes: Buffer.byteLength(source), selectors: fileSelectors.size });
}

const duplicates = [...selectors.entries()]
  .filter(([, locations]) => locations.length > 1)
  .map(([selector, locations]) => ({ selector, occurrences: locations.length, files: [...new Set(locations)] }))
  .sort((left, right) => right.occurrences - left.occurrences || left.selector.localeCompare(right.selector));
const result = {
  ok: errors.length === 0,
  files: summaries,
  totals: {
    lines: summaries.reduce((sum, file) => sum + file.lines, 0),
    selectors: selectors.size,
    duplicateSelectors: duplicates.length,
  },
  duplicateSample: duplicates.slice(0, 25),
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
