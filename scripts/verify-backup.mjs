import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
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
const databasePath = path.join(snapshot, "workbench.sqlite");
if (!existsSync(manifestPath) || !existsSync(successPath) || !existsSync(databasePath)) {
  throw new Error("备份缺少 manifest、成功标记或数据库文件");
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const db = new Database(databasePath, { readonly: true, fileMustExist: true });
let integrity;
try {
  integrity = db.pragma("integrity_check").map((row) => row.integrity_check);
} finally {
  db.close();
}
const databaseBytes = statSync(databasePath).size;
const mirrorSnapshot = mirrorRoot ? path.join(path.resolve(mirrorRoot), path.basename(snapshot)) : "";
const mirrorComplete = mirrorSnapshot
  ? existsSync(path.join(mirrorSnapshot, "_SUCCESS"))
    && existsSync(path.join(mirrorSnapshot, "workbench.sqlite"))
    && statSync(path.join(mirrorSnapshot, "workbench.sqlite")).size === databaseBytes
  : null;
const ok = integrity.length === 1
  && integrity[0] === "ok"
  && manifest.status === "ok"
  && manifest.databaseBytes === databaseBytes
  && mirrorComplete !== false;
console.log(JSON.stringify({ ok, snapshot, integrity, databaseBytes, mirrorComplete }, null, 2));
if (!ok) process.exitCode = 1;

function latestSnapshot(root) {
  if (!existsSync(root)) return null;
  const names = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  return names.length ? path.join(root, names[names.length - 1]) : null;
}
