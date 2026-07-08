import { getDb } from "@/lib/db";
import { createChapterWithDb, deleteChapterWithDb, updateChapterWithDb } from "@/lib/repository";
import { assertSameOrigin, authErrorResponse, requireSession } from "@/lib/request-auth";

export async function POST(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const body = await request.json();
    return Response.json(createChapterWithDb(getDb(), { subjectCode: body.subjectCode, title: body.title }));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const body = await request.json();
    return Response.json(updateChapterWithDb(getDb(), { id: body.id, title: body.title }));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const body = await request.json();
    return Response.json({ deleted: deleteChapterWithDb(getDb(), body.id) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
