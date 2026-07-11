"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, authenticateUser, changePassword, createSession, deleteSession } from "@/lib/auth";
import { requireAccessContext } from "@/lib/request-auth";

export type LoginState = { error?: string };

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const requestHeaders = await headers();
  const user = authenticateUser(email, password, {
    ipHint: requestHeaders.get("x-forwarded-for") || requestHeaders.get("x-real-ip") || "",
  });
  if (!user) return { error: "邮箱或密码不正确，或登录尝试过于频繁" };

  const session = createSession({
    userId: user.userId,
    userAgent: requestHeaders.get("user-agent") || "",
    ipHint: requestHeaders.get("x-forwarded-for") || "",
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });

  redirect(user.mustChangePassword ? "/change-password" : safeNextPath(formData.get("next")));
}

export async function updateRequiredPassword(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmation = String(formData.get("passwordConfirmation") || "");
  if (newPassword !== confirmation) return { error: "两次输入的新密码不一致" };
  if (newPassword === currentPassword) return { error: "新密码不能与当前密码相同" };

  let destination = "/";
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
    cookieStore.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: session.expiresAt,
    });
    destination = access.role === "admin" ? "/admin" : "/";
  } catch (error) {
    return { error: error instanceof Error ? error.message : "密码更新失败" };
  }
  redirect(destination);
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  deleteSession(cookieStore.get(SESSION_COOKIE)?.value);
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}

function safeNextPath(value: unknown): string {
  const next = String(value || "");
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}
