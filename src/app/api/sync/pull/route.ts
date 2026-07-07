import { authErrorResponse, requireSession } from "@/lib/request-auth";
import { pullChanges } from "@/lib/sync";

export async function GET(request: Request) {
  try {
    await requireSession(request);
    const sinceSeq = Number(new URL(request.url).searchParams.get("sinceSeq") || 0);
    return Response.json(pullChanges(sinceSeq));
  } catch (error) {
    return authErrorResponse(error);
  }
}
