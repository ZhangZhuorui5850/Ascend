"use server";

import { revalidatePath } from "next/cache";
import { actionFailure } from "@/lib/action-failure";
import { getDb } from "@/lib/db";
import { createAlgorithmProblem, recordAlgorithmAttempt } from "@/lib/repo/algorithms";
import { requireWorkspace } from "@/lib/request-auth";
import type { ActionResult } from "./day";

function revalidateAlgorithmViews(day?: string): void {
  revalidatePath("/practice/algorithms");
  revalidatePath("/kinetic/practice/algorithms");
  revalidatePath("/");
  revalidatePath("/kinetic");
  revalidatePath("/analytics");
  revalidatePath("/kinetic/analytics");
  if (day) {
    revalidatePath(`/day/${day}`);
    revalidatePath(`/kinetic/day/${day}`);
    revalidatePath("/calendar");
    revalidatePath("/kinetic/calendar");
  }
}

export async function createAlgorithmProblemAction(input: {
  sourceUrl: string;
  title: string;
  externalProblemId?: string;
  difficultyBand?: string;
  tags?: string[];
  notes?: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    createAlgorithmProblem(getDb(), access, input);
    revalidateAlgorithmViews();
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "题目保存失败");
  }
}

export async function recordAlgorithmAttemptAction(input: {
  problemId: number;
  day: string;
  verdict: string;
  durationMinutes?: number;
  maxHintLevel?: number;
  preConfidence?: number | null;
  reviewKind?: string;
  transferSourceProblemId?: number | null;
  errorCategory?: string;
  reflection?: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    recordAlgorithmAttempt(getDb(), access, input);
    revalidateAlgorithmViews(input.day);
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "训练结果保存失败");
  }
}
