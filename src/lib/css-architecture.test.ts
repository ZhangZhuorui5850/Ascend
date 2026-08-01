import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

describe("CSS architecture contract", () => {
  it("keeps domain styles between shared globals and summit overrides", () => {
    const layout = readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
    expect(layout.indexOf('import "./globals.css"')).toBeLessThan(
      layout.indexOf('import "../styles/domains/assets-mobile.css"'),
    );
    expect(layout.indexOf('import "../styles/domains/assets-mobile.css"')).toBeLessThan(
      layout.indexOf('import "../styles/summit.css"'),
    );
  });

  it("passes the machine-readable CSS audit", () => {
    const audit = spawnSync(process.execPath, ["scripts/css-audit.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { NODE_ENV: "test", PATH: process.env.PATH || "" },
    });
    expect(audit.status, audit.stderr).toBe(0);
    expect(JSON.parse(audit.stdout)).toMatchObject({ ok: true, errors: [] });
  });
});
