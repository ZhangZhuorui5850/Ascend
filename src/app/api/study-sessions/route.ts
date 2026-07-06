import { createStudySession } from "@/lib/repository";

export async function POST(request: Request) {
  return Response.json(createStudySession(await request.json()));
}
