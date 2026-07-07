import { cookies } from "next/headers";
import { SESSION_COOKIE, getSessionUser } from "./auth";

export class AuthError extends Error {
  status = 401;
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

export async function requireSession(request?: Request): Promise<{ id: string; email: string; displayName: string }> {
  const token = request
    ? readCookieValue(request.headers.get("cookie"), SESSION_COOKIE)
    : (await cookies()).get(SESSION_COOKIE)?.value;
  const user = getSessionUser(token);
  if (!user) throw new AuthError("Authentication required");
  return user;
}

export async function optionalSession(request?: Request): Promise<{ id: string; email: string; displayName: string } | null> {
  const token = request
    ? readCookieValue(request.headers.get("cookie"), SESSION_COOKIE)
    : (await cookies()).get(SESSION_COOKIE)?.value;
  return getSessionUser(token);
}

export async function assertSameOrigin(request: Request): Promise<void> {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const expectedHost = new URL(request.url).host;
  if (new URL(origin).host !== expectedHost) {
    const error = new Error("Invalid request origin") as Error & { status?: number };
    error.status = 403;
    throw error;
  }
}
