import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataRoot = process.env.ZGCA_DATA_ROOT || path.join(root, "data");
const backupRoot = process.env.ZGCA_BACKUP_ROOT || path.join(root, "backups");
const stamp = new Date().toISOString().slice(0, 10);
const target = path.join(backupRoot, stamp);

mkdirSync(target, { recursive: true });

const sqlite = path.join(dataRoot, "workbench.sqlite");
if (existsSync(sqlite)) {
  copyFileSync(sqlite, path.join(target, "workbench.sqlite"));
}

const uploads = path.join(dataRoot, "uploads");
if (existsSync(uploads)) {
  cpSync(uploads, path.join(target, "uploads"), { recursive: true });
}

console.log(`Backup written to ${target}`);
