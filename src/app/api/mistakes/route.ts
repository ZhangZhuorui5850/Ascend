import { createMistake } from "@/lib/repository";

export async function POST(request: Request) {
  return Response.json(createMistake(await request.json()));
}
