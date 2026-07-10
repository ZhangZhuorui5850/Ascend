import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
  it("allows public login routes without auth", async () => {
    const { proxy } = await import("../proxy");

    const response = proxy(new NextRequest("http://localhost/login"));

    expect(response.status).toBe(200);
  });

  it("allows invitation setup publicly while keeping Admin routes private", async () => {
    const { proxy } = await import("../proxy");

    expect(proxy(new NextRequest("http://localhost/invite/one-time-token")).status).toBe(200);
    const adminResponse = proxy(new NextRequest("http://localhost/admin"));
    expect(adminResponse.status).toBe(307);
    expect(adminResponse.headers.get("location")).toBe("http://localhost/login?next=%2Fadmin");
  });

  it("returns 401 for private API routes without a session cookie", async () => {
    const { proxy } = await import("../proxy");

    const response = proxy(new NextRequest("http://localhost/api/dashboard"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Authentication required" });
  });

  it("redirects page routes without a session cookie to login", async () => {
    const { proxy } = await import("../proxy");

    const response = proxy(new NextRequest("http://localhost/calendar"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fcalendar");
  });

  it("allows requests with a session cookie without validating against the database", async () => {
    const { proxy } = await import("../proxy");

    const request = new NextRequest("http://localhost/api/dashboard", {
      headers: {
        cookie: "zgca_session=optimistic-token",
      },
    });

    const response = proxy(request);

    expect(response.status).toBe(200);
  });
});
