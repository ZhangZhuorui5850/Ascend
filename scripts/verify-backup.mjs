import { createHash } from "node:crypto";
import {
  createReadStream,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const backupRoot = process.env.ZGCA_BACKUP_ROOT || path.join(process.cwd(), "backups");
const mirrorRoot = process.env.ZGCA_BACKUP_MIRROR_ROOT || "";
const requested = process.argv[2];
const snapshot = requested ? path.resolve(requested) : latestSnapshot(backupRoot);
if (!snapshot) throw new Error("没有可验证的备份快照");

const manifestPath = path.join(snapshot, "backup-manifest.json");
const successPath = path.join(snapshot, "_SUCCESS");
const verifiedPath = path.join(snapshot, "_VERIFIED");
const databasePath = path.join(snapshot, "workbench.sqlite");
let restoreRoot = "";

try {
  if (!existsSync(manifestPath) || !existsSync(successPath) || !existsSync(databasePath)) {
    throw new Error("备份缺少 manifest、成功标记或数据库文件");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  validateManifest(manifest);

  const databaseBytes = statSync(databasePath).size;
  const databaseSha256 = await sha256File(databasePath);
  if (manifest.database.bytes !== databaseBytes || manifest.database.sha256 !== databaseSha256) {
    throw new Error("数据库大小或 SHA-256 不一致");
  }

  const uploadCheck = await verifyUploads(snapshot, manifest.uploads.files);
  const databaseCheck = inspectDatabase(databasePath, uploadCheck.byPath);

  restoreRoot = mkdtempSync(path.join(tmpdir(), "ascend-restore-smoke-"));
  const restoredDatabase = path.join(restoreRoot, "workbench.sqlite");
  cpSync(databasePath, restoredDatabase);
  if (existsSync(path.join(snapshot, "uploads"))) {
    cpSync(path.join(snapshot, "uploads"), path.join(restoreRoot, "uploads"), { recursive: true });
  } else {
    mkdirSync(path.join(restoreRoot, "uploads"), { recursive: true });
  }
  const restoredUploads = await verifyUploads(restoreRoot, manifest.uploads.files);
  const restoredDatabaseCheck = inspectDatabase(restoredDatabase, restoredUploads.byPath);

  const mirrorComplete = verifyMirror(snapshot, databaseBytes, databaseSha256);
  const result = {
    ok: true,
    snapshot,
    applicationCommit: manifest.applicationCommit,
    appliedMigrations: manifest.appliedMigrations,
    integrity: databaseCheck.integrity,
    database: { bytes: databaseBytes, sha256: databaseSha256 },
    uploads: { count: uploadCheck.count, bytes: uploadCheck.bytes },
    databaseReferences: databaseCheck.references,
    restoreSmoke: {
      ok: true,
      uploadFiles: restoredUploads.count,
      databaseReferences: restoredDatabaseCheck.references,
    },
    mirrorComplete,
  };
  const marker = {
    schema: "ascend.backup-verification",
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    applicationCommit: manifest.applicationCommit,
    appliedMigrations: manifest.appliedMigrations,
    checks: {
      sqliteIntegrity: databaseCheck.integrity,
      databaseSha256,
      uploadFiles: uploadCheck.count,
      uploadBytes: uploadCheck.bytes,
      databaseReferences: databaseCheck.references,
      isolatedRestore: { ok: true, uploadFiles: restoredUploads.count },
      mirrorComplete,
    },
  };
  writeFileSync(verifiedPath, `${JSON.stringify(marker, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (existsSync(verifiedPath)) unlinkSync(verifiedPath);
  console.error(`Backup verification failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`);
  process.exitCode = 1;
} finally {
  if (restoreRoot) rmSync(restoreRoot, { recursive: true, force: true });
}

function validateManifest(manifest) {
  if (manifest?.schema !== "ascend.backup-manifest" || manifest?.schemaVersion !== 2 || manifest?.status !== "ok")
    throw new Error("备份 manifest 格式或状态无效");
  if (!Array.isArray(manifest.appliedMigrations) || !Array.isArray(manifest.uploads?.files))
    throw new Error("备份 manifest 缺少迁移或附件清单");
  if (!manifest.database?.sha256 || !Number.isInteger(manifest.database?.bytes))
    throw new Error("备份 manifest 缺少数据库校验值");
}

async function verifyUploads(root, entries) {
  const uploadsRoot = path.resolve(root, "uploads");
  const byPath = new Map();
  let bytes = 0;
  for (const entry of entries) {
    if (!entry || typeof entry.path !== "string" || !Number.isInteger(entry.bytes) || typeof entry.sha256 !== "string")
      throw new Error("附件 manifest 项格式无效");
    const filePath = safeUploadPath(uploadsRoot, entry.path);
    if (!existsSync(filePath)) throw new Error(`附件缺失：${entry.path}`);
    const actualBytes = statSync(filePath).size;
    const actualSha256 = await sha256File(filePath);
    if (actualBytes !== entry.bytes || actualSha256 !== entry.sha256)
      throw new Error(`附件大小或 SHA-256 不一致：${entry.path}`);
    if (byPath.has(entry.path)) throw new Error(`附件 manifest 路径重复：${entry.path}`);
    byPath.set(entry.path, { ...entry, filePath });
    bytes += entry.bytes;
  }
  const actualPaths = existsSync(uploadsRoot) ? walkFiles(uploadsRoot).sort() : [];
  if (actualPaths.length !== entries.length || actualPaths.some((item) => !byPath.has(item)))
    throw new Error("附件目录与 manifest 文件清单不一致");
  return { count: entries.length, bytes, byPath };
}

function inspectDatabase(filePath, uploadsByPath) {
  const database = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const integrity = database.pragma("integrity_check").map((row) => row.integrity_check);
    if (integrity.length !== 1 || integrity[0] !== "ok")
      throw new Error(`SQLite integrity_check 失败：${integrity.join(", ")}`);
    const errors = [];
    let assetCount = 0;
    let blobCount = 0;
    if (tableExists(database, "assets") && columns(database, "assets").has("relative_path")) {
      const rows = database
        .prepare("SELECT id, relative_path, size FROM assets WHERE relative_path IS NOT NULL AND relative_path != ''")
        .all();
      assetCount = rows.length;
      for (const row of rows) {
        const upload = uploadsByPath.get(row.relative_path);
        if (!upload) errors.push(`asset ${row.id} 缺少附件 ${row.relative_path}`);
        else if (Number(row.size) !== upload.bytes) errors.push(`asset ${row.id} 大小不匹配`);
      }
    }
    if (tableExists(database, "blobs") && columns(database, "blobs").has("storage_key")) {
      const rows = database.prepare("SELECT id, storage_key, size, sha256 FROM blobs").all();
      blobCount = rows.length;
      for (const row of rows) {
        const upload = uploadsByPath.get(row.storage_key);
        if (!upload) errors.push(`blob ${row.id} 缺少附件 ${row.storage_key}`);
        else {
          if (Number(row.size) !== upload.bytes) errors.push(`blob ${row.id} 大小不匹配`);
          if (row.sha256 !== upload.sha256) errors.push(`blob ${row.id} SHA-256 不匹配`);
        }
      }
    }
    if (errors.length) throw new Error(`数据库附件引用校验失败：${errors.join("；")}`);
    return { integrity, references: { ok: true, assets: assetCount, blobs: blobCount, errors: [] } };
  } finally {
    database.close();
  }
}

function tableExists(database, name) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}
function columns(database, table) {
  return new Set(
    database
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => row.name),
  );
}
function verifyMirror(primarySnapshot, bytes, sha256) {
  if (!mirrorRoot) return null;
  const mirrorSnapshot = path.join(path.resolve(mirrorRoot), path.basename(primarySnapshot));
  const mirrorDatabase = path.join(mirrorSnapshot, "workbench.sqlite");
  if (!existsSync(path.join(mirrorSnapshot, "_SUCCESS")) || !existsSync(mirrorDatabase))
    throw new Error("镜像备份缺少成功标记或数据库");
  if (statSync(mirrorDatabase).size !== bytes) throw new Error("镜像数据库大小不一致");
  const mirrorManifest = JSON.parse(readFileSync(path.join(mirrorSnapshot, "backup-manifest.json"), "utf8"));
  if (mirrorManifest.database?.sha256 !== sha256) throw new Error("镜像数据库 SHA-256 不一致");
  return true;
}
function safeUploadPath(root, relative) {
  const normalized = relative.replaceAll("\\\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes(".."))
    throw new Error(`附件路径越界：${relative}`);
  const resolved = path.resolve(root, normalized);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`附件路径越界：${relative}`);
  return resolved;
}
function walkFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return walkFiles(path.join(directory, entry.name), relative);
    return entry.isFile() ? [relative] : [];
  });
}
async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function latestSnapshot(root) {
  if (!existsSync(root)) return null;
  const names = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  return names.length ? path.join(root, names[names.length - 1]) : null;
}
