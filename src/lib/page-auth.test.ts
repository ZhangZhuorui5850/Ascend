import { describe, expect, it } from "vitest";
import type { AccessContext } from "./access-context";
import { workspaceRedirectTarget } from "./page-auth";

function makeContext(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    userId: "user-1",
    email: "user@example.com",
    displayName: "用户",
    role: "user",
    status: "active",
    workspaceId: "workspace:legacy",
    mustChangePassword: false,
    ...overrides,
  };
}

describe("workspaceRedirectTarget", () => {
  it("sends an authenticated user without a workspace back to login instead of crashing", () => {
    expect(workspaceRedirectTarget(makeContext({ workspaceId: null }), "/")).toBe("/login?next=%2F");
  });

  it("preserves the requested path in the login redirect", () => {
    expect(workspaceRedirectTarget(makeContext({ workspaceId: null }), "/day/2026-07-10")).toBe(
      "/login?next=%2Fday%2F2026-07-10",
    );
  });

  it("keeps unauthenticated Kinetic navigation inside the Kinetic entry flow", () => {
    expect(workspaceRedirectTarget(makeContext({ workspaceId: null }), "/kinetic/tasks")).toBe(
      "/kinetic/login?next=%2Fkinetic%2Ftasks",
    );
  });

  it("sends a user with a pending forced password change to the change-password page", () => {
    expect(workspaceRedirectTarget(makeContext({ mustChangePassword: true }), "/")).toBe("/change-password");
  });

  it("preserves a Kinetic destination through a forced password change", () => {
    expect(workspaceRedirectTarget(makeContext({ mustChangePassword: true }), "/kinetic/calendar")).toBe(
      "/kinetic/change-password?next=%2Fkinetic%2Fcalendar",
    );
  });

  it("sends an admin to the admin console instead of a learning workspace", () => {
    expect(workspaceRedirectTarget(makeContext({ role: "admin", workspaceId: null }), "/", true)).toBe("/admin");
  });

  it("returns null for an active user with a workspace", () => {
    expect(workspaceRedirectTarget(makeContext(), "/")).toBeNull();
  });

  it("sends an incomplete ordinary user to onboarding even when another path was requested", () => {
    expect(workspaceRedirectTarget(makeContext(), "/day/2026-07-25", true)).toBe("/onboarding");
  });

  it("allows the onboarding page itself to avoid a redirect loop", () => {
    expect(workspaceRedirectTarget(makeContext(), "/onboarding", true)).toBeNull();
  });

  it("keeps incomplete Kinetic workspaces in the Kinetic onboarding flow", () => {
    expect(workspaceRedirectTarget(makeContext(), "/kinetic/tasks", true)).toBe("/kinetic/onboarding");
    expect(workspaceRedirectTarget(makeContext(), "/kinetic/onboarding", true)).toBeNull();
  });

  it("keeps forced password changes ahead of onboarding", () => {
    expect(workspaceRedirectTarget(makeContext({ mustChangePassword: true }), "/", true)).toBe("/change-password");
  });
});
