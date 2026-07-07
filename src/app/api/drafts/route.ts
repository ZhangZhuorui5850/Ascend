import { assertSameOrigin, authErrorResponse, requireSession } from "@/lib/request-auth";
import { saveDraft } from "@/lib/sync";

export async function POST(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const body = await request.json();
    return Response.json(saveDraft({
      scopeType: String(body.scopeType || ""),
      scopeId: String(body.scopeId || ""),
      field: String(body.field || ""),
      content: String(body.content || ""),
      baseVersion: Number(body.baseVersion || 0),
      deviceId: String(body.deviceId || "") || undefined,
      opId: String(body.opId || crypto.randomUUID()),
    }));
  } catch (error) {
    return authErrorResponse(error);
  }
}
