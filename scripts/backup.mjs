import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  createReadStream,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const root = process.cwd();
const dataRoot = process.env.ZGCA_DATA_ROOT || path.join(root, "data");
const backupRoot = process.env.ZGCA_BACKUP_ROOT || path.join(root, "backups");
const mirrorRoot = process.env.ZGCA_BACKUP_MIRROR_ROOT || "";
const keepCount = (() => {
  const raw = Number(process.env.ZGCA_BACKUP_KEEP);
  return Number.isInteger(raw) && raw > 0 ? raw : 14;
})();
const now = new Date();
const stamp = now.toISOString().replaceAll(":", "-").replace(".", "-");
const target = path.join(backupRoot, stamp);
const successPath = path.join(target, "_SUCCESS");

function walkFiles(dir, prefix = "") {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walkFiles(path.join(dir, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function listBackupDirs() {
  if (!existsSync(backupRoot)) return [];
  return readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function previousManifestEntries(previousStamp) {
  if (!previousStamp) return new Map();
  const manifestPath = path.join(backupRoot, previousStamp, "backup-manifest.json");
  if (!existsSync(manifestPath)) return new Map();
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.uploads?.files)) return new Map();
    return new Map(manifest.uploads.files.map((entry) => [entry.path, entry]));
  } catch {
    return new Map();
  }
}

try {
  mkdirSync(backupRoot, { recursive: true });
  mkdirSync(target, { recursive: false });
  const sqlite = path.join(dataRoot, "workbench.sqlite");
  if (!existsSync(sqlite)) throw new Error(`数据库不存在：${sqlite}`);

  const Database = require("better-sqlite3");
  const db = new Database(sqlite, { readonly: false });
  let appliedMigrations = [];
  try {
    db.pragma("busy_timeout = 5000");
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
    } catch (error) {
      console.warn(`wal_checkpoint skipped: ${error instanceof Error ? error.message : error}`);
    }
    await db.backup(path.join(target, "workbench.sqlite"));
    const hasMigrations = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    ).get();
    if (hasMigrations) {
      appliedMigrations = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()
        .map((row) => row.version);
    }
  } finally {
    db.close();
  }

  const databasePath = path.join(target, "workbench.sqlite");
  const databaseBytes = statSync(databasePath).size;
  const databaseSha256 = await sha256File(databasePath);
  const uploads = path.join(dataRoot, "uploads");
  const uploadEntries = [];
  let uploadBytes = 0;
  let linked = 0;
  let copied = 0;

  const previousStamp = listBackupDirs().filter((name) => name !== stamp).pop();
  const previousUploads = previousStamp ? path.join(backupRoot, previousStamp, "uploads") : null;
  const previousEntries = previousManifestEntries(previousStamp);
  if (existsSync(uploads)) {
    for (const relative of walkFiles(uploads).sort()) {
      const source = path.join(uploads, relative);
      const bytes = statSync(source).size;
      const sha256 = await sha256File(source);
      const destination = path.join(target, "uploads", relative);
      mkdirSync(path.dirname(destination), { recursive: true });
      const previousFile = previousUploads ? path.join(previousUploads, relative) : null;
      const previousEntry = previousEntries.get(relative);
      if (
        previousFile
        && previousEntry?.bytes === bytes
        && previousEntry?.sha256 === sha256
        && existsSync(previousFile)
      ) {
        try {
          linkSync(previousFile, destination);
          linked += 1;
        } catch {
          copyFileSync(source, destination);
          copied += 1;
        }
      } else {
        copyFileSync(source, destination);
        copied += 1;
      }
      const backedUpSha256 = await sha256File(destination);
      if (backedUpSha256 !== sha256 || statSync(destination).size !== bytes) {
        throw new Error(`附件备份校验失败：${relative}`);
      }
      uploadEntries.push({ path: relative, bytes, sha256 });
      uploadBytes += bytes;
    }
  }
  console.log(`Uploads: ${copied} copied, ${linked} hard-linked`);

  const manifest = {
    schema: "ascend.backup-manifest",
    schemaVersion: 2,
    status: "ok",
    createdAt: now.toISOString(),
    stamp,
    applicationCommit: process.env.ASCEND_APP_COMMIT || "unknown",
    appliedMigrations,
    database: {
      path: "workbench.sqlite",
      bytes: databaseBytes,
      sha256: databaseSha256,
    },
    uploads: {
      root: "uploads",
      count: uploadEntries.length,
      bytes: uploadBytes,
      files: uploadEntries,
    },
    // 保留 v1 日志字段，便于现有监控渐进迁移。
    databaseBytes,
    uploadFiles: uploadEntries.length,
    uploadBytes,
  };
  writeFileSync(path.join(target, "backup-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(successPath, `${manifest.createdAt}\n`);

  if (mirrorRoot) {
    const resolvedMirror = path.resolve(mirrorRoot);
    const resolvedBackup = path.resolve(backupRoot);
    if (resolvedMirror === resolvedBackup || resolvedMirror.startsWith(`${resolvedBackup}${path.sep}`)) {
      throw new Error("ZGCA_BACKUP_MIRROR_ROOT 必须位于主备份目录之外");
    }
    mkdirSync(resolvedMirror, { recursive: true });
    const mirrorTarget = path.join(resolvedMirror, stamp);
    const mirrorPartial = path.join(resolvedMirror, `.partial-${stamp}`);
    rmSync(mirrorPartial, { recursive: true, force: true });
    try {
      cpSync(target, mirrorPartial, { recursive: true, force: false });
      renameSync(mirrorPartial, mirrorTarget);
    } catch (error) {
      rmSync(mirrorPartial, { recursive: true, force: true });
      throw error;
    }
    console.log(JSON.stringify({ event: "backup_mirrored", stamp, mirrorRoot: resolvedMirror }));
  }

  const dirs = listBackupDirs();
  for (const name of dirs.slice(0, Math.max(0, dirs.length - keepCount))) {
    rmSync(path.join(backupRoot, name), { recursive: true, force: true });
    console.log(`Pruned old backup ${name}`);
  }

  console.log(JSON.stringify({ event: "backup_complete", target, ...manifest }));
} catch (error) {
  // _SUCCESS 只代表整个配置要求（含镜像）均完成；失败快照保留供排障，但不会被误认成成功。
  if (existsSync(successPath)) unlinkSync(successPath);
  console.error(`Backup failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`);
  process.exitCode = 1;
}
