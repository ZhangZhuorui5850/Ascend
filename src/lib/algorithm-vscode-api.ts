import type Database from "better-sqlite3";
import { AlgorithmDraftConflictError } from "./repo/algorithm-submissions";
import { authenticateAlgorithmDevice, type AlgorithmDeviceContext } from "./repo/algorithm-devices";

export function requireAlgorithmDeviceRequest(db: Database.Database, request: Request): AlgorithmDeviceContext {
  return authenticateAlgorithmDevice(db, request.headers.get("authorization"));
}

export function vscodeJson(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function vscodeApiError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Ascend VS Code API failed";
  if (error instanceof AlgorithmDraftConflictError) {
    return vscodeJson({
      ok: false,
      error: error.message,
      errorCode: error.code,
      conflict: error.current,
    }, error.status);
  }
  const declaredStatus = Number((error as { status?: unknown } | null)?.status || 0);
  const status = declaredStatus >= 400 && declaredStatus <= 599
    ? declaredStatus
    : /token|expired|授权|权限/i.test(message)
      ? 401
      : 400;
  return vscodeJson({ ok: false, error: message, errorCode: status === 401 ? "AUTH_REQUIRED" : "BAD_REQUEST" }, status);
}

export async function readBoundedJson(request: Request, maxBytes = 96 * 1024): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > maxBytes) throw new Error("请求内容过大");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error("请求内容过大");
  const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求 JSON 无效");
  return value as Record<string, unknown>;
}
