// 清理无引用的内容寻址 blob：ref_count = 0 且创建超过 7 天（给未完成的上传/回滚留缓冲期）。
// 先删数据库行再删文件；文件缺失（ENOENT）视为已清理。
import { existsSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const root = process.cwd();
const dataRoot = process.env.ZGCA_DATA_ROOT || path.join(root, "data");
const uploadRoot = process.env.ZGCA_UPLOAD_ROOT || path.join(dataRoot, "uploads");
const sqlite = path.join(dataRoot, "workbench.sqlite");

/** 与 src/lib/assets.ts 的 resolveAssetPathForRoot 相同的前缀包含检查，防止 storage_key 逃逸上传根目录。 */
function resolveUploadPath(relativePath) {
  const resolvedRoot = path.resolve(uploadRoot);
  const absolute = path.resolve(resolvedRoot, relativePath);
  if (absolute !== resolvedRoot && absolute.startsWith(`${resolvedRoot}${path.sep}`)) return absolute;
  throw new Error(`Invalid blob path: ${relativePath}`);
}

try {
  if (!existsSync(sqlite)) {
    console.log(`No database at ${sqlite}, nothing to collect`);
    process.exit(0);
  }

  const Database = require("better-sqlite3");
  const db = new Database(sqlite, { readonly: false });
  let reclaimedCount = 0;
  let reclaimedBytes = 0;
  try {
    db.pragma("busy_timeout = 5000");
    const orphans = db.prepare(`
      SELECT workspace_id, id, size, storage_key
      FROM blobs
      WHERE ref_count = 0 AND created_at <= datetime('now', '-7 days')
    `).all();

    const deleteBlob = db.prepare("DELETE FROM blobs WHERE workspace_id = ? AND id = ?");
    for (const blob of orphans) {
      let absolutePath;
      try {
        absolutePath = resolveUploadPath(blob.storage_key);
      } catch (error) {
        // 路径异常的行只告警不删文件，避免误删上传根目录之外的东西。
        console.warn(`Skipped blob ${blob.id}: ${error instanceof Error ? error.message : error}`);
        continue;
      }
      deleteBlob.run(blob.workspace_id, blob.id);
      try {
        unlinkSync(absolutePath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      reclaimedCount += 1;
      reclaimedBytes += Number(blob.size) || 0;
    }
  } finally {
    db.close();
  }

  console.log(`Reclaimed ${reclaimedCount} blobs, ${reclaimedBytes} bytes`);
} catch (error) {
  console.error(`Blob GC failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`);
  process.exitCode = 1;
}
