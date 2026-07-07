import { authErrorResponse, requireSession } from "@/lib/request-auth";
import { listOpenConflicts } from "@/lib/sync";

export async function GET(request: Request) {
  try {
    await requireSession(request);
    const url = new URL(request.url);
    return Response.json(listOpenConflicts({
      scopeType: url.searchParams.get("scopeType") || "day",
      scopeId: url.searchParams.get("scopeId") || "",
    }));
  } catch (error) {
    return authErrorResponse(error);
  }
}
