import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

vi.mock("./lib/auth", () => ({
  SESSION_COOKIE: "zgca_session",
  getSessionUser: vi.fn(() => {
    throw new Error("proxy should not hit getSessionUser");
  }),
}));

afterEach(() => {
  vi.resetModules();
});

describe("proxy", () => {
  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image?url=%2Ficons%2Ficon-192.png&w=256&q=75",
    "/favicon.ico",
    "/icon.svg",
    "/apple-icon.png",
    "/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png",
    "/site.webmanifest?v=2",
    "/icons/icon-192.png",
    "/brand/aurora/mark.svg",
    "/sw.js",
    "/offline.html",
  ])("bypasses proxy for public asset %s", async (url) => {
    const { config } = await import("./proxy");

    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  });

  it.each(["/", "/calendar", "/api/dashboard"])("runs proxy for protected route %s", async (url) => {
    const { config } = await import("./proxy");

    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
  });

  it("allows public login routes without auth", async () => {
    const { proxy } = await import("./proxy");

    const response = proxy(new NextRequest("http://localhost/login"));

    expect(response.status).toBe(200);
  });

  it("allows invitation setup publicly while keeping Admin routes private", async () => {
    const { proxy } = await import("./proxy");

    expect(proxy(new NextRequest("http://localhost/invite/one-time-token")).status).toBe(200);
    const adminResponse = proxy(new NextRequest("http://localhost/admin"));
    expect(adminResponse.status).toBe(307);
    expect(adminResponse.headers.get("location")).toBe("http://localhost/login?next=%2Fadmin");
  });

  it("allows the container health check without a session", async () => {
    const { proxy } = await import("./proxy");
    expect(proxy(new NextRequest("http://localhost/api/health")).status).toBe(200);
  });

  it("lets the MCP route perform its own Bearer authentication", async () => {
    const { proxy } = await import("./proxy");
    expect(proxy(new NextRequest("http://localhost/api/mcp", { method: "POST" })).status).toBe(200);
  });

  it.each([
    "/api/algorithm/v1/capabilities",
    "/api/algorithm/vscode/queue",
    "/api/algorithm/vscode/pairings",
  ])("lets the algorithm device route perform its own authentication for %s", async (url) => {
    const { proxy } = await import("./proxy");
    expect(proxy(new NextRequest(`http://localhost${url}`)).status).toBe(200);
  });

  it("returns 401 for private API routes without a session cookie", async () => {
    const { proxy } = await import("./proxy");

    const response = proxy(new NextRequest("http://localhost/api/dashboard"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Authentication required" });
  });

  it("redirects page routes without a session cookie to login", async () => {
    const { proxy } = await import("./proxy");

    const response = proxy(new NextRequest("http://localhost/calendar"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fcalendar");
  });

  it("allows requests with a session cookie without validating against the database", async () => {
    const { proxy } = await import("./proxy");

    const request = new NextRequest("http://localhost/api/dashboard", {
      headers: {
        cookie: "zgca_session=optimistic-token",
      },
    });

    const response = proxy(request);

    expect(response.status).toBe(200);
  });
});
