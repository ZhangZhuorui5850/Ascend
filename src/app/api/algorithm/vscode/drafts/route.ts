import { loadJudgeCodeKey } from "@/lib/algorithm-code-crypto";
import { readBoundedJson, requireAlgorithmDeviceRequest, vscodeApiError, vscodeJson } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import { saveAlgorithmDraft } from "@/lib/repo/algorithm-submissions";

export async function PUT(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const body = await readBoundedJson(request);
    const key = loadJudgeCodeKey();
    if (!key) throw new Error("代码加密存储待配置");
    const saved = saveAlgorithmDraft(
      db,
      context,
      {
        problemId: positiveId(body.problemId),
        language: body.language === "python3" ? "python3" : "cpp17",
        sourceCode: String(body.sourceCode || ""),
        deviceId: context.deviceId,
        baseRevision: body.baseRevision === undefined ? undefined : Number(body.baseRevision),
        operationId: typeof body.operationId === "string" ? body.operationId : undefined,
        versionKind: body.versionKind === "manual" ? "manual" : "autosave",
        label: String(body.label || "VS Code 自动保存"),
      },
      key,
    );
    return vscodeJson({
      ok: true,
      sha256: saved.sha256,
      revision: saved.revision,
      savedAt: saved.savedAt,
    });
  } catch (error) {
    return vscodeApiError(error);
  }
}

function positiveId(value: unknown): number {
  const id = Math.round(Number(value));
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("题目 ID 无效");
  return id;
}
