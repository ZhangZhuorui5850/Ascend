import {
  algorithmApiFailure,
  algorithmApiSuccess,
  algorithmPlanDeleteSchema,
  algorithmPlanUpdateSchema,
  readAlgorithmApiJson,
} from "@/lib/algorithm-api-v1";
import { requireAlgorithmDeviceRequest } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import { removeAlgorithmPlan, rescheduleAlgorithmPlan } from "@/lib/repo/algorithm-training";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const input = await readAlgorithmApiJson(request, algorithmPlanUpdateSchema, 8 * 1024);
    const { id } = await params;
    rescheduleAlgorithmPlan(db, context, { taskId: id, expectedVersion: input.expectedVersion, targetDay: input.targetDay });
    return algorithmApiSuccess(request, { taskId: id, day: input.targetDay });
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const input = await readAlgorithmApiJson(request, algorithmPlanDeleteSchema, 8 * 1024);
    const { id } = await params;
    removeAlgorithmPlan(db, context, { taskId: id, expectedVersion: input.expectedVersion });
    return algorithmApiSuccess(request, { taskId: id });
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}
