import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const assertSameOrigin = vi.fn();
const createStudySession = vi.fn((payload: unknown) => payload);

vi.mock("@/lib/request-auth", () => ({
  assertSameOrigin,
  authErrorResponse: (error: Error & { status?: number }) =>
    Response.json({ error: error.message }, { status: error.status ?? 500 }),
  requireSession,
}));

vi.mock("@/lib/repository", () => ({
  createStudySession,
}));

describe("POST /api/study-sessions", () => {
  beforeEach(() => {
    requireSession.mockReset();
    assertSameOrigin.mockReset();
    createStudySession.mockClear();
  });

  it("rejects unauthenticated requests before reading the body", async () => {
    const error = new Error("Authentication required") as Error & { status?: number };
    error.status = 401;
    requireSession.mockRejectedValueOnce(error);

    const json = vi.fn(async () => ({ day: "2026-07-07" }));
    const request = { json } as unknown as Request;
    const { POST } = await import("./route");
    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Authentication required" });
    expect(assertSameOrigin).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });

  it("checks same-origin before reading the body", async () => {
    requireSession.mockResolvedValueOnce({ id: "u1", email: "user@example.com", displayName: "User" });
    const error = new Error("Invalid request origin") as Error & { status?: number };
    error.status = 403;
    assertSameOrigin.mockRejectedValueOnce(error);

    const json = vi.fn(async () => ({ day: "2026-07-07" }));
    const request = { json } as unknown as Request;
    const { POST } = await import("./route");
    const response = await POST(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid request origin" });
    expect(json).not.toHaveBeenCalled();
    expect(createStudySession).not.toHaveBeenCalled();
  });

  it("creates a study session for authenticated same-origin requests", async () => {
    requireSession.mockResolvedValueOnce({ id: "u1", email: "user@example.com", displayName: "User" });
    assertSameOrigin.mockResolvedValueOnce(undefined);

    const payload = { day: "2026-07-07", title: "Linear algebra" };
    const request = { json: vi.fn(async () => payload) } as unknown as Request;
    const { POST } = await import("./route");
    const response = await POST(request);

    await expect(response.json()).resolves.toEqual(payload);
    expect(createStudySession).toHaveBeenCalledWith(payload);
  });
});
