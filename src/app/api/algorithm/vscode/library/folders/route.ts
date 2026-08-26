import { readBoundedJson, requireAlgorithmDeviceRequest, vscodeApiError, vscodeJson } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import { createAlgorithmLibraryFolder, listAlgorithmLibrary } from "@/lib/repo/algorithm-library";

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const body = await readBoundedJson(request, 8 * 1024);
    const folder = createAlgorithmLibraryFolder(db, context, {
      name: String(body.name || ""),
      parentId: nullableString(body.parentId),
    });
    return vscodeJson({ ok: true, folder, library: listAlgorithmLibrary(db, context) }, 201);
  } catch (error) {
    return vscodeApiError(error);
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
