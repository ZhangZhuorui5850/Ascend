import { readFileSync } from "node:fs";
import { resolveWorkspaceAssetPath } from "@/lib/assets";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { buildWorkspaceExport } from "@/lib/repo/export";
import { authErrorResponse, requireWorkspace } from "@/lib/request-auth";
import { createZip, type ZipFileEntry } from "@/lib/zip";

/**
 * per-workspace 数据导出：zip 包含 data.json（全量数据）、summary.md（人可读摘要）
 * 与 assets/ 下的全部附件。真实场景数据量在几十 MB 量级（附件单个 ≤20MB、按 blob
 * 去重计配额），一次性 buffer 组包即可，不需要流式。
 */
export async function GET(request: Request) {
  try {
    const access = await requireWorkspace(request);
    const now = new Date();
    const bundle = buildWorkspaceExport(getDb(), access, { exportedAt: now.toISOString() });

    const assetEntries: ZipFileEntry[] = [];
    const missingZipPaths = new Set<string>();
    for (const file of bundle.assetFiles) {
      try {
        const absolutePath = resolveWorkspaceAssetPath(access.workspaceId, file.storageKey);
        assetEntries.push({ name: file.zipPath, data: readFileSync(absolutePath) });
      } catch {
        // 磁盘上缺失的孤儿记录：保留元数据，data.json 里把 export_path 置空标记。
        missingZipPaths.add(file.zipPath);
      }
    }
    if (missingZipPaths.size) {
      for (const asset of bundle.data.library.assets) {
        if (asset.export_path && missingZipPaths.has(asset.export_path)) asset.export_path = null;
      }
    }

    const zip = createZip(
      [
        { name: "data.json", data: `${JSON.stringify(bundle.data, null, 2)}\n` },
        { name: "summary.md", data: bundle.markdown },
        ...assetEntries,
      ],
      { modifiedAt: now },
    );

    return new Response(new Uint8Array(zip), {
      headers: {
        "content-type": "application/zip",
        "content-length": String(zip.length),
        "content-disposition": `attachment; filename="ascend-export-${todayKey()}.zip"`,
        // 导出内容是私有数据快照，禁止任何中间层与浏览器缓存。
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
