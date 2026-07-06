import { getCalendarSummaries } from "@/lib/repository";

export async function GET() {
  return Response.json(getCalendarSummaries());
}
