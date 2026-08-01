import { getDb } from "@/lib/db";
import { recordWebVital } from "@/lib/observability";
import { assertSameOrigin, authErrorResponse, requireAccessContext } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAccessContext(request);
    await assertSameOrigin(request);
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return Response.json({ error: "Metrics payload is too large" }, { status: 413 });
    }
    const body = await request.text();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      return Response.json({ error: "Metrics payload is too large" }, { status: 413 });
    }
    const payload = JSON.parse(body) as Record<string, unknown>;
    recordWebVital(getDb(), {
      id: String(payload.id || ""),
      name: String(payload.name || ""),
      value: Number(payload.value),
      rating: typeof payload.rating === "string" ? payload.rating : undefined,
      navigationType: typeof payload.navigationType === "string" ? payload.navigationType : undefined,
      route: typeof payload.route === "string" ? payload.route : "/_other",
    });
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
