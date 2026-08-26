import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { linkAlgorithmProblemAsset, listAlgorithmProblemAssets } from "@/lib/repo/algorithm-assets";
import { getAlgorithmProblem } from "@/lib/repo/algorithms";
import { createAssetFromUpload } from "@/lib/repo/library";
import { assertSameOrigin, authErrorResponse, requireWorkspace } from "@/lib/request-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const access = await requireWorkspace(request);
    const id = positiveId((await params).id);
    return Response.json({ ok: true, assets: listAlgorithmProblemAssets(getDb(), access, id) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const access = await requireWorkspace(request);
    await assertSameOrigin(request);
    const id = positiveId((await params).id);
    const db = getDb();
    const problem = getAlgorithmProblem(db, access, id);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ ok: false, error: "缺少文件" }, { status: 400 });
    const asset = await createAssetFromUpload(db, access, {
      file,
      folderPath: `算法/${problem.phaseKey || "未分组"}/${safeFolder(problem.title)}`,
      category: "knowledge",
      note: `算法题资料：${problem.title}`,
    });
    linkAlgorithmProblemAsset(db, access, {
      problemId: id,
      assetId: asset.id,
      role: String(form.get("role") || "reference"),
    });
    revalidatePath("/practice/algorithms");
    revalidatePath("/assets");
    return Response.json({ ok: true, assets: listAlgorithmProblemAssets(db, access, id) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function positiveId(value: string): number {
  if (!/^\d{1,12}$/.test(value)) throw new Error("题目 ID 无效");
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("题目 ID 无效");
  return id;
}

function safeFolder(value: string): string {
  return (
    value
      .replace(/[<>:"/\\|?*]/g, "-")
      .trim()
      .slice(0, 80) || "未命名题目"
  );
}
