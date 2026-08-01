import { getDb } from "./db";
import { safeRecordOperationalEvent } from "./observability";

export function actionFailure(
  scope: string,
  error: unknown,
  fallback = "操作失败",
): { ok: false; error: string } {
  try {
    safeRecordOperationalEvent(getDb(), "action_failure", scope);
  } catch {
    // The original action error remains the user-facing result even if metrics storage is unavailable.
  }
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}
