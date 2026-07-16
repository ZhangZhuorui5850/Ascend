import {
  copyFileSync,
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const root = process.cwd();
const dataRoot = process.env.ZGCA_DATA_ROOT || path.join(root, "data");
const backupRoot = process.env.ZGCA_BACKUP_ROOT || path.join(root, "backups");
const mirrorRoot = process.env.ZGCA_BACKUP_MIRROR_ROOT || "";
// 保留最近 N 份按日期命名的备份，默认 14 份。
const keepCount = (() => {
  const raw = Number(process.env.ZGCA_BACKUP_KEEP);
  return Number.isInteger(raw) && raw > 0 ? raw : 14;
})();
const stamp = new Date().toISOString().slice(0, 10);
const target = path.join(backupRoot, stamp);

/** 递归列出目录下所有文件的相对路径（POSIX 分隔符）。 */
function walkFiles(dir, prefix = "") {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walkFiles(path.join(dir, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

/** 备份根目录下按日期命名的历史备份目录，升序排列。 */
function listBackupDirs() {
  if (!existsSync(backupRoot)) return [];
  return readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

try {
  mkdirSync(target, { recursive: true });
  let databaseBytes = 0;
  let uploadFiles = 0;
  let uploadBytes = 0;

  const sqlite = path.join(dataRoot, "workbench.sqlite");
  if (existsSync(sqlite)) {
    // 用 SQLite 自带的在线备份，先把 WAL checkpoint 进主文件，保证备份是一致的快照。
    const Database = require("better-sqlite3");
    const db = new Database(sqlite, { readonly: false });
    try {
      // 备份可能与在线服务并发运行，遇锁等待而不是立刻失败。
      db.pragma("busy_timeout = 5000");
      try {
        db.pragma("wal_checkpoint(TRUNCATE)");
      } catch (error) {
        // checkpoint 被长事务挡住也没关系：db.backup() 本身就是一致的快照。
        console.warn(`wal_checkpoint skipped: ${error instanceof Error ? error.message : error}`);
      }
      await db.backup(path.join(target, "workbench.sqlite"));
      databaseBytes = statSync(path.join(target, "workbench.sqlite")).size;
    } finally {
      db.close();
    }
  }

  const uploads = path.join(dataRoot, "uploads");
  if (existsSync(uploads)) {
    // 增量复制：内容寻址的 blob 不可变，同相对路径 ⇒ 同内容，直接对上一份备份做硬链接省空间省时间。
    const previousStamp = listBackupDirs().filter((name) => name !== stamp).pop();
    const previousUploads = previousStamp ? path.join(backupRoot, previousStamp, "uploads") : null;
    let linked = 0;
    let copied = 0;
    for (const relative of walkFiles(uploads)) {
      const source = path.join(uploads, relative);
      uploadFiles += 1;
      uploadBytes += statSync(source).size;
      const destination = path.join(target, "uploads", relative);
      if (existsSync(destination)) continue;
      mkdirSync(path.dirname(destination), { recursive: true });
      const previousFile = previousUploads ? path.join(previousUploads, relative) : null;
      if (previousFile && existsSync(previousFile)) {
        try {
          linkSync(previousFile, destination);
          linked += 1;
          continue;
        } catch {
          // 跨设备或文件系统不支持硬链接时退回复制。
        }
      }
      copyFileSync(source, destination);
      copied += 1;
    }
    console.log(`Uploads: ${copied} copied, ${linked} hard-linked`);
  }

  const manifest = {
    status: "ok",
    createdAt: new Date().toISOString(),
    stamp,
    databaseBytes,
    uploadFiles,
    uploadBytes,
  };
  writeFileSync(path.join(target, "backup-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(target, "_SUCCESS"), `${manifest.createdAt}\n`);

  if (mirrorRoot) {
    const resolvedMirror = path.resolve(mirrorRoot);
    const resolvedBackup = path.resolve(backupRoot);
    if (resolvedMirror === resolvedBackup || resolvedMirror.startsWith(`${resolvedBackup}${path.sep}`)) {
      throw new Error("ZGCA_BACKUP_MIRROR_ROOT 必须位于主备份目录之外");
    }
    mkdirSync(resolvedMirror, { recursive: true });
    cpSync(target, path.join(resolvedMirror, stamp), { recursive: true, force: true });
    console.log(JSON.stringify({ event: "backup_mirrored", stamp, mirrorRoot: resolvedMirror }));
  }

  // 轮转：只保留最近 keepCount 份，删掉更早的。
  const dirs = listBackupDirs();
  for (const name of dirs.slice(0, Math.max(0, dirs.length - keepCount))) {
    rmSync(path.join(backupRoot, name), { recursive: true, force: true });
    console.log(`Pruned old backup ${name}`);
  }

  console.log(JSON.stringify({ event: "backup_complete", target, ...manifest }));
} catch (error) {
  console.error(`Backup failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`);
  process.exitCode = 1;
}
