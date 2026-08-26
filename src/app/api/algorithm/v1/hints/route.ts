import {
  algorithmApiFailure,
  algorithmApiSuccess,
  practiceHintSchema,
  readAlgorithmApiJson,
} from "@/lib/algorithm-api-v1";
import { requireAlgorithmDeviceRequest } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import { revealAlgorithmHint } from "@/lib/repo/algorithm-hints";

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const input = await readAlgorithmApiJson(request, practiceHintSchema, 8 * 1024);
    return algorithmApiSuccess(request, { hint: revealAlgorithmHint(db, context, input) });
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}
