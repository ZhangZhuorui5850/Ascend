import {
  algorithmApiFailure,
  algorithmApiSuccess,
  algorithmPlanCreateSchema,
  readAlgorithmApiJson,
} from "@/lib/algorithm-api-v1";
import { requireAlgorithmDeviceRequest } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import { getAlgorithmTrainingRelations, scheduleAlgorithmProblems } from "@/lib/repo/algorithm-training";

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const input = await readAlgorithmApiJson(request, algorithmPlanCreateSchema, 16 * 1024);
    const before = new Set(
      getAlgorithmTrainingRelations(db, context).plans
        .filter((plan) => plan.day === input.day && plan.status !== "canceled")
        .map((plan) => plan.problemId),
    );
    const plans = scheduleAlgorithmProblems(db, context, input);
    const requested = new Set(input.problemIds);
    const createdCount = [...requested].filter((id) => !before.has(id)).length;
    return algorithmApiSuccess(request, {
      createdCount,
      duplicateCount: requested.size - createdCount,
      skippedCount: requested.size - createdCount,
      plans,
    }, 201);
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}
