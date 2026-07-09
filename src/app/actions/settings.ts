"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { saveDailyReviewLimit, saveExamCountdowns, type ExamCountdown } from "@/lib/repo/settings";
import { requireSession } from "@/lib/request-auth";
import type { ActionResult } from "./day";

export async function saveSettingsAction(input: {
  examCountdowns: ExamCountdown[];
  dailyReviewLimit: number;
}): Promise<ActionResult> {
  try {
    await requireSession();
    const db = getDb();
    saveExamCountdowns(db, input.examCountdowns);
    saveDailyReviewLimit(db, input.dailyReviewLimit);
    revalidatePath("/");
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "保存失败" };
  }
}
