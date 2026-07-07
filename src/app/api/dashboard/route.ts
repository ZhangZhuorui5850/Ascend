import { getDashboard } from "@/lib/repository";
import { authErrorResponse, requireSession } from "@/lib/request-auth";

export async function GET() {
  try {
    await requireSession();
    return Response.json(getDashboard());
  } catch (error) {
    return authErrorResponse(error);
  }
}
