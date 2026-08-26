import { loadJudgeCodeKey, loadJudgeCodeKeys } from "@/lib/algorithm-code-crypto";
import {
  algorithmApiFailure,
  algorithmApiSuccess,
  draftSaveSchema,
  readAlgorithmApiJson,
} from "@/lib/algorithm-api-v1";
import { requireAlgorithmDeviceRequest } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import { getAlgorithmDraft, saveAlgorithmDraft } from "@/lib/repo/algorithm-submissions";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const url = new URL(request.url);
    const problemId = Number(url.searchParams.get("problemId"));
    const language = url.searchParams.get("language") === "python3" ? "python3" : "cpp17";
    if (!Number.isSafeInteger(problemId) || problemId < 1) throw new Error("题目 ID 无效");
    const draft = getAlgorithmDraft(db, context, { problemId, language }, loadJudgeCodeKeys());
    return algorithmApiSuccess(request, { draft });
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const input = await readAlgorithmApiJson(request, draftSaveSchema);
    const key = loadJudgeCodeKey();
    if (!key) throw new Error("代码加密存储待配置");
    const saved = saveAlgorithmDraft(db, context, { ...input, deviceId: context.deviceId }, key);
    return algorithmApiSuccess(request, saved);
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}
