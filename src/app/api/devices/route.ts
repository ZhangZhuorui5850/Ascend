import { assertSameOrigin, authErrorResponse, requireSession } from "@/lib/request-auth";
import { registerDevice } from "@/lib/sync";

export async function POST(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    return Response.json(registerDevice(await request.json()));
  } catch (error) {
    return authErrorResponse(error);
  }
}
