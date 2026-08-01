import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getBackupFreshness } from "./backup-status";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("backup freshness", () => {
  it("reports only restore-verified snapshots and marks them stale by age", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ascend-backup-status-"));
    roots.push(root);
    const snapshot = path.join(root, "2026-07-24T00-00-00-000Z");
    mkdirSync(snapshot);
    writeFileSync(path.join(snapshot, "backup-manifest.json"), JSON.stringify({ createdAt: "2026-07-24T00:00:00.000Z" }));
    expect(getBackupFreshness(root)).toMatchObject({ status: "missing" });

    writeFileSync(path.join(snapshot, "_VERIFIED"), JSON.stringify({ verifiedAt: "2026-07-24T00:05:00.000Z" }));
    expect(getBackupFreshness(root, {
      now: new Date("2026-07-25T00:00:00.000Z"),
      maxAgeHours: 25,
    })).toMatchObject({
      status: "fresh",
      ageHours: 24,
      snapshot: "2026-07-24T00-00-00-000Z",
    });
    expect(getBackupFreshness(root, {
      now: new Date("2026-07-26T00:00:00.000Z"),
      maxAgeHours: 25,
    })).toMatchObject({ status: "stale", ageHours: 48 });
  });
});
