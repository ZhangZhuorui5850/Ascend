import { getDb } from "@/lib/db";
import { listCalendarEventRange } from "@/lib/repo/planner-events";
import { authErrorResponse, requireWorkspace } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const access = await requireWorkspace(request);
    const url = new URL(request.url);
    const start = required(url, "start");
    const end = required(url, "end");
    const startDate = required(url, "startDate");
    const endDateExclusive = required(url, "endDateExclusive");
    const startInstant = new Date(start);
    const endInstant = new Date(end);
    if (
      Number.isNaN(startInstant.getTime())
      || Number.isNaN(endInstant.getTime())
      || endInstant <= startInstant
      || endInstant.getTime() - startInstant.getTime() > 732 * 24 * 60 * 60 * 1000
    ) {
      return Response.json({ error: "事件查询范围无效" }, { status: 400 });
    }
    const events = listCalendarEventRange(getDb(), access, {
      start: startInstant.toISOString(),
      end: endInstant.toISOString(),
      startDate,
      endDateExclusive,
    });
    return Response.json({ events }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function required(url: URL, name: string): string {
  const value = url.searchParams.get(name)?.trim();
  if (!value) throw new Error(`${name} 必填`);
  return value;
}
