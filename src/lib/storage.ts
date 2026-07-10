import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type StoredAsset = {
  relativePath: string;
  absolutePath: string;
  safeName: string;
};

export async function copyAssetIntoLibrary(input: {
  sourcePath: string;
  originalName: string;
  day: string;
  workspaceId: string;
  uploadRoot: string;
}): Promise<StoredAsset> {
  const [year, month, date] = input.day.split("-");
  if (!year || !month || !date) {
    throw new Error(`Invalid day: ${input.day}`);
  }

  const safeName = sanitizeFileName(input.originalName);
  const workspaceStorageKey = storageNamespaceForWorkspace(input.workspaceId);
  const relativePath = path.posix.join(workspaceStorageKey, year, month, date, "original", safeName);
  const absolutePath = path.join(input.uploadRoot, workspaceStorageKey, year, month, date, "original", safeName);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await copyFile(input.sourcePath, absolutePath);

  return { relativePath, absolutePath, safeName };
}

export function sanitizeFileName(name: string): string {
  const baseName = path.basename(name).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
  return baseName || `asset-${Date.now()}`;
}

export function storageNamespaceForWorkspace(workspaceId: string): string {
  if (!workspaceId || workspaceId === "." || workspaceId === ".." || /[\\/\u0000]/.test(workspaceId)) {
    throw new Error("Invalid workspace id");
  }
  return encodeURIComponent(workspaceId);
}
