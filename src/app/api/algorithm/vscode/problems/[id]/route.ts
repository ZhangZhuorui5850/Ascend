import { getAlgorithmDeviceProblemPayload } from "@/lib/application/algorithms/device-read-model";
import { readBoundedJson, requireAlgorithmDeviceRequest, vscodeApiError, vscodeJson } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import { updateAlgorithmProblemDetails } from "@/lib/repo/algorithms";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const id = positiveId((await params).id);
    return vscodeJson({ ok: true, ...getAlgorithmDeviceProblemPayload(db, context, id) });
  } catch (error) {
    return vscodeApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const id = positiveId((await params).id);
    const body = await readBoundedJson(request, 16 * 1024);
    const problem = updateAlgorithmProblemDetails(db, context, id, {
      title: optionalString(body.title),
      difficultyBand: optionalString(body.difficultyBand),
      tags: optionalStringArray(body.tags),
      notes: optionalString(body.notes),
      materialStatus: optionalString(body.materialStatus),
      priorityBand: optionalString(body.priorityBand),
      phaseKey: optionalString(body.phaseKey),
      nextReview: body.nextReview === null ? null : body.nextReview === undefined ? undefined : String(body.nextReview),
    });
    return vscodeJson({ ok: true, problem });
  } catch (error) {
    return vscodeApiError(error);
  }
}

function positiveId(value: string): number {
  if (!/^\d{1,12}$/.test(value)) throw new Error("题目 ID 无效");
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("题目 ID 无效");
  return id;
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : String(value);
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error("题目标签无效");
  return value;
}
