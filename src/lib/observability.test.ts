import { describe, expect, it } from "vitest";
import { createTestDb } from "./repo/testing";
import {
  getObservabilityOverview,
  instrumentSlowQueries,
  normalizeMetricRoute,
  recordOperationalEvent,
  recordWebVital,
} from "./observability";

describe("operational observability", () => {
  it("normalizes dynamic and unknown routes without retaining identifiers or query strings", () => {
    expect(normalizeMetricRoute("/day/2026-07-25?token=secret")).toBe("/day/:date");
    expect(normalizeMetricRoute("/subjects/M1")).toBe("/subjects/:id");
    expect(normalizeMetricRoute("/admin/users/user-secret/workspace")).toBe("/admin/users/:id/workspace");
    expect(normalizeMetricRoute("/private/user-secret")).toBe("/_other");
  });

  it("stores anonymous Web Vitals, updates repeated metric ids, and computes p75", () => {
    const db = createTestDb();
    const now = new Date("2026-07-25T12:00:00.000Z");
    for (const [index, value] of [100, 200, 300, 400].entries()) {
      recordWebVital(db, {
        id: `metric-${index}`,
        name: "LCP",
        value,
        route: `/day/2026-07-${20 + index}?answer=private`,
        rating: "good",
        navigationType: "navigate",
      }, now);
    }
    recordWebVital(db, {
      id: "metric-0",
      name: "LCP",
      value: 150,
      route: "/day/changed",
    }, now);

    const overview = getObservabilityOverview(db, { now });
    expect(overview.vitals.find((metric) => metric.name === "LCP")).toEqual({
      name: "LCP",
      p75: 300,
      samples: 4,
    });
    const stored = db.prepare(`
      SELECT metric_id, route, value
      FROM web_vitals
      WHERE value = 150
    `).get() as { metric_id: string; route: string; value: number };
    expect(stored).toMatchObject({ route: "/day/:date", value: 150 });
    expect(stored.metric_id).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.metric_id).not.toContain("metric-0");
    const columns = (db.prepare("PRAGMA table_info(web_vitals)").all() as Array<{ name: string }>).map((row) => row.name);
    expect(columns).not.toContain("user_id");
    expect(columns).not.toContain("ip");
  });

  it("aggregates failure counts by hour and compares adjacent 24-hour windows", () => {
    const db = createTestDb();
    const now = new Date("2026-07-25T12:30:00.000Z");
    recordOperationalEvent(db, "action_failure", "planner", now);
    recordOperationalEvent(db, "action_failure", "planner", now);
    recordOperationalEvent(db, "action_failure", "settings", now);
    recordOperationalEvent(db, "action_failure", "planner", new Date(now.getTime() - 25 * 60 * 60 * 1000));

    const failure = getObservabilityOverview(db, { now }).failures
      .find((item) => item.eventType === "action_failure");
    expect(failure).toEqual({
      eventType: "action_failure",
      last24Hours: 3,
      previous24Hours: 1,
      scopes: [
        { scope: "planner", count: 2 },
        { scope: "settings", count: 1 },
      ],
    });
  });

  it("logs only a slow query fingerprint and metadata, never SQL parameters", () => {
    const db = createTestDb();
    const events: Array<Record<string, unknown>> = [];
    let clock = 0;
    instrumentSlowQueries(db, {
      thresholdMs: 0,
      now: () => ++clock,
      onSlowQuery: (event) => events.push(event),
    });

    expect(db.prepare("SELECT ? AS private_value").get("do-not-log-me")).toEqual({
      private_value: "do-not-log-me",
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      durationMs: 1,
      method: "get",
      sqlKind: "SELECT",
      table: "",
    });
    expect(JSON.stringify(events[0])).not.toContain("do-not-log-me");
    expect(events[0].sqlHash).toMatch(/^[a-f0-9]{16}$/);
  });
});
