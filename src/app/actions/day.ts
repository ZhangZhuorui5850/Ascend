"use server";

import { revalidatePath } from "next/cache";
import { actionFailure } from "@/lib/action-failure";
import { getDb } from "@/lib/db";
import { DAY_FIELDS, updateDayEntry, type DayField } from "@/lib/repo/days";
import {
  createMistake,
  createReviewEvent,
  createStudySession,
  reattemptMistake,
  spreadReviewBacklog,
  undoReattempt,
  undoReviewEvent,
  type MistakeUndo,
  type ReviewUndo,
} from "@/lib/repo/reviews";
import { requireWorkspace } from "@/lib/request-auth";
import type { ReviewEvidenceInput } from "@/lib/review-evidence";

export type ActionResult = { ok: boolean; error?: string };
export type ScoreResult = ActionResult & { undo?: ReviewUndo };
export type ReattemptResult = ActionResult & { undo?: MistakeUndo };

function failure(error: unknown): ActionResult {
  return actionFailure("day", error);
}

function revalidateLearningEvidence(day: string): void {
  revalidatePath(`/day/${day}`);
  revalidatePath(`/kinetic/day/${day}`);
  revalidatePath("/");
  revalidatePath("/kinetic");
  revalidatePath("/analytics");
  revalidatePath("/kinetic/analytics");
  revalidatePath("/subjects");
  revalidatePath("/kinetic/subjects");
  revalidatePath("/subjects/[code]", "page");
  revalidatePath("/kinetic/subjects/[code]", "page");
}

/** 日记/计划等文本字段的自动保存；不触发整页刷新。 */
export async function saveDayEntry(date: string, fields: Partial<Record<DayField, string>>): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    const sanitized: Partial<Record<DayField, string>> = {};
    for (const field of DAY_FIELDS) {
      if (typeof fields[field] === "string") sanitized[field] = fields[field];
    }
    updateDayEntry(getDb(), access, date, sanitized);
    revalidatePath("/calendar");
    revalidatePath(`/kinetic/day/${date}`);
    revalidatePath("/kinetic/calendar");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function addStudySession(input: {
  day: string;
  title: string;
  durationMinutes?: number;
  subjectCode?: string;
  knowledgePointId?: string;
  output?: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    createStudySession(getDb(), access, input);
    revalidateLearningEvidence(input.day);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function addMistake(input: {
  day: string;
  title: string;
  cause?: string;
  causeCategory?: string;
  subjectCode?: string;
  knowledgePointId?: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    createMistake(getDb(), access, input);
    revalidateLearningEvidence(input.day);
    revalidatePath("/mistakes");
    revalidatePath("/kinetic/mistakes");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function scoreReview(input: {
  day: string;
  knowledgePointId: string;
  score: number;
  note?: string;
  operationId?: string;
} & ReviewEvidenceInput): Promise<ScoreResult> {
  try {
    const access = await requireWorkspace();
    const undo = createReviewEvent(getDb(), access, input);
    revalidateLearningEvidence(input.day);
    return { ok: true, undo };
  } catch (error) {
    return failure(error);
  }
}

export async function spreadBacklogAction(input: {
  day: string;
  dailyLimit: number;
  horizonDays?: number;
}): Promise<ActionResult & { moved?: number; throughDate?: string }> {
  try {
    const access = await requireWorkspace();
    const result = spreadReviewBacklog(getDb(), access, input);
    revalidatePath(`/day/${input.day}`);
    revalidatePath(`/kinetic/day/${input.day}`);
    revalidatePath("/");
    revalidatePath("/kinetic");
    return { ok: true, ...result };
  } catch (error) {
    return failure(error);
  }
}

export async function undoReviewAction(input: { day: string; undo: ReviewUndo }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    undoReviewEvent(getDb(), access, input.undo);
    revalidateLearningEvidence(input.day);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function reattemptMistakeAction(input: {
  id: number;
  day: string;
  score: number;
  operationId?: string;
} & ReviewEvidenceInput): Promise<ReattemptResult> {
  try {
    const access = await requireWorkspace();
    const result = reattemptMistake(getDb(), access, input);
    revalidateLearningEvidence(input.day);
    revalidatePath("/mistakes");
    revalidatePath("/kinetic/mistakes");
    return { ok: true, undo: result.undo ?? undefined };
  } catch (error) {
    return failure(error);
  }
}

export async function undoReattemptAction(input: { day: string; undo: MistakeUndo }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    undoReattempt(getDb(), access, input.undo);
    revalidateLearningEvidence(input.day);
    revalidatePath("/mistakes");
    revalidatePath("/kinetic/mistakes");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
