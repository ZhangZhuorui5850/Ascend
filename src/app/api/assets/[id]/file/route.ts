import { contentDispositionFor, resolveWorkspaceAssetPath, streamAssetFile } from "@/lib/assets";
import { getDb } from "@/lib/db";
import { authErrorResponse, requireWorkspace } from "@/lib/request-auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireWorkspace(request);
    const { id } = await context.params;
    const asset = getDb().prepare("SELECT * FROM assets WHERE workspace_id = ? AND id = ?").get(access.workspaceId, id) as
      | { relative_path: string; mime_type: string; original_name: string; size: number }
      | undefined;
    if (!asset) return new Response("Not found", { status: 404 });

    const absolutePath = resolveWorkspaceAssetPath(access.workspaceId, asset.relative_path);
    const body = await streamAssetFile(absolutePath);
    return new Response(body, {
      headers: {
        "content-type": asset.mime_type || "application/octet-stream",
        "content-disposition": contentDispositionFor(asset.mime_type || "", asset.original_name),
        "x-content-type-options": "nosniff",
        "content-length": String(asset.size ?? 0),
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
