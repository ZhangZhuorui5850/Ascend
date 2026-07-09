"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, authenticateUser, createSession, deleteSession } from "@/lib/auth";

export type LoginState = { error?: string };

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const user = authenticateUser(email, password);
  if (!user) return { error: "邮箱或密码不正确" };

  const requestHeaders = await headers();
  const session = createSession({
    userId: user.id,
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

  redirect(safeNextPath(formData.get("next")));
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
