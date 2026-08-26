import { algorithmApiFailure, algorithmApiSuccess } from "@/lib/algorithm-api-v1";
import { requireAlgorithmDeviceRequest } from "@/lib/algorithm-vscode-api";
import { getAlgorithmDeviceQueuePayload } from "@/lib/application/algorithms/device-read-model";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    return algorithmApiSuccess(request, getAlgorithmDeviceQueuePayload(db, context));
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}
