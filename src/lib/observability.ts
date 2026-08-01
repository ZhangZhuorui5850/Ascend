import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { logWarning } from "./log";

export const WEB_VITAL_NAMES = ["LCP", "INP", "CLS", "TTFB", "FCP", "FID"] as const;
export type WebVitalName = (typeof WEB_VITAL_NAMES)[number];
export type OperationalEventType =
  | "action_failure"
  | "login_failure"
  | "mcp_failure"
  | "offline_sync_failure"
  | "upload_failure";

const WEB_VITAL_RETENTION_DAYS = 30;
const OPERATIONAL_RETENTION_DAYS = 90;
const VITAL_RATINGS = new Set(["good", "needs-improvement", "poor"]);
const NAVIGATION_TYPES = new Set(["navigate", "reload", "prerender", "back-forward", "back-forward-cache", "restore"]);
const EXACT_ROUTES = new Set([
  "/",
  "/admin",
  "/admin/audit",
  "/admin/users",
  "/analytics",
  "/assets",
  "/calendar",
  "/change-password",
  "/login",
  "/mistakes",
  "/mock-exams",
  "/onboarding",
  "/settings",
  "/subjects",
]);

type WebVitalInput = {
  id: string;
  name: string;
  value: number;
  rating?: string;
  navigationType?: string;
  route: string;
};

export type ObservabilityOverview = {
  windowDays: number;
  vitals: Array<{ name: WebVitalName; p75: number | null; samples: number }>;
  ttfbRoutes: Array<{ route: string; p75: number; samples: number }>;
  failures: Array<{
    eventType: OperationalEventType;
    last24Hours: number;
    previous24Hours: number;
    scopes: Array<{ scope: string; count: number }>;
  }>;
};

export function normalizeMetricRoute(value: string): string {
  let pathname: string;
  try {
    pathname = new URL(value, "https://ascend.invalid").pathname;
  } catch {
    return "/_other";
  }
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (EXACT_ROUTES.has(normalized)) return normalized;
  if (/^\/day\/[^/]+$/.test(normalized)) return "/day/:date";
  if (/^\/subjects\/[^/]+$/.test(normalized)) return "/subjects/:id";
  if (/^\/admin\/users\/[^/]+\/workspace$/.test(normalized)) return "/admin/users/:id/workspace";
  if (/^\/admin\/users\/[^/]+$/.test(normalized)) return "/admin/users/:id";
  return "/_other";
}

export function recordWebVital(
  database: Database.Database,
  input: WebVitalInput,
  now = new Date(),
): void {
  const name = input.name as WebVitalName;
  if (!WEB_VITAL_NAMES.includes(name)) throw inputError("Unsupported Web Vital name");
  const id = input.id.trim();
  if (!id || id.length > 120) throw inputError("Invalid Web Vital id");
  if (!Number.isFinite(input.value) || input.value < 0 || input.value > 60 * 60 * 1000) {
    throw inputError("Invalid Web Vital value");
  }
  const metricKey = createHash("sha256").update(id).digest("hex");
  const rating = VITAL_RATINGS.has(input.rating || "") ? input.rating! : "";
  const navigationType = NAVIGATION_TYPES.has(input.navigationType || "") ? input.navigationType! : "";
  const createdAt = sqliteTimestamp(now);

  database.prepare(`
    INSERT INTO web_vitals
      (metric_id, route, metric_name, value, rating, navigation_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(metric_id, metric_name) DO UPDATE SET
      route = excluded.route,
      value = excluded.value,
      rating = excluded.rating,
      navigation_type = excluded.navigation_type,
      created_at = excluded.created_at
  `).run(metricKey, normalizeMetricRoute(input.route), name, input.value, rating, navigationType, createdAt);
  database.prepare("DELETE FROM web_vitals WHERE created_at < ?")
    .run(sqliteTimestamp(new Date(now.getTime() - WEB_VITAL_RETENTION_DAYS * 24 * 60 * 60 * 1000)));
}

export function recordOperationalEvent(
  database: Database.Database,
  eventType: OperationalEventType,
  scope = "",
  now = new Date(),
): void {
  const safeScope = scope.trim().replace(/[^a-z0-9_.-]/gi, "_").slice(0, 60);
  const bucketHour = sqliteTimestamp(now).slice(0, 13) + ":00:00";
  database.prepare(`
    INSERT INTO operational_metrics_hourly (bucket_hour, event_type, scope, event_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(bucket_hour, event_type, scope) DO UPDATE SET
      event_count = event_count + 1
  `).run(bucketHour, eventType, safeScope);
  database.prepare("DELETE FROM operational_metrics_hourly WHERE bucket_hour < ?")
    .run(sqliteTimestamp(new Date(now.getTime() - OPERATIONAL_RETENTION_DAYS * 24 * 60 * 60 * 1000)));
}

