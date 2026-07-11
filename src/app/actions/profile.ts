"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { changePassword, createSession, mergeAccountTokens } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  AVATAR_IMAGE_MAX_BYTES,
  setImageAvatar,
  setSealAvatar,
  updateDisplayName,
} from "@/lib/repo/profile";
import { readSessionsCookie, setSessionCookies } from "@/lib/session-cookies";
import { requireAccessContext } from "@/lib/request-auth";
import type { ActionResult } from "./day";

function revalidateProfileEverywhere() {
  // 昵称/头像出现在侧栏、顶栏和账户菜单，整个布局都要刷新
  revalidatePath("/", "layout");
}

export async function updateProfileAction(input: { displayName: string }): Promise<ActionResult> {
  try {
    const access = await requireAccessContext();
    updateDisplayName(getDb(), access.userId, input.displayName);
    revalidateProfileEverywhere();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "昵称更新失败" };
  }
}

export async function saveSealAvatarAction(input: { char: string; color: string }): Promise<ActionResult> {
  try {
    const access = await requireAccessContext();
    setSealAvatar(getDb(), access.userId, input);
    revalidateProfileEverywhere();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "头像更新失败" };
  }
}

export async function uploadAvatarImageAction(formData: FormData): Promise<ActionResult> {
  try {
    const access = await requireAccessContext();
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) return { ok: false, error: "请选择一张图片" };
    if (file.size > AVATAR_IMAGE_MAX_BYTES) return { ok: false, error: "头像图片不能超过 2MB" };
    setImageAvatar(getDb(), access.userId, {
      image: Buffer.from(await file.arrayBuffer()),
      mime: file.type,
    });
    revalidateProfileEverywhere();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "头像上传失败" };
  }
}

export async function changeAccountPasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult> {
  try {
    const access = await requireAccessContext();
    changePassword(access.userId, input.currentPassword, input.newPassword);
    // 改密吊销本用户全部会话（含当前）；重建当前会话保持登录不中断
    const requestHeaders = await headers();
    const session = createSession({
      userId: access.userId,
      userAgent: requestHeaders.get("user-agent") || "",
      ipHint: requestHeaders.get("x-forwarded-for") || requestHeaders.get("x-real-ip") || "",
    });
    const cookieStore = await cookies();
    const tokens = mergeAccountTokens(session.token, await readSessionsCookie());
    setSessionCookies(cookieStore, session.token, tokens, session.expiresAt);
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "密码修改失败" };
  }
}
