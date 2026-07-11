import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSIONS_COOKIE } from "./auth-constants";

const SESSIONS_COOKIE_DAYS = 30;

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

export function sessionsListExpiry(): Date {
  return new Date(Date.now() + SESSIONS_COOKIE_DAYS * 24 * 60 * 60 * 1000);
}

/** 解析本设备账号列表 cookie（JSON 数组），格式异常时按空列表处理。 */
export function parseSessionsCookieValue(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function readSessionsCookie(): Promise<string[]> {
  return parseSessionsCookieValue((await cookies()).get(SESSIONS_COOKIE)?.value);
}

/** 写活跃会话 + 本设备账号列表两个 cookie；tokens 应已含 activeToken 且经过合并去重。 */
export function setSessionCookies(cookieStore: CookieStore, activeToken: string, tokens: string[], expiresAt: Date): void {
  cookieStore.set(SESSION_COOKIE, activeToken, cookieOptions(expiresAt));
  cookieStore.set(SESSIONS_COOKIE, JSON.stringify(tokens), cookieOptions(sessionsListExpiry()));
}

export function clearSessionCookies(cookieStore: CookieStore): void {
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(SESSIONS_COOKIE);
}
