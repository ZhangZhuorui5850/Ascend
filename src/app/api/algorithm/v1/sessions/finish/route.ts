import {
  algorithmApiFailure,
  algorithmApiSuccess,
  practiceFinishSchema,
  readAlgorithmApiJson,
} from "@/lib/algorithm-api-v1";
import { requireAlgorithmDeviceRequest } from "@/lib/algorithm-vscode-api";
import { finishPracticeSession } from "@/lib/application/algorithms/practice-session";
import { getDb } from "@/lib/db";

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const input = await readAlgorithmApiJson(request, practiceFinishSchema, 16 * 1024);
    const attempt = finishPracticeSession(db, context, input);
    return algorithmApiSuccess(request, { attempt });
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}
