import { readBoundedJson, requireAlgorithmDeviceRequest, vscodeApiError, vscodeJson } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import {
  deleteAlgorithmLibraryFolder,
  listAlgorithmLibrary,
  renameAlgorithmLibraryFolder,
} from "@/lib/repo/algorithm-library";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const { id } = await params;
    const body = await readBoundedJson(request, 8 * 1024);
    const folder = renameAlgorithmLibraryFolder(db, context, id, String(body.name || ""));
    return vscodeJson({ ok: true, folder, library: listAlgorithmLibrary(db, context) });
  } catch (error) {
    return vscodeApiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const { id } = await params;
    const promoteContents = new URL(request.url).searchParams.get("promote") === "1";
    deleteAlgorithmLibraryFolder(db, context, id, { promoteContents });
    return vscodeJson({ ok: true, library: listAlgorithmLibrary(db, context) });
  } catch (error) {
    return vscodeApiError(error);
  }
}
