import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getUploadRoot } from "./db";
import { sanitizeFileName, storageNamespaceForWorkspace } from "./storage";

import { MAX_UPLOAD_BYTES } from "./limits";

export { MAX_UPLOAD_BYTES };

export type StoredUpload = {
  sha256: string;
  relativePath: string;
  absolutePath: string;
  safeName: string;
  size: number;
};

export function storageKeyFor(workspaceId: string, day: string, sha256: string, originalName: string): string {
  const workspaceStorageKey = storageNamespaceForWorkspace(workspaceId);
  const [year, month, date] = day.split("-");
  if (!year || !month || !date) throw new Error(`Invalid day: ${day}`);
  void originalName;
  return path.posix.join(workspaceStorageKey, "blobs", sha256.slice(0, 2), sha256);
}

export async function storeUploadedFile(input: {
  workspaceId: string;
  file: File;
  day: string;
  uploadRoot?: string;
}): Promise<StoredUpload> {
  if (input.file.size > MAX_UPLOAD_BYTES) throw new Error("File is too large");

  const bytes = Buffer.from(await input.file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const relativePath = storageKeyFor(input.workspaceId, input.day, sha256, input.file.name);
  const absolutePath = input.uploadRoot ? resolveAssetPathForRoot(input.uploadRoot, relativePath) : resolveAssetPath(relativePath);

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

export function resolveWorkspaceAssetPathForRoot(
  uploadRoot: string,
  workspaceId: string,
  relativePath: string,
): string {
  const workspaceStorageKey = storageNamespaceForWorkspace(workspaceId);
  const normalized = relativePath.replaceAll("\\", "/");
  if (!normalized.startsWith(`${workspaceStorageKey}/`)) throw new Error("Invalid workspace asset path");
  return resolveAssetPathForRoot(uploadRoot, normalized);
}

export function resolveWorkspaceAssetPath(workspaceId: string, relativePath: string): string {
  return resolveWorkspaceAssetPathForRoot(getUploadRoot(), workspaceId, relativePath);
}

export function contentDispositionFor(mimeType: string, originalName: string): string {
  const inlineMimeTypes = new Set([
    "application/pdf",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/plain",
    "text/markdown",
    "text/csv",
  ]);
  const disposition = inlineMimeTypes.has(mimeType.toLowerCase()) ? "inline" : "attachment";
  // HTTP 头只允许 Latin-1：引号回退名必须剔除中文等字符（500 的根源），真实文件名走 filename* 的 UTF-8 编码段。
  const ascii = sanitizeFileName(originalName).replace(/"/g, "_").replace(/[^\x20-\x7e]/g, "_");
  const fallback = ascii.replace(/_+/g, "_") || "file";
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
}

export async function streamAssetFile(
  absolutePath: string,
  range?: { start: number; end: number },
): Promise<ReadableStream<Uint8Array>> {
  await stat(absolutePath);
  // createReadStream 的 start/end 均为闭区间，恰好对应 HTTP Range 语义。
  const stream = range ? createReadStream(absolutePath, { start: range.start, end: range.end }) : createReadStream(absolutePath);
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

/** 按扩展名纠正的 MIME 类型表：浏览器对代码/文本类文件经常给空或错误的 type。 */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  log: "text/plain",
  csv: "text/csv",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  json: "application/json",
  py: "text/plain",
  js: "text/plain",
  ts: "text/plain",
  c: "text/plain",
  cpp: "text/plain",
  h: "text/plain",
  java: "text/plain",
  sql: "text/plain",
  sh: "text/plain",
  yml: "text/plain",
  yaml: "text/plain",
  xml: "text/plain",
};

/** 服务端 MIME 纠正：扩展名命中时以服务端映射为准，否则信任客户端 type，最后兜底二进制流。 */
export function mimeTypeForUpload(name: string, clientType: string): string {
  const extension = path.extname(name).slice(1).toLowerCase();
  return EXTENSION_MIME_TYPES[extension] || clientType || "application/octet-stream";
}

function isFileExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST";
}
