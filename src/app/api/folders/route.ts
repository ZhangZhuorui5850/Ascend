import { getDb } from "@/lib/db";
import { createFolderWithDb, getFileExplorerWithDb, moveAssetToFolderWithDb } from "@/lib/repository";
import { assertSameOrigin, authErrorResponse, requireSession } from "@/lib/request-auth";

export async function GET(request: Request) {
  try {
    await requireSession(request);
    const url = new URL(request.url);
    return Response.json(getFileExplorerWithDb(getDb(), url.searchParams.get("path") || ""));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const body = await request.json();
    return Response.json(createFolderWithDb(getDb(), { path: body.path }));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);
    const body = await request.json();
    moveAssetToFolderWithDb(getDb(), { assetId: Number(body.assetId), folderPath: String(body.folderPath || "") });
    return Response.json(getFileExplorerWithDb(getDb(), String(body.currentPath || body.folderPath || "")));
  } catch (error) {
    return authErrorResponse(error);
  }
}
