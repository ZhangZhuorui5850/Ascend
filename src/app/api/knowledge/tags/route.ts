import { getDb } from "@/lib/db";
import { createKnowledgeTagWithDb, deleteKnowledgeTagWithDb } from "@/lib/repository";
import { assertSameOrigin, authErrorResponse, requireSession } from "@/lib/request-auth";

export async function POST(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const body = await request.json();
    return Response.json(createKnowledgeTagWithDb(getDb(), { chapterId: body.chapterId, name: body.name }));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const body = await request.json();
    return Response.json({ deleted: deleteKnowledgeTagWithDb(getDb(), body.id) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
