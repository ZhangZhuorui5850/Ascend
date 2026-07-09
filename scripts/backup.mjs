import { cpSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const root = process.cwd();
const dataRoot = process.env.ZGCA_DATA_ROOT || path.join(root, "data");
const backupRoot = process.env.ZGCA_BACKUP_ROOT || path.join(root, "backups");
const stamp = new Date().toISOString().slice(0, 10);
const target = path.join(backupRoot, stamp);

mkdirSync(target, { recursive: true });

const sqlite = path.join(dataRoot, "workbench.sqlite");
if (existsSync(sqlite)) {
  // 用 SQLite 自带的在线备份，先把 WAL checkpoint 进主文件，保证备份是一致的快照。
  const Database = require("better-sqlite3");
  const db = new Database(sqlite, { readonly: false });
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
    await db.backup(path.join(target, "workbench.sqlite"));
  } finally {
    db.close();
  }
}

const uploads = path.join(dataRoot, "uploads");
if (existsSync(uploads)) {
  cpSync(uploads, path.join(target, "uploads"), { recursive: true });
}

console.log(`Backup written to ${target}`);
