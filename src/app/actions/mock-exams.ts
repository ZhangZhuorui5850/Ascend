"use server";

import { revalidatePath } from "next/cache";
import { actionFailure } from "@/lib/action-failure";
import { getDb } from "@/lib/db";
import {
  createMockExam,
  type MockExamBreakdownInput,
  type MockExamDifficulty,
} from "@/lib/repo/mock-exams";
import { requireWorkspace } from "@/lib/request-auth";
import type { ActionResult } from "./day";

export async function createMockExamAction(input: {
  day: string;
  name: string;
  subjectCode?: string;
  score: number;
  maxScore: number;
  durationMinutes?: number;
  scopeLabel?: string;
  difficulty?: MockExamDifficulty;
  notes?: string;
  breakdown?: MockExamBreakdownInput[];
  diagnosisComplete?: boolean;
  evidenceComplete?: boolean;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    createMockExam(getDb(), access, input);
    revalidatePath("/mock-exams");
    revalidatePath("/analytics");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return actionFailure("mock-exams", error, "保存失败");
  }
}