export function safeRecordOperationalEvent(
  database: Database.Database,
  eventType: OperationalEventType,
  scope = "",
): void {
  try {
    recordOperationalEvent(database, eventType, scope);
  } catch (error) {
    logWarning("observability.event", "Failed to aggregate operational event", {
      eventType,
      scope,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function getObservabilityOverview(
  database: Database.Database,
  input: { now?: Date; windowDays?: number } = {},
): ObservabilityOverview {
  const now = input.now ?? new Date();
  const windowDays = Math.max(1, Math.min(30, Math.round(input.windowDays ?? 7)));
  const windowStart = sqliteTimestamp(new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000));
  const vitalRows = database.prepare(`
    SELECT metric_name AS name, route, value
    FROM web_vitals
    WHERE created_at >= ?
    ORDER BY created_at DESC
  `).all(windowStart) as Array<{ name: WebVitalName; route: string; value: number }>;

  const vitals = WEB_VITAL_NAMES.map((name) => {
    const values = vitalRows.filter((row) => row.name === name).map((row) => row.value);
    return { name, p75: percentile(values, 0.75), samples: values.length };
  });
  const ttfbGroups = new Map<string, number[]>();
  for (const row of vitalRows) {
    if (row.name !== "TTFB") continue;
    const values = ttfbGroups.get(row.route) ?? [];
    values.push(row.value);
    ttfbGroups.set(row.route, values);
  }
  const ttfbRoutes = [...ttfbGroups.entries()]
    .map(([route, values]) => ({ route, p75: percentile(values, 0.75)!, samples: values.length }))
    .sort((left, right) => right.p75 - left.p75 || right.samples - left.samples)
    .slice(0, 8);

  const previousStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const currentStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const eventRows = database.prepare(`
    SELECT bucket_hour AS bucketHour, event_type AS eventType, scope, event_count AS count
    FROM operational_metrics_hourly
    WHERE bucket_hour >= ?
    ORDER BY bucket_hour DESC
  `).all(sqliteTimestamp(previousStart)) as Array<{
    bucketHour: string;
    eventType: OperationalEventType;
    scope: string;
    count: number;
  }>;
  const currentStartKey = sqliteTimestamp(currentStart);
  const eventTypes: OperationalEventType[] = [
    "login_failure",
    "upload_failure",
    "offline_sync_failure",
    "action_failure",
    "mcp_failure",
  ];
  const failures = eventTypes.map((eventType) => {
    const rows = eventRows.filter((row) => row.eventType === eventType);
    const currentRows = rows.filter((row) => row.bucketHour >= currentStartKey);
    const scopes = new Map<string, number>();
    for (const row of currentRows) scopes.set(row.scope, (scopes.get(row.scope) ?? 0) + row.count);
    return {
      eventType,
      last24Hours: currentRows.reduce((sum, row) => sum + row.count, 0),
      previous24Hours: rows.filter((row) => row.bucketHour < currentStartKey).reduce((sum, row) => sum + row.count, 0),
      scopes: [...scopes.entries()]
        .map(([scope, count]) => ({ scope, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5),
    };
  });

  return { windowDays, vitals, ttfbRoutes, failures };
}

type SlowQueryEvent = {
  durationMs: number;
  method: "all" | "get" | "run";
  sqlHash: string;
  sqlKind: string;
  table: string;
};

const instrumentedDatabases = new WeakSet<Database.Database>();

export function instrumentSlowQueries(
  database: Database.Database,
  options: {
    thresholdMs?: number;
    onSlowQuery?: (event: SlowQueryEvent) => void;
    now?: () => number;
  } = {},
): void {
  if (instrumentedDatabases.has(database)) return;
  instrumentedDatabases.add(database);
  const configured = Number(process.env.ZGCA_SLOW_QUERY_MS);
  const thresholdMs = options.thresholdMs
    ?? (Number.isFinite(configured) && configured >= 0 ? configured : 20);
  const now = options.now ?? (() => performance.now());
  const onSlowQuery = options.onSlowQuery ?? ((event) => {
    logWarning("db.slow", "Synchronous SQLite query exceeded threshold", event);
  });
  const originalPrepare = database.prepare.bind(database);

  database.prepare = ((sql: string) => {
    const statement = originalPrepare(sql);
    const mutable = statement as unknown as Record<"all" | "get" | "run", (...args: unknown[]) => unknown>;
    for (const method of ["all", "get", "run"] as const) {
      const original = mutable[method].bind(statement);
      mutable[method] = (...args: unknown[]) => {
        const started = now();
        try {
          return original(...args);
        } finally {
          const durationMs = now() - started;
          if (durationMs >= thresholdMs) onSlowQuery(describeSlowQuery(sql, method, durationMs));
        }
      };
    }
    return statement;
  }) as typeof database.prepare;
}

function describeSlowQuery(
  sql: string,
  method: SlowQueryEvent["method"],
  durationMs: number,
): SlowQueryEvent {
  const normalized = sql.replace(/\s+/g, " ").trim();
  const table = normalized.match(/\b(?:FROM|INTO|UPDATE|JOIN)\s+["`[]?([a-z0-9_]+)/i)?.[1] ?? "";
  return {
    durationMs: Math.round(durationMs * 10) / 10,
    method,
    sqlHash: createHash("sha256").update(normalized).digest("hex").slice(0, 16),
    sqlKind: normalized.split(" ", 1)[0]?.toUpperCase() || "UNKNOWN",
    table,
  };
}

function percentile(values: number[], percentileValue: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1);
  return Math.round(sorted[index] * 10) / 10;
}

function sqliteTimestamp(value: Date): string {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function inputError(message: string): Error {
  return Object.assign(new Error(message), { status: 400 });
}
