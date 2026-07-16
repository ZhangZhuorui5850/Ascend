"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { createMockExam, type MockExamBreakdown } from "@/lib/repo/mock-exams";
import { requireWorkspace } from "@/lib/request-auth";
import type { ActionResult } from "./day";

export async function createMockExamAction(input: {
  day: string;
  name: string;
  subjectCode?: string;
  score: number;
  maxScore: number;
  durationMinutes?: number;
  notes?: string;
  breakdown?: MockExamBreakdown[];
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    createMockExam(getDb(), access, input);
    revalidatePath("/mock-exams");
    revalidatePath("/analytics");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "保存失败" };
  }
}
