import { cookies } from "next/headers";
import type { AccessContext } from "./access-context";
import { getSessionContext } from "./auth";
import { SESSION_COOKIE } from "./auth-constants";

export class AuthError extends Error {
  constructor(message: string, public status = 401) {
    super(message);
  }
}

function readCookieValue(header: string | null, name: string): string | undefined {
  if (!header) return undefined;

  for (const part of header.split(/;\s*/)) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator) !== name) continue;
    return decodeURIComponent(part.slice(separator + 1));
  }

  return undefined;
}

export async function requireAccessContext(request?: Request): Promise<AccessContext> {
  const token = request
    ? readCookieValue(request.headers.get("cookie"), SESSION_COOKIE)
    : (await cookies()).get(SESSION_COOKIE)?.value;
  const user = getSessionContext(token);
  if (!user) throw new AuthError("Authentication required");
  return user;
}

export const requireSession = requireAccessContext;

export async function optionalSession(request?: Request): Promise<AccessContext | null> {
  const token = request
    ? readCookieValue(request.headers.get("cookie"), SESSION_COOKIE)
    : (await cookies()).get(SESSION_COOKIE)?.value;
  return getSessionContext(token);
}

export function assertWorkspaceAccess(context: AccessContext): AccessContext & { workspaceId: string } {
  if (!context.workspaceId) throw new AuthError("Learning workspace required", 403);
  return context as AccessContext & { workspaceId: string };
}

export function assertAdmin(context: AccessContext): AccessContext & { role: "admin" } {
  if (context.role !== "admin") throw new AuthError("Administrator access required", 403);
  return context as AccessContext & { role: "admin" };
}

export async function requireWorkspace(request?: Request): Promise<AccessContext & { workspaceId: string }> {
  return assertWorkspaceAccess(await requireAccessContext(request));
}

export async function requireAdmin(request?: Request): Promise<AccessContext & { role: "admin" }> {
  return assertAdmin(await requireAccessContext(request));
}

export async function assertSameOrigin(request: Request): Promise<void> {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const originHost = new URL(origin).host;
  const expectedHosts = [
    new URL(request.url).host,
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
  ].filter(Boolean);
  if (!expectedHosts.includes(originHost)) {
    const error = new Error("Invalid request origin") as Error & { status?: number };
    error.status = 403;
    throw error;
  }
}

export function authErrorResponse(error: unknown): Response {
  const status = error instanceof Error && typeof (error as Error & { status?: number }).status === "number"
    ? (error as Error & { status?: number }).status!
    : 500;
  const message = error instanceof Error ? error.message : "Internal server error";

  return Response.json({ error: message }, { status });
}
