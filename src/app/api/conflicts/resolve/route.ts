import { assertSameOrigin, authErrorResponse, requireSession } from "@/lib/request-auth";
import { resolveConflict } from "@/lib/sync";

export async function POST(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const body = await request.json();
    return Response.json(resolveConflict({
      conflictId: String(body.conflictId || ""),
      content: typeof body.content === "string" ? body.content : undefined,
      deviceId: String(body.deviceId || "") || undefined,
      opId: String(body.opId || "") || undefined,
    }));
  } catch (error) {
    return authErrorResponse(error);
  }
}
