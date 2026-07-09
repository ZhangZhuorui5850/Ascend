import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { createAssetFromUpload } from "@/lib/repo/library";
import { assertSameOrigin, authErrorResponse, requireSession } from "@/lib/request-auth";

export async function POST(request: Request) {
  try {
    await requireSession(request);
    await assertSameOrigin(request);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Missing file field" }, { status: 400 });
    }

    const asset = await createAssetFromUpload(getDb(), {
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
    return authErrorResponse(error);
  }
}
