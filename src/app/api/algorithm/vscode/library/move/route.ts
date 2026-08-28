import { readBoundedJson, requireAlgorithmDeviceRequest, vscodeApiError, vscodeJson } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import {
  listAlgorithmLibrary,
  moveAlgorithmLibraryEntries,
  moveAlgorithmLibraryFolder,
  moveAlgorithmLibraryProblem,
  reorderAlgorithmLibraryFolder,
} from "@/lib/repo/algorithm-library";

export async function PUT(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const context = requireAlgorithmDeviceRequest(db, request);
    const body = await readBoundedJson(request, 32 * 1024);
    if (Array.isArray(body.entries)) {
      moveAlgorithmLibraryEntries(db, context, body.entries.map(parseMoveEntry));
      return vscodeJson({ ok: true, library: listAlgorithmLibrary(db, context) });
    }
    const kind = String(body.kind || "");
    if (kind === "problem") {
      moveAlgorithmLibraryProblem(db, context, {
        problemId: Number(body.id),
        targetFolderId: nullableString(body.targetFolderId),
        afterProblemId: nullableNumber(body.afterProblemId),
        placeFirst: body.placeFirst === true,
      });
    } else if (kind === "folder") {
      const direction = String(body.direction || "");
      if (direction === "up" || direction === "down" || direction === "first") {
        reorderAlgorithmLibraryFolder(db, context, {
          folderId: String(body.id || ""),
          direction,
        });
      } else {
        moveAlgorithmLibraryFolder(db, context, {
          folderId: String(body.id || ""),
          targetParentId: nullableString(body.targetFolderId),
          afterFolderId: nullableString(body.afterFolderId),
          placeFirst: body.placeFirst === true,
        });
      }
    } else {
      throw new Error("题目库拖拽类型无效");
    }
    return vscodeJson({ ok: true, library: listAlgorithmLibrary(db, context) });
  } catch (error) {
    return vscodeApiError(error);
  }
}

function parseMoveEntry(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("题目库批量移动项目无效");
  const entry = value as Record<string, unknown>;
  const kind = String(entry.kind || "");
  if (kind === "problem") {
    return {
      kind: "problem" as const,
      id: Number(entry.id),
      targetFolderId: nullableString(entry.targetFolderId),
      afterProblemId: nullableNumber(entry.afterProblemId),
      placeFirst: entry.placeFirst === true,
    };
  }
  if (kind === "folder") {
    const direction = String(entry.direction || "");
    if (direction && direction !== "up" && direction !== "down" && direction !== "first") {
      throw new Error("题目文件夹排序方向无效");
    }
    return {
      kind: "folder" as const,
      id: String(entry.id || ""),
      targetFolderId: nullableString(entry.targetFolderId),
      afterFolderId: nullableString(entry.afterFolderId),
      placeFirst: entry.placeFirst === true,
      direction: direction ? direction as "up" | "down" | "first" : undefined,
    };
  }
  throw new Error("题目库批量移动类型无效");
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  return Number(value);
}
