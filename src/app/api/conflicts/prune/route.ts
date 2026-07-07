import { assertSameOrigin, authErrorResponse, requireSession } from "@/lib/request-auth";
import { pruneResolvedConflicts } from "@/lib/sync";

export async function POST(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const body = await request.json();
    const resolvedBefore = typeof body.resolvedBefore === "string" && body.resolvedBefore
      ? body.resolvedBefore
      : defaultPruneBoundary();
    return Response.json(pruneResolvedConflicts({ resolvedBefore }));
  } catch (error) {
    return authErrorResponse(error);
  }
}

function defaultPruneBoundary(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 30);
  return date.toISOString().slice(0, 19).replace("T", " ");
}
