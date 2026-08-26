import {
  algorithmApiFailure,
  algorithmApiSuccess,
  practiceActivitySchema,
  practiceSessionAbandonSchema,
  practiceSessionStartSchema,
  readAlgorithmApiJson,
} from "@/lib/algorithm-api-v1";
import { requireAlgorithmDeviceRequest } from "@/lib/algorithm-vscode-api";
import {
  abandonPracticeSession,
  recordPracticeActivity,
  startPracticeSession,
} from "@/lib/application/algorithms/practice-session";
import { getDb } from "@/lib/db";

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const input = await readAlgorithmApiJson(request, practiceSessionStartSchema, 16 * 1024);
    const session = startPracticeSession(db, context, {
      ...input,
      clientKind: "vscode",
      deviceId: context.deviceId,
    });
    return algorithmApiSuccess(request, { session }, 201);
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const input = await readAlgorithmApiJson(request, practiceActivitySchema, 16 * 1024);
    const session = recordPracticeActivity(db, context, input);
    return algorithmApiSuccess(request, { session });
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const input = await readAlgorithmApiJson(request, practiceSessionAbandonSchema, 8 * 1024);
    const session = abandonPracticeSession(db, context, input.sessionId);
    return algorithmApiSuccess(request, { session });
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}
