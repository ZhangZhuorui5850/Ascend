import { revalidatePath } from "next/cache";
import { parseAlgorithmCpp } from "@/lib/algorithm-import-parser";
import {
  algorithmAssetFolderPath,
  suggestCourseForSource,
} from "@/lib/algorithm-providers";
import { getDb } from "@/lib/db";
import { linkAlgorithmProblemAsset } from "@/lib/repo/algorithm-assets";
import { importAlgorithmUpload } from "@/lib/repo/algorithm-import";
import { ensureAlgorithmLibraryFolderPath } from "@/lib/repo/algorithm-library";
import { moveAlgorithmLibraryProblem } from "@/lib/repo/algorithm-library";
import { createAssetFromUpload } from "@/lib/repo/library";
import { assertSameOrigin, authErrorResponse, requireWorkspace } from "@/lib/request-auth";

const MAX_CPP_BYTES = 512 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    const access = await requireWorkspace(request);
    await assertSameOrigin(request);
    const form = await request.formData();
    const file = requireCppFile(form.get("file"));
    const relativePath = boundedValue(form.get("relativePath"), 500) || file.name;
    const parsed = parseAlgorithmCpp(relativePath, await file.text());
    if (form.get("intent") === "preview") {
      return Response.json({ ok: true, candidate: previewCandidate(parsed) });
    }

    const title = boundedValue(form.get("title"), 160);
    const providerId = boundedValue(form.get("providerId"), 40);
    const externalProblemId = boundedValue(form.get("externalProblemId"), 120);
    const courseName = boundedValue(form.get("courseName"), 80);
    const stageKey = boundedValue(form.get("stageKey"), 40);
    const topics = boundedValue(form.get("topics"), 500)
      .split(/[，,、;]/)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 32);
    const exercise = {
      ...parsed,
      title: title || parsed.title,
      providerId: providerId || parsed.providerId,
      externalProblemId: externalProblemId || parsed.externalProblemId,
      phase: stageKey || parsed.phase,
      topics: topics.length ? topics : parsed.topics,
    };
    const db = getDb();
    const imported = importAlgorithmUpload(db, access, { exercise, courseName, stageKey });
    // 目标文件夹优先用用户手选；未选择时按来源链接自动归入「课程/阶段」层级
    let targetFolderId = boundedValue(form.get("folderId"), 100) || null;
    if (!targetFolderId) {
      const suggestion = suggestCourseForSource(exercise.sourceUrl);
      if (suggestion) {
        targetFolderId =
          ensureAlgorithmLibraryFolderPath(db, access, [suggestion.courseName, suggestion.stageKey])?.id ?? null;
      }
    }
    if (targetFolderId) moveAlgorithmLibraryProblem(db, access, { problemId: imported.problemId, targetFolderId });
    const asset = await createAssetFromUpload(db, access, {
      file,
      folderPath: assetFolder(courseName, stageKey, boundedValue(form.get("folderPath"), 240)),
      category: "knowledge",
      note: `算法参考 CPP：${exercise.title}`,
    });
    linkAlgorithmProblemAsset(db, access, {
      problemId: imported.problemId,
      assetId: asset.id,
      role: "reference",
    });
    revalidatePath("/practice/algorithms");
    revalidatePath("/assets");
    return Response.json({
      ok: true,
      problemId: imported.problemId,
      duplicate: imported.duplicate,
      candidate: previewCandidate(exercise),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function requireCppFile(value: FormDataEntryValue | null): File {
  if (!(value instanceof File)) throw new Error("请选择 CPP 文件");
  if (!/\.(?:cpp|cc|cxx)$/i.test(value.name)) throw new Error("当前导入仅支持 CPP 文件");
  if (value.size < 1 || value.size > MAX_CPP_BYTES) throw new Error("单个 CPP 文件大小需在 1 B 到 512 KB 之间");
  return value;
}

function boundedValue(value: FormDataEntryValue | null, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function previewCandidate(parsed: ReturnType<typeof parseAlgorithmCpp>) {
  return {
    sourcePath: parsed.sourcePath,
    title: parsed.title,
    providerId: parsed.providerId,
    externalProblemId: parsed.externalProblemId,
    phase: parsed.phase,
    topics: parsed.topics,
    statementMarkdown: parsed.statementMarkdown,
    matchStatus: parsed.matchStatus,
    matchCandidates: parsed.matchCandidates,
    warnings: parsed.warnings,
    courseSuggestion: suggestCourseForSource(parsed.sourceUrl),
  };
}

function assetFolder(courseName: string, stageKey: string, folderPath: string): string {
  return algorithmAssetFolderPath({ courseName: folderPath || courseName || "未整理", stageKey });
}
