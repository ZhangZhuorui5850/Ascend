import { getDashboard } from "@/lib/repository";

export async function GET() {
  return Response.json(getDashboard());
}
