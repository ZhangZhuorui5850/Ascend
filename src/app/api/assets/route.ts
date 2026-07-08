import { createAssetFromUpload } from "@/lib/repository";
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

    const tags = String(formData.get("tags") || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const asset = await createAssetFromUpload({
      file,
      day: String(formData.get("day") || ""),
      tags,
      subjectCode: String(formData.get("subjectCode") || ""),
      chapterId: String(formData.get("chapterId") || ""),
      knowledgePointId: String(formData.get("knowledgePointId") || ""),
      knowledgeTagNames: String(formData.get("knowledgeTagNames") || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      folderPath: String(formData.get("folderPath") || ""),
      category: String(formData.get("category") || ""),
    });

    return Response.json(asset);
  } catch (error) {
    return authErrorResponse(error);
  }
}
