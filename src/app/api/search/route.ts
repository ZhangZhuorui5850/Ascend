import { getDb } from "@/lib/db";
import { authErrorResponse, requireWorkspace } from "@/lib/request-auth";
import { searchWorkspace } from "@/lib/repo/search";

export async function GET(request: Request) {
  try {
    const access = await requireWorkspace(request);
    const query = new URL(request.url).searchParams.get("q")?.trim() || "";
    if (!query) {
      return Response.json(
        { query: "", results: [] },
        { headers: { "cache-control": "private, no-store" } },
      );
    }
    if (query.length > 80) {
      return Response.json(
        { error: "搜索词不能超过 80 个字符" },
        { status: 400, headers: { "cache-control": "private, no-store" } },
      );
    }
    const results = searchWorkspace(getDb(), access, query);
    return Response.json(
      { query, results },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
