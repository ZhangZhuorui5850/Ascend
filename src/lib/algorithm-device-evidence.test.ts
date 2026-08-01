import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

describe("real-device evidence validator", () => {
  it("refuses unconfirmed reports", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/algorithm-device-evidence.mjs", "missing.json"],
      {
        cwd: root,
        encoding: "utf8",
        env: { NODE_ENV: "test", PATH: process.env.PATH || "" },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("real-devices-observed");
  });

  it("accepts only complete, hashed evidence for all three device classes", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ascend-device-evidence-"));
    try {
      const artifacts = ["phone-a", "phone-b", "tablet-a", "tablet-b", "desktop-a", "desktop-b"]
        .map((name) => {
          const file = `${name}.png`;
          const bytes = Buffer.from(`fixture:${name}`);
          writeFileSync(path.join(directory, file), bytes);
          return {
            path: file,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          };
        });
      const common = {
        login: true,
        pilotStatusVisible: true,
        catalog30: true,
        managedEditor: true,
        noHorizontalOverflow: true,
        draftRestore: true,
        sampleJudge: true,
        formalJudge: true,
        pollRecovery: true,
        reflectionRestore: true,
      };
      const report = {
        schemaVersion: 1,
        appCommit: "a".repeat(40),
        appUrl: "https://judge-staging.example",
        testedAt: new Date().toISOString(),
        devices: [
          {
            id: "phone-ios-pwa",
            os: "iOS 18.5",
            browser: "Safari standalone",
            viewport: { width: 390, height: 844, dpr: 3 },
            checks: {
              ...common,
              standalonePwa: true,
              safeArea: true,
              keyboardNoOcclusion: true,
              relaunchRestore: true,
            },
            artifacts: artifacts.slice(0, 2),
          },
          {
            id: "tablet",
            os: "iPadOS 18.5",
            browser: "Safari 18.5",
            viewport: { width: 768, height: 1024, dpr: 2 },
            checks: { ...common, portrait: true, landscape: true },
            artifacts: artifacts.slice(2, 4),
          },
          {
            id: "desktop",
            os: "macOS 15.5",
            browser: "Chrome 138",
            viewport: { width: 1440, height: 900, dpr: 2 },
            checks: { ...common, keyboardNavigation: true },
            artifacts: artifacts.slice(4, 6),
          },
        ],
      };
      const reportPath = path.join(directory, "evidence.json");
      writeFileSync(reportPath, JSON.stringify(report));
      const result = spawnSync(
        process.execPath,
        ["scripts/algorithm-device-evidence.mjs", reportPath],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            NODE_ENV: "test",
            PATH: process.env.PATH || "",
            ASCEND_DEVICE_EVIDENCE_CONFIRM: "real-devices-observed",
          },
        },
      );
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        artifactCount: 6,
        deviceIds: ["phone-ios-pwa", "tablet", "desktop"],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
