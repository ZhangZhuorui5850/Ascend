import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

describe("CI E2E isolation contract", () => {
  it("refuses to start without an explicit isolation marker", () => {
    const result = spawnSync(process.execPath, ["scripts/ci-e2e.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { NODE_ENV: "test", PATH: process.env.PATH || "" },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ASCEND_E2E_ISOLATED=1");
  });

  it("keeps PR verification fast and reserves isolated browser audits for main and nightly", () => {
    const workflow = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    expect(workflow).toContain("if: github.event_name != 'pull_request'");
    expect(workflow).toContain("npm run ci:e2e");
    expect(workflow).toContain("github.event_name == 'schedule' && 'full' || 'critical'");
    expect(workflow).toContain("${{ runner.temp }}/ascend-e2e-data");
  });
});
