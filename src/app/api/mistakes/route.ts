import { createMistake } from "@/lib/repository";
import { assertSameOrigin, authErrorResponse, requireSession } from "@/lib/request-auth";

export async function POST(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    return Response.json(createMistake(await request.json()));
  } catch (error) {
    return authErrorResponse(error);
  }
}
