import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getUploadRoot } from "./db";
import { sanitizeFileName } from "./storage";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type StoredUpload = {
  sha256: string;
  relativePath: string;
  absolutePath: string;
  safeName: string;
  size: number;
};

export function storageKeyFor(day: string, sha256: string, originalName: string): string {
  const [year, month, date] = day.split("-");
  if (!year || !month || !date) throw new Error(`Invalid day: ${day}`);
  void originalName;
  return path.posix.join("blobs", sha256.slice(0, 2), sha256);
}

export async function storeUploadedFile(input: { file: File; day: string }): Promise<StoredUpload> {
  if (input.file.size > MAX_UPLOAD_BYTES) throw new Error("File is too large");

  const bytes = Buffer.from(await input.file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const relativePath = storageKeyFor(input.day, sha256, input.file.name);
  const absolutePath = resolveAssetPath(relativePath);

  mkdirSync(path.dirname(absolutePath), { recursive: true });
  try {
    writeFileSync(absolutePath, bytes, { flag: "wx" });
  } catch (error) {
    if (!isFileExistsError(error)) throw error;
  }

  return {
    sha256,
    relativePath,
    absolutePath,
    safeName: path.basename(relativePath),
    size: bytes.length,
  };
}

export function resolveAssetPathForRoot(uploadRoot: string, relativePath: string): string {
  const root = path.resolve(uploadRoot);
  const absolute = path.resolve(root, relativePath);
  if (absolute !== root && absolute.startsWith(`${root}${path.sep}`)) return absolute;
  throw new Error("Invalid asset path");
}

export function resolveAssetPath(relativePath: string): string {
  return resolveAssetPathForRoot(getUploadRoot(), relativePath);
}

export function contentDispositionFor(mimeType: string, originalName: string): string {
  const inlineMimeTypes = new Set(["application/pdf", "image/gif", "image/jpeg", "image/png", "image/webp"]);
  const disposition = inlineMimeTypes.has(mimeType.toLowerCase()) ? "inline" : "attachment";
  const fallback = sanitizeFileName(originalName).replace(/"/g, "_");
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
}

export async function streamAssetFile(absolutePath: string): Promise<ReadableStream<Uint8Array>> {
  await stat(absolutePath);
  return Readable.toWeb(createReadStream(absolutePath)) as ReadableStream<Uint8Array>;
}

function isFileExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST";
}
