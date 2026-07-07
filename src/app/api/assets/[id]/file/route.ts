import { getDb, getUploadRoot } from "@/lib/db";
import { authErrorResponse, requireSession } from "@/lib/request-auth";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(request);
    const { id } = await context.params;
    const asset = getDb().prepare("SELECT * FROM assets WHERE id = ?").get(id) as
      | { relative_path: string; mime_type: string; original_name: string }
      | undefined;
    if (!asset) return new Response("Not found", { status: 404 });

    const file = await readFile(path.join(getUploadRoot(), asset.relative_path));
    return new Response(file, {
      headers: {
        "content-type": asset.mime_type || "application/octet-stream",
        "content-disposition": `inline; filename="${encodeURIComponent(asset.original_name)}"`,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
