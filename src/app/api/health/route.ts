import { accessSync, constants, mkdirSync, statSync, statfsSync } from "node:fs";
import path from "node:path";
import { getBackupFreshness, type BackupFreshness } from "@/lib/backup-status";
import { getDataRoot, getDb, getUploadRoot } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 磁盘剩余空间下限，低于该值即报 low_disk；默认 2GiB，可用 ZGCA_MIN_FREE_BYTES 覆盖。 */
const DEFAULT_MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024;

type HealthPayload = {
  status: string;
  db: "ok" | "error";
  diskFreeBytes: number | null;
  walBytes: number | null;
  uploadsWritable: boolean;
  backup: BackupFreshness;
};

function minFreeBytes(): number {
  const raw = Number(process.env.ZGCA_MIN_FREE_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MIN_FREE_BYTES;
}

function healthResponse(payload: HealthPayload, status = 200): Response {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export function GET() {
  // 数据库可用性：最基础的探针，失败即整体不可用。
  let db: "ok" | "error" = "ok";
  try {
    getDb().prepare("SELECT 1 AS healthy").get();
  } catch {
    db = "error";
  }

  // 磁盘剩余空间：statfsSync 在部分平台/Node 版本不可用，探测失败时降级为 null（不因探针本身报错而拉低健康度）。
  let diskFreeBytes: number | null = null;
  try {
    const stats = statfsSync(getDataRoot());
    diskFreeBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch {
    diskFreeBytes = null;
  }

  // 上传目录可写性：目录可能尚未创建（首次上传前），先补建再探测。
  let uploadsWritable = false;
  try {
    const uploadRoot = getUploadRoot();
    mkdirSync(uploadRoot, { recursive: true });
    accessSync(uploadRoot, constants.W_OK);
    uploadsWritable = true;
  } catch {
    uploadsWritable = false;
  }

  // WAL 文件大小：持续膨胀通常意味着 checkpoint 被长事务阻塞；文件不存在（刚 checkpoint 完）是正常情况。
  let walBytes: number | null = null;
  try {
    walBytes = statSync(path.join(getDataRoot(), "workbench.sqlite-wal")).size;
  } catch {
    walBytes = null;
  }

  const backup = getBackupFreshness();
  const payload: HealthPayload = { status: "ok", db, diskFreeBytes, walBytes, uploadsWritable, backup };
  if (db !== "ok") return healthResponse({ ...payload, status: "unavailable" }, 503);
  if (diskFreeBytes !== null && diskFreeBytes < minFreeBytes()) {
    return healthResponse({ ...payload, status: "low_disk" }, 503);
  }
  if (!uploadsWritable) return healthResponse({ ...payload, status: "uploads_readonly" }, 503);
  if (process.env.ZGCA_REQUIRE_FRESH_BACKUP === "1" && backup.status !== "fresh") {
    return healthResponse({ ...payload, status: "backup_unverified_or_stale" }, 503);
  }
  return healthResponse(payload);
}
