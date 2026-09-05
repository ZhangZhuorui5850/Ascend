import { requireAlgorithmDeviceRequest, vscodeApiError, vscodeJson } from "@/lib/algorithm-vscode-api";
import { getAlgorithmDeviceQueuePayload } from "@/lib/application/algorithms/device-read-model";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const day = new URL(request.url).searchParams.get("day") || undefined;
    return vscodeJson({ ok: true, ...getAlgorithmDeviceQueuePayload(db, context, day) });
  } catch (error) {
    return vscodeApiError(error);
  }
}
