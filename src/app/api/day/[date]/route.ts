import { getDay, updateDay } from "@/lib/repository";
import { assertSameOrigin, authErrorResponse, requireSession } from "@/lib/request-auth";

export async function GET(request: Request, context: { params: Promise<{ date: string }> }) {
  try {
    await requireSession(request);
    const { date } = await context.params;
    return Response.json(getDay(date));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ date: string }> }) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const { date } = await context.params;
    return Response.json(updateDay(date, await request.json()));
  } catch (error) {
    return authErrorResponse(error);
  }
}
