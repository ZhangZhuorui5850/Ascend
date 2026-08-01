import { createReadStream, statSync } from "node:fs";
import { resolveWorkspaceAssetPath } from "@/lib/assets";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { buildWorkspaceExport } from "@/lib/repo/export";
import { authErrorResponse, requireWorkspace } from "@/lib/request-auth";
import { createZipStream, type StreamingZipFileEntry } from "@/lib/zip";

/**
 * per-workspace 数据导出：zip 包含 data.json（全量数据）、summary.md（人可读摘要）
 * 与 assets/ 下的全部附件。附件从磁盘逐块写入 ZIP，避免工作区接近配额时把全部文件
 * 与最终 ZIP 同时驻留在 V8 堆中。
 */
export async function GET(request: Request) {
  try {
    const access = await requireWorkspace(request);
    const now = new Date();
    const database = getDb();
    const bundle = database.transaction(() =>
      buildWorkspaceExport(database, access, { exportedAt: now.toISOString() })
    )();

    const assetEntries: StreamingZipFileEntry[] = [];
    const missingZipPaths = new Set<string>();
    for (const file of bundle.assetFiles) {
      try {
        const absolutePath = resolveWorkspaceAssetPath(access.workspaceId, file.storageKey);
        const fileStat = statSync(absolutePath);
        if (!fileStat.isFile()) throw new Error("附件不是普通文件");
        assetEntries.push({
          name: file.zipPath,
          expectedSize: fileStat.size,
          stream: () => createReadStream(absolutePath),
        });
      } catch (error) {
        if (!isMissingFileError(error)) throw error;
        // 磁盘上缺失的孤儿记录：保留元数据，data.json 里把 export_path 置空标记。
        missingZipPaths.add(file.zipPath);
      }
    }
    if (missingZipPaths.size) {
      for (const asset of bundle.data.library.assets) {
        if (asset.export_path && missingZipPaths.has(asset.export_path)) asset.export_path = null;
      }
    }

    const zip = createZipStream(
      [
        { name: "data.json", data: `${JSON.stringify(bundle.data, null, 2)}\n` },
        { name: "summary.md", data: bundle.markdown },
        ...assetEntries,
      ],
      { modifiedAt: now },
    );

    return new Response(zip, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="ascend-export-${todayKey()}.zip"`,
        // 导出内容是私有数据快照，禁止任何中间层与浏览器缓存。
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function isMissingFileError(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "";
  return code === "ENOENT" || code === "ENOTDIR";
}
