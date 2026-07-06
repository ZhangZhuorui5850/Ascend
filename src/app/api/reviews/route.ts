import { createReviewEvent } from "@/lib/repository";

export async function POST(request: Request) {
  return Response.json(createReviewEvent(await request.json()));
}
