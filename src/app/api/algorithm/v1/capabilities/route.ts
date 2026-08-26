import { loadJudgeCodeKey } from "@/lib/algorithm-code-crypto";
import { algorithmApiFailure, algorithmApiSuccess } from "@/lib/algorithm-api-v1";
import { requireAlgorithmDeviceRequest } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import { getJudgeRuntimeAvailability } from "@/lib/judge-runtime";
import { getServerInstanceId } from "@/lib/server-identity";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const judge = getJudgeRuntimeAvailability(db, context);
    return algorithmApiSuccess(request, {
      server: { instanceId: getServerInstanceId(db) },
      workspace: { id: context.workspaceId },
      device: { id: context.deviceId, name: context.deviceName },
      protocols: { minimum: 1, maximum: 1 },
      features: {
        draftRevisions: true,
        draftConflicts: true,
        practiceSessions: true,
        formalJudge: judge.submissionAllowed,
        localSamples: true,
      },
      languages: judge.languages,
      codeStorageAvailable: hasUsableCodeStorage(),
      judge,
    });
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}

function hasUsableCodeStorage(): boolean {
  try {
    return Boolean(loadJudgeCodeKey());
  } catch {
    return false;
  }
}
