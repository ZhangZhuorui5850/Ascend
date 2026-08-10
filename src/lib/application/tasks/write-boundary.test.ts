import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = new URL("../../../", import.meta.url);

function productionSources(relativeRoots: string[]): Array<{ path: string; source: string }> {
  const files: string[] = [];
  const visit = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if ([".ts", ".tsx"].includes(extname(entry.name)) && !entry.name.endsWith(".test.ts")) files.push(child);
    }
  };
  for (const root of relativeRoots) visit(new URL(root, SOURCE_ROOT).pathname);
  return files.map((path) => ({ path, source: readFileSync(path, "utf8") }));
}

describe("canonical write boundaries", () => {
  const runtime = productionSources(["app/actions/", "lib/agent/", "lib/application/"]);

  it("forbids runtime SQL writes to the legacy day_tasks fact source", () => {
    for (const file of runtime) {
      expect(file.source, file.path).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+day_tasks\b/i);
    }
  });

  it("forbids runtime callers from using legacy task and study-session mutations", () => {
    for (const file of runtime) {
      expect(file.source, file.path).not.toMatch(/\b(?:addTask|toggleTask|scheduleTask|carryOverTasks|createStudySession)\s*\(/);
    }
  });
});
