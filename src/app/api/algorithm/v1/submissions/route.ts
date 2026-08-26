import {
  algorithmApiFailure,
  algorithmApiSuccess,
  practiceSubmissionSchema,
  readAlgorithmApiJson,
} from "@/lib/algorithm-api-v1";
import { requireAlgorithmDeviceRequest } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import { submitAlgorithmCode } from "@/lib/judge-runtime";

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const input = await readAlgorithmApiJson(request, practiceSubmissionSchema);
    const submission = await submitAlgorithmCode(db, context, input);
    return algorithmApiSuccess(request, { submission }, 202);
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}
