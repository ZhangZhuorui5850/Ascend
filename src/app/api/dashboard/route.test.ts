import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const getDashboard = vi.fn(() => ({ today: "2026-07-07" }));

vi.mock("@/lib/request-auth", () => ({
  authErrorResponse: (error: Error & { status?: number }) =>
    Response.json({ error: error.message }, { status: error.status ?? 500 }),
  requireSession,
}));

vi.mock("@/lib/repository", () => ({
  getDashboard,
}));

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    requireSession.mockReset();
    getDashboard.mockClear();
  });

  it("requires a session before returning dashboard data", async () => {
    const error = new Error("Authentication required") as Error & { status?: number };
    error.status = 401;
    requireSession.mockRejectedValueOnce(error);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Authentication required" });
    expect(getDashboard).not.toHaveBeenCalled();
  });

  it("returns dashboard data for an authenticated request", async () => {
    requireSession.mockResolvedValueOnce({ id: "u1", email: "user@example.com", displayName: "User" });

    const { GET } = await import("./route");
    const response = await GET();

    await expect(response.json()).resolves.toEqual({ today: "2026-07-07" });
    expect(getDashboard).toHaveBeenCalledTimes(1);
  });
});
