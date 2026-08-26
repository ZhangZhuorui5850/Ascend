import { requireAlgorithmDeviceRequest, vscodeApiError, vscodeJson } from "@/lib/algorithm-vscode-api";
import { getAlgorithmDeviceQueuePayload } from "@/lib/application/algorithms/device-read-model";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    return vscodeJson({ ok: true, ...getAlgorithmDeviceQueuePayload(db, context) });
  } catch (error) {
    return vscodeApiError(error);
  }
}
