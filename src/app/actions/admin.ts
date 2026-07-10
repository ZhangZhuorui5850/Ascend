"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import {
  createInvitation,
  resetUserPassword,
  revokeUserSessions,
  setUserStatus,
  setWorkspaceQuota,
} from "@/lib/repo/admin";
import { requireAdmin } from "@/lib/request-auth";
import type { ActionResult } from "./day";

export type InvitationActionResult = ActionResult & {
  invitationToken?: string;
  userId?: string;
  expiresAt?: string;
};

function failure(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
}

function refreshAdmin(targetUserId?: string): void {
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/audit");
  if (targetUserId) revalidatePath(`/admin/users/${targetUserId}`);
}

export async function inviteUserAction(input: {
  email: string;
  displayName: string;
}): Promise<InvitationActionResult> {
  try {
    const admin = await requireAdmin();
    const invitation = createInvitation(getDb(), admin, input);
    refreshAdmin(invitation.userId);
    return {
      ok: true,
      invitationToken: invitation.invitationUrlToken,
      userId: invitation.userId,
      expiresAt: invitation.expiresAt,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function setUserStatusAction(
  targetUserId: string,
  status: "active" | "suspended",
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    setUserStatus(getDb(), admin, targetUserId, status);
    refreshAdmin(targetUserId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeUserSessionsAction(targetUserId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    revokeUserSessions(getDb(), admin, targetUserId);
    refreshAdmin(targetUserId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function resetUserPasswordAction(
  targetUserId: string,
  temporaryPassword: string,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    resetUserPassword(getDb(), admin, targetUserId, temporaryPassword);
    refreshAdmin(targetUserId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function setWorkspaceQuotaAction(targetUserId: string, quotaBytes: number): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    setWorkspaceQuota(getDb(), admin, targetUserId, quotaBytes);
    refreshAdmin(targetUserId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
