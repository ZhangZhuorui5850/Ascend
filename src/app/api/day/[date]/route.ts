import { getDay, updateDay } from "@/lib/repository";

export async function GET(_request: Request, context: { params: Promise<{ date: string }> }) {
  const { date } = await context.params;
  return Response.json(getDay(date));
}

export async function PATCH(request: Request, context: { params: Promise<{ date: string }> }) {
  const { date } = await context.params;
  return Response.json(updateDay(date, await request.json()));
}
