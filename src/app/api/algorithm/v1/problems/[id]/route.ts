import { algorithmApiFailure, algorithmApiSuccess } from "@/lib/algorithm-api-v1";
import { requireAlgorithmDeviceRequest } from "@/lib/algorithm-vscode-api";
import { getAlgorithmDeviceProblemPayload } from "@/lib/application/algorithms/device-read-model";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const id = parsePositiveId((await params).id);
    return algorithmApiSuccess(request, getAlgorithmDeviceProblemPayload(db, context, id));
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}

function parsePositiveId(value: string): number {
  if (!/^\d{1,12}$/.test(value)) throw new Error("题目 ID 无效");
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("题目 ID 无效");
  return id;
}
