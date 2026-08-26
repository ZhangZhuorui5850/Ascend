import { algorithmApiFailure, algorithmApiSuccess } from "@/lib/algorithm-api-v1";
import { requireAlgorithmDeviceRequest } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import { refreshAlgorithmSubmission } from "@/lib/judge-runtime";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("提交 ID 无效");
    const submission = await refreshAlgorithmSubmission(db, context, id);
    return algorithmApiSuccess(request, { submission });
  } catch (error) {
    return algorithmApiFailure(request, error);
  }
}
