import { randomUUID } from "node:crypto";
import { readBoundedJson, requireAlgorithmDeviceRequest, vscodeApiError, vscodeJson } from "@/lib/algorithm-vscode-api";
import { recordAlgorithmAttemptCommand } from "@/lib/application/algorithms/record-attempt";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const body = await readBoundedJson(request, 32 * 1024);
    const attempt = recordAlgorithmAttemptCommand(db, context, {
      operationId: typeof body.operationId === "string" ? body.operationId : `vscode:${randomUUID()}`,
      problemId: positiveId(body.problemId),
      day: typeof body.day === "string" ? body.day : todayKey(),
      verdict: String(body.verdict || "OTHER"),
      durationMinutes: Number(body.durationMinutes || 0),
      maxHintLevel: Number(body.maxHintLevel || 0),
      preConfidence:
        body.preConfidence === null || body.preConfidence === undefined ? null : Number(body.preConfidence),
      reviewKind: String(body.reviewKind || "initial"),
      errorCategory: String(body.errorCategory || ""),
      reflection: String(body.reflection || ""),
    });
    return vscodeJson({ ok: true, attempt });
  } catch (error) {
    return vscodeApiError(error);
  }
}

function positiveId(value: unknown): number {
  const id = Math.round(Number(value));
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("题目 ID 无效");
  return id;
}
