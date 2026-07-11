import { statSync } from "node:fs";
import { contentDispositionFor, resolveWorkspaceAssetPath, streamAssetFile } from "@/lib/assets";
import { getDb } from "@/lib/db";
import { authErrorResponse, requireWorkspace } from "@/lib/request-auth";

/** 解析单段 Range 头（bytes=start-end / bytes=start- / bytes=-suffix）；无法满足时返回 null。 */
function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    // 后缀形式 bytes=-N：取末尾 N 字节。
    const suffix = Number(rawEnd);
    if (!suffix || size === 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(rawStart);
  if (start >= size) return null;
  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  if (start > end) return null;
  return { start, end };
}

/** If-None-Match 匹配：支持多值列表、弱校验前缀与通配符。 */
function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === etag || value === `W/${etag}` || value === "*");
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireWorkspace(request);
    const { id } = await context.params;
    const asset = getDb().prepare("SELECT * FROM assets WHERE workspace_id = ? AND id = ?").get(access.workspaceId, id) as
      | { relative_path: string; mime_type: string; original_name: string; size: number }
      | undefined;
    if (!asset) return new Response("Not found", { status: 404 });

    const absolutePath = resolveWorkspaceAssetPath(access.workspaceId, asset.relative_path);
    let fileSize = asset.size ?? 0;
    try {
      fileSize = statSync(absolutePath).size;
    } catch {
      return new Response("Not found", { status: 404 });
    }

    // relative_path 形如 <workspace>/blobs/<sha2>/<sha256>，末段就是内容哈希，可直接当强 ETag。
    const shaSegment = asset.relative_path.replaceAll("\\", "/").split("/").pop() ?? "";
    const etag = /^[0-9a-f]{64}$/.test(shaSegment) ? `"${shaSegment}"` : null;

    const baseHeaders: Record<string, string> = {
      "content-type": asset.mime_type || "application/octet-stream",
      "content-disposition": contentDispositionFor(asset.mime_type || "", asset.original_name),
      "x-content-type-options": "nosniff",
      // 内容寻址的 blob 不可变，可以放心让浏览器长期缓存（private：仍需鉴权）。
      "cache-control": "private, max-age=31536000, immutable",
      "accept-ranges": "bytes",
    };
    if (etag) baseHeaders.etag = etag;

    if (etag && etagMatches(request.headers.get("if-none-match"), etag)) {
      return new Response(null, { status: 304, headers: baseHeaders });
    }

    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      const range = parseRange(rangeHeader, fileSize);
      if (!range) {
        return new Response("Range Not Satisfiable", {
          status: 416,
          headers: { ...baseHeaders, "content-range": `bytes */${fileSize}` },
        });
      }
      const body = await streamAssetFile(absolutePath, range);
      return new Response(body, {
        status: 206,
        headers: {
          ...baseHeaders,
          "content-range": `bytes ${range.start}-${range.end}/${fileSize}`,
          "content-length": String(range.end - range.start + 1),
        },
      });
    }

    const body = await streamAssetFile(absolutePath);
    return new Response(body, {
      headers: { ...baseHeaders, "content-length": String(fileSize) },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
