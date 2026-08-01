/**
 * 结构化错误日志：输出单行 JSON 到 stderr，便于 docker logs / journald 直接采集和检索。
 */
export function logError(scope: string, error: unknown, extra?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  writeLog("error", scope, message, { stack, ...extra });
}

export function logWarning(scope: string, message: string, extra?: Record<string, unknown>): void {
  writeLog("warn", scope, message, extra);
}

function writeLog(
  level: "error" | "warn",
  scope: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...extra,
  });
  if (level === "error") console.error(line);
  else console.warn(line);
}
