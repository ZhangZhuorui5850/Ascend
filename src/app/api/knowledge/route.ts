import { getKnowledgePoints } from "@/lib/repository";

export async function GET() {
  return Response.json(getKnowledgePoints());
}
