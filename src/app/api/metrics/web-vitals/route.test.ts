import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "@/lib/repo/testing";

let testDb: Database.Database | undefined;

vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  getDb: () => testDb!,
}));

vi.mock("@/lib/request-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/request-auth")>()),
  requireAccessContext: async () => ({
    userId: "metrics-user",
    email: "metrics@example.com",
    displayName: "Metrics",
    role: "user",
    status: "active",
    workspaceId: "metrics-workspace",
    mustChangePassword: false,
  }),
  assertSameOrigin: async () => undefined,
}));

describe("POST /api/metrics/web-vitals", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb?.close();
    testDb = undefined;
    vi.resetModules();
  });

  it("accepts a bounded metric and stores no route identifier or account data", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      id: "vital-id",
      name: "TTFB",
      value: 123.4,
      rating: "good",
      navigationType: "navigate",
      route: "/subjects/M1?token=private",
    }));

    expect(response.status).toBe(204);
    expect(testDb!.prepare(`
      SELECT route, metric_name AS name, value
      FROM web_vitals
    `).get()).toEqual({ route: "/subjects/:id", name: "TTFB", value: 123.4 });
  });

  it("returns a client error for an unsupported metric", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      id: "vital-id",
      name: "made-up",
      value: 10,
      route: "/",
    }));

    expect(response.status).toBe(400);
  });
});

function request(body: unknown): Request {
  return new Request("http://localhost/api/metrics/web-vitals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}
