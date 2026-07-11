/**
 * 结构化错误日志：输出单行 JSON 到 stderr，便于 docker logs / journald 直接采集和检索。
 */
export function logError(scope: string, error: unknown, extra?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      scope,
      message,
      stack,
      ...extra,
    }),
  );
}
