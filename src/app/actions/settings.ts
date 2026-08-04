"use server";

import { revalidatePath } from "next/cache";
import { actionFailure } from "@/lib/action-failure";
import { getDb } from "@/lib/db";
import {
  completeOnboarding,
  saveModulePrefs,
  saveSettings,
  type ExamCountdown,
  type ModulePref,
} from "@/lib/repo/settings";
import { requireWorkspace } from "@/lib/request-auth";
import { revokeUserSession } from "@/lib/auth";
import { createAgentToken, revokeAgentToken, type AgentTokenRow } from "@/lib/repo/agent-tokens";
import type { ActionResult } from "./day";

export async function saveSettingsAction(input: {
  examCountdowns: ExamCountdown[];
  dailyReviewLimit: number;
  learningGoal: string;
  weeklyMinutes: number;
  enabledSubjectCodes: string[];
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    const db = getDb();
    saveSettings(db, access, input);
    revalidatePath("/");
    revalidatePath("/settings");
    revalidatePath("/kinetic");
    revalidatePath("/kinetic/settings");
    return { ok: true };
  } catch (error) {
    return actionFailure("settings", error, "保存失败");
  }
}

export async function saveModulePrefsAction(input: { modulePrefs: ModulePref[] }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    saveModulePrefs(getDb(), access, input.modulePrefs);
    // 导航（侧栏/底部栏/命令面板）渲染在根 layout，需要整棵树失效
    revalidatePath("/", "layout");
    revalidatePath("/kinetic", "layout");
    return { ok: true };
  } catch (error) {
    return actionFailure("settings", error, "保存失败");
  }
}

export async function completeOnboardingAction(input: {
  learningGoal: string;
  weeklyMinutes: number;
  enabledSubjectCodes: string[];
  examCountdowns: ExamCountdown[];
  dailyReviewLimit: number;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    completeOnboarding(getDb(), access, input);
    revalidatePath("/");
    revalidatePath("/settings");
    revalidatePath("/kinetic");
    revalidatePath("/kinetic/settings");
    return { ok: true };
  } catch (error) {
    return actionFailure("settings", error, "保存失败");
  }
}

export async function revokeDeviceSessionAction(sessionId: string): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    const revoked = revokeUserSession(access.userId, sessionId, getDb());
    if (!revoked) return { ok: false, error: "设备会话不存在或已经退出" };
    revalidatePath("/settings");
    revalidatePath("/kinetic/settings");
    return { ok: true };
  } catch (error) {
    return actionFailure("settings", error, "退出设备失败");
  }
}

export async function createAgentTokenAction(input: {
  name: string;
}): Promise<ActionResult & { token?: string; record?: AgentTokenRow }> {
  try {
    const access = await requireWorkspace();
    const created = createAgentToken(getDb(), access, input);
    revalidatePath("/settings");
    revalidatePath("/kinetic/settings");
    return { ok: true, ...created };
  } catch (error) {
    return actionFailure("settings", error, "创建 Agent 令牌失败");
  }
}

export async function revokeAgentTokenAction(tokenId: string): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    revokeAgentToken(getDb(), access, tokenId);
    revalidatePath("/settings");
    revalidatePath("/kinetic/settings");
    return { ok: true };
  } catch (error) {
    return actionFailure("settings", error, "撤销 Agent 令牌失败");
  }
}
