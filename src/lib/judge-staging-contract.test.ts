import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const compose = readFileSync(
  path.join(root, "deploy/judge0-staging/compose.yml"),
  "utf8",
);
describe("Judge0 staging contract", () => {
  it("pins the upstream release and keeps every runtime endpoint on an internal or loopback boundary", () => {
    expect(compose).toContain("judge0/judge0:1.13.1");
    expect(compose).not.toMatch(/judge0\/judge0:latest(?:\s|$)/m);
    expect(compose).toContain('"127.0.0.1:2358:2358"');
    expect(compose).toContain('"127.0.0.1:4100:4100"');
    expect(compose).toContain("internal: true");
    expect(compose).not.toMatch(
      /docker\.sock|\/opt\/apps\/ascend|\/app\/data|\/app\/backups/,
    );
  });

  it("keeps strict Judge0 resource boundaries while the managed catalog is empty", () => {
    const settings = composeSettings(compose);
    expect(Number(settings.MAX_CPU_TIME_LIMIT)).toBeGreaterThanOrEqual(1);
    expect(Number(settings.MAX_MEMORY_LIMIT)).toBeGreaterThanOrEqual(131_072);
    expect(Number(settings.MAX_SUBMISSION_BATCH_SIZE)).toBeGreaterThanOrEqual(1);
    expect(settings.MAX_PROCESSES_AND_OR_THREADS).toBe("1");
    expect(settings.MAX_MAX_PROCESSES_AND_OR_THREADS).toBe("1");
    expect(settings.ALLOW_ENABLE_NETWORK).toBe("false");
    expect(settings.ENABLE_NETWORK).toBe("false");
    expect(settings.ENABLE_ADDITIONAL_FILES).toBe("false");
    expect(settings.ENABLE_CALLBACKS).toBe("false");
    expect(settings.ENABLE_COMPILER_OPTIONS).toBe("false");
    expect(settings.ENABLE_COMMAND_LINE_ARGUMENTS).toBe("false");
  });

  it("fails closed before host or runtime inspection without explicit dedicated-VM confirmations", () => {
    for (const script of [
      "scripts/judge-host-preflight.mjs",
      "scripts/judge-staging-verify.mjs",
    ]) {
      const result = spawnSync(process.execPath, [script], {
        cwd: root,
        encoding: "utf8",
        env: { NODE_ENV: "test", PATH: process.env.PATH || "" },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Refusing");
    }
  });
});

function composeSettings(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^[A-Z][A-Z0-9_]*:\s+"/.test(line))
      .map((line) => {
        const separator = line.indexOf(":");
        return [
          line.slice(0, separator),
          line.slice(separator + 1).trim().replace(/^"|"$/g, ""),
        ];
      }),
  );
}
