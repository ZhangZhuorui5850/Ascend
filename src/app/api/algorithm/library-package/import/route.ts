import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import {
  ALGORITHM_LIBRARY_PACKAGE_MAX_BYTES,
  AlgorithmLibraryPackageError,
  importAlgorithmLibraryPackage,
  parseAlgorithmLibraryPackage,
  previewAlgorithmLibraryPackage,
} from "@/lib/repo/algorithm-library-package";
import { assertSameOrigin, authErrorResponse, requireWorkspace } from "@/lib/request-auth";

const MAX_MULTIPART_BYTES = ALGORITHM_LIBRARY_PACKAGE_MAX_BYTES + 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    const access = await requireWorkspace(request);
    await assertSameOrigin(request);
    const requestLength = Number(request.headers.get("content-length") || 0);
    if (requestLength > MAX_MULTIPART_BYTES) {
      throw new AlgorithmLibraryPackageError("题库包上传请求不能超过 21 MB");
    }
    const form = await request.formData();
    const file = requirePackageFile(form.get("file"));
    const raw = await file.text();
    const pkg = parseAlgorithmLibraryPackage(raw);
    const database = getDb();
    if (form.get("intent") === "preview") {
      const preview = database.transaction(() => previewAlgorithmLibraryPackage(database, access, pkg))();
      return Response.json({ ok: true, preview }, { headers: { "cache-control": "private, no-store" } });
    }

    const targetFolderId = boundedText(form.get("targetFolderId"), 100) || null;
    const result = importAlgorithmLibraryPackage(database, access, pkg, {
      packageSha256: createHash("sha256").update(raw).digest("hex"),
      targetFolderId,
      createPackageFolder: form.get("createPackageFolder") !== "false",
    });
    revalidatePath("/practice/algorithms");
    return Response.json({ ok: true, result }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function requirePackageFile(value: FormDataEntryValue | null): File {
  if (!(value instanceof File)) throw new AlgorithmLibraryPackageError("请选择题库包文件");
  if (!value.name.toLowerCase().endsWith(".json")) {
    throw new AlgorithmLibraryPackageError("题库包文件扩展名需为 .json");
  }
  if (value.size < 1 || value.size > ALGORITHM_LIBRARY_PACKAGE_MAX_BYTES) {
    throw new AlgorithmLibraryPackageError("题库包大小需在 1 B 到 20 MB 之间");
  }
  return value;
}

function boundedText(value: FormDataEntryValue | null, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
