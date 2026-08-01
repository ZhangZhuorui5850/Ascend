import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const node = process.execPath;

await run(node, [path.join(root, "scripts/backup.mjs")]);
await run(node, [path.join(root, "scripts/verify-backup.mjs")]);
await notifySuccess(process.env.ZGCA_BACKUP_SUCCESS_URL);

console.log(JSON.stringify({
  event: "backup_verified_complete",
  notified: Boolean(process.env.ZGCA_BACKUP_SUCCESS_URL),
  completedAt: new Date().toISOString(),
}));

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(args[0])} failed (${signal || `code ${code}`})`));
    });
  });
}

async function notifySuccess(rawUrl) {
  if (!rawUrl) return;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("ZGCA_BACKUP_SUCCESS_URL is not a valid URL");
  }
  const localDevelopment = process.env.NODE_ENV !== "production"
    && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new Error("ZGCA_BACKUP_SUCCESS_URL must use HTTPS in production");
  }
  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify({
      event: "ascend_backup_verified",
      completedAt: new Date().toISOString(),
    }),
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Backup success signal returned HTTP ${response.status}`);
}
