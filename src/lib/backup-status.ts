import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type BackupFreshness = {
  status: "fresh" | "stale" | "missing" | "error";
  createdAt: string | null;
  verifiedAt: string | null;
  ageHours: number | null;
  snapshot: string | null;
};

export function getBackupFreshness(
  backupRoot = process.env.ZGCA_BACKUP_ROOT || path.join(process.cwd(), "backups"),
  input: { now?: Date; maxAgeHours?: number } = {},
): BackupFreshness {
  if (!existsSync(backupRoot)) return empty("missing");
  const snapshots = readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const snapshot of snapshots) {
    const root = path.join(backupRoot, snapshot);
    const manifestPath = path.join(root, "backup-manifest.json");
    const verifiedPath = path.join(root, "_VERIFIED");
    if (!existsSync(manifestPath) || !existsSync(verifiedPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { createdAt?: unknown };
      const marker = JSON.parse(readFileSync(verifiedPath, "utf8")) as { verifiedAt?: unknown };
      if (typeof manifest.createdAt !== "string" || typeof marker.verifiedAt !== "string") return empty("error");
      const createdMs = Date.parse(manifest.createdAt);
      const verifiedMs = Date.parse(marker.verifiedAt);
      if (!Number.isFinite(createdMs) || !Number.isFinite(verifiedMs)) return empty("error");
      const now = input.now ?? new Date();
      const ageHours = Math.max(0, Math.round(((now.getTime() - createdMs) / 3_600_000) * 10) / 10);
      const maxAgeHours = input.maxAgeHours ?? configuredMaxAgeHours();
      return {
        status: ageHours <= maxAgeHours ? "fresh" : "stale",
        createdAt: manifest.createdAt,
        verifiedAt: marker.verifiedAt,
        ageHours,
        snapshot,
      };
    } catch {
      return empty("error");
    }
  }
  return empty("missing");
}

function configuredMaxAgeHours(): number {
  const raw = Number(process.env.ZGCA_BACKUP_MAX_AGE_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 36;
}

function empty(status: "missing" | "error"): BackupFreshness {
  return { status, createdAt: null, verifiedAt: null, ageHours: null, snapshot: null };
}
