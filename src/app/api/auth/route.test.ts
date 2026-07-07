import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieSet = vi.fn();
const cookieDelete = vi.fn();
const cookieGet = vi.fn();
const authenticateUser = vi.fn();
const createSession = vi.fn();
const deleteSession = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: cookieSet,
    delete: cookieDelete,
    get: cookieGet,
  })),
}));

vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE: "zgca_session",
  authenticateUser,
  createSession,
  deleteSession,
}));

describe("auth routes", () => {
  beforeEach(() => {
    vi.resetModules();
    cookieSet.mockReset();
    cookieDelete.mockReset();
    cookieGet.mockReset();
    authenticateUser.mockReset();
    createSession.mockReset();
    deleteSession.mockReset();
  });

  it("returns JSON 403 for cross-origin login attempts", async () => {
    const { POST } = await import("./login/route");
    const request = new Request("https://zgca.local/api/auth/login", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: JSON.stringify({ email: "user@example.com", password: "secret" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request origin" });
    expect(authenticateUser).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("returns JSON 403 for cross-origin logout attempts", async () => {
    const { POST } = await import("./logout/route");
    const request = new Request("https://zgca.local/api/auth/logout", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request origin" });
    expect(deleteSession).not.toHaveBeenCalled();
    expect(cookieDelete).not.toHaveBeenCalled();
  });
});
