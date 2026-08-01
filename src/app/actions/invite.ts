"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { actionFailure } from "@/lib/action-failure";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activateInvitation } from "@/lib/repo/admin";

export type InviteActivationState = { error?: string };

export async function activateInvite(
  _previous: InviteActivationState,
  formData: FormData,
): Promise<InviteActivationState> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirmation = String(formData.get("passwordConfirmation") || "");
  if (password !== confirmation) return { error: "两次输入的密码不一致" };

  try {
    const activated = activateInvitation(getDb(), token, password);
    const requestHeaders = await headers();
    const session = createSession({
      userId: activated.userId,
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
  } catch (error) {
    return { error: actionFailure("invite", error, "邀请激活失败").error };
  }

  redirect("/onboarding");
}
