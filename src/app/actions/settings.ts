"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import {
  completeOnboarding,
  saveDailyReviewLimit,
  saveExamCountdowns,
  saveLearningPreferences,
  type ExamCountdown,
} from "@/lib/repo/settings";
import { requireWorkspace } from "@/lib/request-auth";
import { revokeUserSession } from "@/lib/auth";
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
    saveExamCountdowns(db, access, input.examCountdowns);
    saveDailyReviewLimit(db, access, input.dailyReviewLimit);
    if (input.learningGoal.trim() && input.enabledSubjectCodes.length) saveLearningPreferences(db, access, input);
    revalidatePath("/");
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "保存失败" };
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
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "保存失败" };
  }
}

export async function revokeDeviceSessionAction(sessionId: string): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    const revoked = revokeUserSession(access.userId, sessionId, getDb());
    if (!revoked) return { ok: false, error: "设备会话不存在或已经退出" };
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "退出设备失败" };
  }
}
