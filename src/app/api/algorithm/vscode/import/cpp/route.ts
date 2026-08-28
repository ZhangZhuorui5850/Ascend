import { parseAlgorithmCpp } from "@/lib/algorithm-import-parser";
import { findCatalogByIdentity } from "@/lib/algorithm-catalog";
import { readBoundedJson, requireAlgorithmDeviceRequest, vscodeApiError, vscodeJson } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import { linkAlgorithmProblemAsset } from "@/lib/repo/algorithm-assets";
import { importAlgorithmUpload } from "@/lib/repo/algorithm-import";
import { createAssetFromUpload } from "@/lib/repo/library";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const body = await readBoundedJson(request, 768 * 1024);
    const filename = cppFilename(body.filename);
    const relativePath = boundedString(body.relativePath || filename, 500, "相对路径");
    const content = boundedString(body.content, 512 * 1024, "CPP 内容");
    const parsed = parseAlgorithmCpp(relativePath, content);
    const catalog = findCatalogByIdentity(parsed.providerId, parsed.externalProblemId);
    const imported = importAlgorithmUpload(db, context, {
      exercise: parsed,
      courseName: optionalString(body.courseName, 80) || catalog?.courseName,
      stageKey: optionalString(body.stageKey, 40) || catalog?.stageKey || parsed.phase,
    });
    const file = new File([content], filename, { type: "text/x-c++src" });
    const asset = await createAssetFromUpload(db, context, {
      file,
      folderPath: `算法/${catalog?.courseName || "未整理"}/${catalog?.stageKey || parsed.phase || "未分阶段"}`,
      category: "knowledge",
      note: `VS Code 同步的算法参考 CPP：${parsed.title}`,
    });
    linkAlgorithmProblemAsset(db, context, { problemId: imported.problemId, assetId: asset.id, role: "reference" });
    return vscodeJson({
      ok: true,
      problemId: imported.problemId,
      duplicate: imported.duplicate,
      title: parsed.title,
      matchStatus: parsed.matchStatus,
    }, imported.duplicate ? 200 : 201);
  } catch (error) {
    return vscodeApiError(error);
  }
}

function cppFilename(value: unknown): string {
  const filename = boundedString(value, 180, "文件名").split(/[\\/]/).pop() || "";
  if (!/\.(?:cpp|cc|cxx)$/i.test(filename)) throw new Error("请选择 CPP 文件");
  return filename;
}

function boundedString(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}必填`);
  if (value.length > maxLength) throw new Error(`${label}过长`);
  return value;
}

function optionalString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
