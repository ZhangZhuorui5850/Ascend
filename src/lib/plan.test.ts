import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPlanDocument } from "./plan";

describe("readPlanDocument", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("returns an empty state instead of throwing when the source markdown is missing", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "zgca-plan-missing-"));
    roots.push(root);

    expect(readPlanDocument(root)).toEqual({
      exists: false,
      content: "",
      path: path.join(root, "agent沟通", "02_十周做题驱动备考计划.md"),
    });
  });

  it("reads and truncates the plan markdown when present", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "zgca-plan-present-"));
    roots.push(root);
    const planDir = path.join(root, "agent沟通");
    await mkdir(planDir, { recursive: true });
    await writeFile(path.join(planDir, "02_十周做题驱动备考计划.md"), `${"a".repeat(12001)}tail`);

    const result = readPlanDocument(root);

    expect(result.exists).toBe(true);
    expect(result.content).toHaveLength(12000);
  });
});
