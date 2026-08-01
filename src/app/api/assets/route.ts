import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { safeRecordOperationalEvent } from "@/lib/observability";
import { createAssetFromUpload } from "@/lib/repo/library";
import { assertSameOrigin, authErrorResponse, requireWorkspace } from "@/lib/request-auth";

export async function POST(request: Request) {
  try {
    const access = await requireWorkspace(request);
    await assertSameOrigin(request);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Missing file field" }, { status: 400 });
    }

    const asset = await createAssetFromUpload(getDb(), access, {
      file,
      day: String(formData.get("day") || "") || undefined,
      subjectCode: String(formData.get("subjectCode") || ""),
      chapterId: String(formData.get("chapterId") || ""),
      knowledgePointIds: String(formData.get("knowledgePointIds") || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
      folderPath: String(formData.get("folderPath") || ""),
      category: String(formData.get("category") || ""),
      note: String(formData.get("note") || ""),
    });

    revalidatePath("/assets");
    return Response.json(asset);
  } catch (error) {
    try {
      safeRecordOperationalEvent(getDb(), "upload_failure");
    } catch {
      // Preserve the upload error when the metrics database is unavailable too.
    }
    return authErrorResponse(error);
  }
}
