import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scratchRoots: string[] = [];

afterEach(() => {
  for (const root of scratchRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("backup and isolated restore scripts", () => {
  it("keeps the production timer and verified backup entrypoint versioned", () => {
    const service = readFileSync(path.join(process.cwd(), "deploy/systemd/ascend-backup.service"), "utf8");
    const timer = readFileSync(path.join(process.cwd(), "deploy/systemd/ascend-backup.timer"), "utf8");
    const entrypoint = readFileSync(path.join(process.cwd(), "scripts/backup-verified.mjs"), "utf8");

    expect(service).toContain("node scripts/backup-verified.mjs");
    expect(service).toContain("TimeoutStartSec=2h");
    expect(timer).toContain("OnCalendar=*-*-* 03:20:00 Asia/Shanghai");
    expect(timer).toContain("Persistent=true");
    expect(entrypoint.indexOf("backup.mjs")).toBeLessThan(entrypoint.indexOf("verify-backup.mjs"));
    expect(entrypoint.indexOf("verify-backup.mjs")).toBeLessThan(entrypoint.indexOf("notifySuccess"));
    expect(entrypoint).not.toContain("console.log(rawUrl)");
  });

  it("records every attachment hash, verifies DB references, and rejects tampering", () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "ascend-backup-test-"));
    scratchRoots.push(scratch);
    const dataRoot = path.join(scratch, "data");
    const backupRoot = path.join(scratch, "backups");
    const relative = "workspace-test/blobs/ab/fixture";
    const uploadPath = path.join(dataRoot, "uploads", relative);
    mkdirSync(path.dirname(uploadPath), { recursive: true });
    const bytes = Buffer.from("verified attachment bytes");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(uploadPath, bytes);

    mkdirSync(dataRoot, { recursive: true });
    const db = new Database(path.join(dataRoot, "workbench.sqlite"));
    db.exec(`
      CREATE TABLE schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT NOT NULL
      );
      CREATE TABLE blobs (
        workspace_id TEXT NOT NULL,
        id TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        size INTEGER NOT NULL,
        mime_type TEXT NOT NULL DEFAULT '',
        storage_key TEXT NOT NULL,
        ref_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (workspace_id, id)
      );
      CREATE TABLE assets (
        workspace_id TEXT NOT NULL,
        id INTEGER NOT NULL,
        relative_path TEXT NOT NULL,
        size INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, id)
      );
    `);
    db.prepare("INSERT INTO schema_migrations (version, checksum) VALUES ('0001_test', 'fixture')").run();
    db.prepare(`
      INSERT INTO blobs (workspace_id, id, sha256, size, storage_key, ref_count)
      VALUES ('workspace-test', 'blob-1', ?, ?, ?, 1)
    `).run(sha256, bytes.length, relative);
    db.prepare(`
      INSERT INTO assets (workspace_id, id, relative_path, size)
      VALUES ('workspace-test', 1, ?, ?)
    `).run(relative, bytes.length);
    db.close();

    const environment = {
      ...process.env,
      ZGCA_DATA_ROOT: dataRoot,
      ZGCA_BACKUP_ROOT: backupRoot,
      ASCEND_APP_COMMIT: "test-commit",
    };
    const backup = spawnSync(process.execPath, ["scripts/backup-verified.mjs"], {
      cwd: process.cwd(),
      env: environment,
      encoding: "utf8",
    });
    expect(backup.status, backup.stderr).toBe(0);

    const [stamp] = readdirSync(backupRoot);
    const snapshot = path.join(backupRoot, stamp);
    const manifest = JSON.parse(readFileSync(path.join(snapshot, "backup-manifest.json"), "utf8"));
    expect(manifest).toMatchObject({
      schema: "ascend.backup-manifest",
      schemaVersion: 2,
      applicationCommit: "test-commit",
      appliedMigrations: ["0001_test"],
      uploads: {
        count: 1,
        bytes: bytes.length,
        files: [{ path: relative, bytes: bytes.length, sha256 }],
      },
    });

    const verified = spawnSync(process.execPath, ["scripts/verify-backup.mjs", snapshot], {
      cwd: process.cwd(),
      env: environment,
      encoding: "utf8",
    });
    expect(verified.status, verified.stderr).toBe(0);
    expect(JSON.parse(verified.stdout)).toMatchObject({
      ok: true,
      applicationCommit: "test-commit",
      databaseReferences: { ok: true, assets: 1, blobs: 1, errors: [] },
      restoreSmoke: {
        ok: true,
        uploadFiles: 1,
        databaseReferences: { ok: true },
      },
    });
    const marker = JSON.parse(readFileSync(path.join(snapshot, "_VERIFIED"), "utf8"));
    expect(marker).toMatchObject({
      schema: "ascend.backup-verification",
      schemaVersion: 1,
      applicationCommit: "test-commit",
      appliedMigrations: ["0001_test"],
      checks: {
        sqliteIntegrity: ["ok"],
        uploadFiles: 1,
        databaseReferences: { ok: true, assets: 1, blobs: 1, errors: [] },
        isolatedRestore: { ok: true, uploadFiles: 1 },
      },
    });

    writeFileSync(path.join(snapshot, "uploads", relative), "tampered");
    const tampered = spawnSync(process.execPath, ["scripts/verify-backup.mjs", snapshot], {
      cwd: process.cwd(),
      env: environment,
      encoding: "utf8",
    });
    expect(tampered.status).not.toBe(0);
    expect(tampered.stderr).toContain("附件大小或 SHA-256 不一致");
    expect(existsSync(path.join(snapshot, "_VERIFIED"))).toBe(false);
  });
});
