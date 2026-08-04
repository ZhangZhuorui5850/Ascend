"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { actionFailure } from "@/lib/action-failure";
import {
  SESSION_COOKIE,
  authenticateUser,
  changePassword,
  createSession,
  deleteSession,
  findTokenForUser,
  getSessionContext,
  mergeAccountTokens,
} from "@/lib/auth";
import {
  clearSessionCookies,
  readSessionsCookie,
  sessionsListExpiry,
  setSessionCookies,
} from "@/lib/session-cookies";
import { requireAccessContext } from "@/lib/request-auth";
import type { ActionResult } from "./day";

export type LoginState = { error?: string };

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const requestHeaders = await headers();
  const user = authenticateUser(email, password, {
    ipHint: requestHeaders.get("x-forwarded-for") || requestHeaders.get("x-real-ip") || "",
  });
  if (!user) return { error: "账号或密码不正确，或登录尝试过于频繁" };

  const session = createSession({
    userId: user.userId,
    userAgent: requestHeaders.get("user-agent") || "",
    ipHint: requestHeaders.get("x-forwarded-for") || "",
  });

  const cookieStore = await cookies();
  // 新登录账号并入本设备账号列表：旧活跃会话保留，可免密切回
  const previousActive = cookieStore.get(SESSION_COOKIE)?.value;
  const listed = await readSessionsCookie();
  const tokens = mergeAccountTokens(session.token, previousActive ? [previousActive, ...listed] : listed);
  setSessionCookies(cookieStore, session.token, tokens, session.expiresAt);

  const nextPath = safeNextPath(formData.get("next"));
  redirect(user.mustChangePassword
    ? nextPath.startsWith("/kinetic")
      ? `/kinetic/change-password?next=${encodeURIComponent(nextPath)}`
      : "/change-password"
    : nextPath);
}

/** 免密切换到本设备已登录的另一个账号。 */
export async function switchAccountAction(userId: string): Promise<ActionResult> {
  const cookieStore = await cookies();
  const active = cookieStore.get(SESSION_COOKIE)?.value;
  const tokens = mergeAccountTokens(active, await readSessionsCookie());
  const target = findTokenForUser(tokens, userId);
  if (!target) return { ok: false, error: "该账号的登录状态已失效，请重新登录" };

  const context = getSessionContext(target)!;
  setSessionCookies(cookieStore, target, tokens, sessionsListExpiry());
  redirect(context.role === "admin" ? "/admin" : "/");
}

export async function updateRequiredPassword(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmation = String(formData.get("passwordConfirmation") || "");
  if (newPassword !== confirmation) return { error: "两次输入的新密码不一致" };
  if (newPassword === currentPassword) return { error: "新密码不能与当前密码相同" };

  let destination = safeNextPath(formData.get("next"));
  try {
    const access = await requireAccessContext();
    changePassword(access.userId, currentPassword, newPassword);
    const requestHeaders = await headers();
    const session = createSession({
      userId: access.userId,
      userAgent: requestHeaders.get("user-agent") || "",
      ipHint: requestHeaders.get("x-forwarded-for") || requestHeaders.get("x-real-ip") || "",
    });
    const cookieStore = await cookies();
    // 改密后本用户全部旧会话已吊销；重建活跃会话并清理列表中的失效 token
    const tokens = mergeAccountTokens(session.token, await readSessionsCookie());
    setSessionCookies(cookieStore, session.token, tokens, session.expiresAt);
    destination = access.role === "admin" ? "/admin" : destination;
  } catch (error) {
    return { error: actionFailure("auth", error, "密码更新失败").error };
  }
  redirect(destination);
}

/** 退出当前账号：列表里还有其他有效账号时自动顶上，否则回登录页。 */
async function performLogout(loginPath: "/login" | "/kinetic/login"): Promise<void> {
  const cookieStore = await cookies();
  const active = cookieStore.get(SESSION_COOKIE)?.value;
  deleteSession(active);

  const remaining = mergeAccountTokens(undefined, (await readSessionsCookie()).filter((token) => token !== active));
  if (remaining.length) {
    const next = remaining[0];
    const context = getSessionContext(next)!;
    setSessionCookies(cookieStore, next, remaining, sessionsListExpiry());
    redirect(context.role === "admin" ? "/admin" : "/");
  }

  clearSessionCookies(cookieStore);
  redirect(loginPath);
}

export async function logout(): Promise<void> {
  return performLogout("/login");
}

export async function logoutKinetic(): Promise<void> {
  return performLogout("/kinetic/login");
}

/** 退出本设备全部账号。 */
export async function logoutAll(): Promise<void> {
  const cookieStore = await cookies();
  const active = cookieStore.get(SESSION_COOKIE)?.value;
  for (const token of new Set([active, ...(await readSessionsCookie())])) deleteSession(token);
  clearSessionCookies(cookieStore);
  redirect("/login");
}

function safeNextPath(value: unknown): string {
  const next = String(value || "");
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}
