import { getDb } from "@/lib/db";
import { createReviewEvent } from "@/lib/repo/reviews";
import { assertSameOrigin, authErrorResponse, requireWorkspace } from "@/lib/request-auth";

type ReviewOperation = {
  operationId?: unknown;
  workspaceKey?: unknown;
  day?: unknown;
  knowledgePointId?: unknown;
  score?: unknown;
  note?: unknown;
};

export async function POST(request: Request) {
  try {
    const access = await requireWorkspace(request);
    await assertSameOrigin(request);
    const body = await request.json() as { operations?: ReviewOperation[] };
    const operations = Array.isArray(body.operations) ? body.operations.slice(0, 200) : [];
    const db = getDb();
    for (const operation of operations) {
      const operationId = String(operation.operationId || "").trim();
      const workspaceKey = String(operation.workspaceKey || "").trim();
      const day = String(operation.day || "").trim();
      const knowledgePointId = String(operation.knowledgePointId || "").trim();
      if (!operationId || operationId.length > 120 || workspaceKey !== access.workspaceId || !knowledgePointId) throw new Error("离线复习操作无效");
      createReviewEvent(db, access, {
        operationId,
        day,
        knowledgePointId,
        score: Number(operation.score),
        note: typeof operation.note === "string" ? operation.note : "",
      });
    }
    return Response.json({ applied: operations.length });
  } catch (error) {
    return authErrorResponse(error);
  }
}
