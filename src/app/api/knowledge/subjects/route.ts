import { getDb } from "@/lib/db";
import { createSubjectWithDb, deleteSubjectWithDb, updateSubjectWithDb } from "@/lib/repository";
import { assertSameOrigin, authErrorResponse, requireSession } from "@/lib/request-auth";

export async function POST(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const body = await request.json();
    return Response.json(createSubjectWithDb(getDb(), { code: body.code, name: body.name, description: body.description }));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const body = await request.json();
    return Response.json(updateSubjectWithDb(getDb(), { code: body.code, name: body.name, description: body.description }));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const body = await request.json();
    return Response.json({ deleted: deleteSubjectWithDb(getDb(), body.code) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
