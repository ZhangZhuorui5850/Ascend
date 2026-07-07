import { createReviewEvent } from "@/lib/repository";
import { assertSameOrigin, authErrorResponse, requireSession } from "@/lib/request-auth";

export async function POST(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    return Response.json(createReviewEvent(await request.json()));
  } catch (error) {
    return authErrorResponse(error);
  }
}
