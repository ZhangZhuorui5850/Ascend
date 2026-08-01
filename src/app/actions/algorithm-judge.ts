"use server";

import { revalidatePath } from "next/cache";
import { actionFailure } from "@/lib/action-failure";
import { loadJudgeCodeKey, loadJudgeCodeKeys } from "@/lib/algorithm-code-crypto";
import { getDb } from "@/lib/db";
import type { JudgeLanguage } from "@/lib/judge-gateway";
import {
  refreshAlgorithmSubmission,
  submitAlgorithmCode,
} from "@/lib/judge-runtime";
import {
  getAlgorithmDraft,
  saveAlgorithmDraft,
  type AlgorithmSubmission,
} from "@/lib/repo/algorithm-submissions";
import {
  getAlgorithmLearningState,
  resolveAlgorithmErrorCase,
  saveAlgorithmReflection,
  type AlgorithmLearningState,
} from "@/lib/repo/algorithm-learning";
import { revealAlgorithmHint, type AlgorithmHint } from "@/lib/repo/algorithm-hints";
import type { AlgorithmReviewKind } from "@/lib/repo/algorithms";
import { requireWorkspace } from "@/lib/request-auth";

type JudgeActionResult = {
  ok: boolean;
  error?: string;
  submission?: AlgorithmSubmission;
};

function revalidateJudgeViews(day?: string): void {
  revalidatePath("/practice/algorithms");
  revalidatePath("/");
  revalidatePath("/analytics");
  if (day) revalidatePath(`/day/${day}`);
}

export async function saveAlgorithmDraftAction(input: {
  problemId: number;
  language: JudgeLanguage;
  sourceCode: string;
}): Promise<{ ok: boolean; error?: string; savedAt?: string }> {
  try {
    const access = await requireWorkspace();
    const key = requireCodeKey();
    saveAlgorithmDraft(getDb(), access, input, key);
    return { ok: true, savedAt: new Date().toISOString() };
  } catch (error) {
    return actionFailure("algorithm_judge", error, "代码草稿保存失败");
  }
}

export async function getAlgorithmDraftAction(input: {
  problemId: number;
  language: JudgeLanguage;
}): Promise<{ ok: boolean; error?: string; sourceCode?: string; updatedAt?: string }> {
  try {
    const access = await requireWorkspace();
    requireCodeKey();
    const draft = getAlgorithmDraft(getDb(), access, input, loadJudgeCodeKeys());
    return {
      ok: true,
      sourceCode: draft?.sourceCode,
      updatedAt: draft?.updatedAt,
    };
  } catch (error) {
    return actionFailure("algorithm_judge", error, "代码草稿读取失败");
  }
}

export async function revealAlgorithmHintAction(input: {
  problemId: number;
  sessionId: string;
  level: number;
}): Promise<{ ok: boolean; error?: string; hint?: AlgorithmHint }> {
  try {
    const access = await requireWorkspace();
    const hint = revealAlgorithmHint(getDb(), access, input);
    revalidatePath("/practice/algorithms");
    return { ok: true, hint };
  } catch (error) {
    return actionFailure("algorithm_judge", error, "提示读取失败");
  }
}

export async function submitAlgorithmCodeAction(input: {
  operationId: string;
  sessionId: string;
  problemId: number;
  day: string;
  language: JudgeLanguage;
  sourceCode: string;
  planText?: string;
  preConfidence?: number | null;
  maxHintLevel?: number;
  reviewKind?: AlgorithmReviewKind;
  activeSeconds?: number;
  submissionKind?: "sample" | "formal";
  sourceTaskId?: number | null;
  transferSourceProblemId?: number | null;
}): Promise<JudgeActionResult> {
  try {
    const access = await requireWorkspace();
    const submission = await submitAlgorithmCode(getDb(), access, input);
    revalidateJudgeViews(input.day);
    return { ok: true, submission };
  } catch (error) {
    return actionFailure("algorithm_judge", error, "正式提交失败");
  }
}

export async function refreshAlgorithmSubmissionAction(input: {
  submissionId: number;
  day: string;
}): Promise<JudgeActionResult> {
  try {
    const access = await requireWorkspace();
    const submission = await refreshAlgorithmSubmission(getDb(), access, input.submissionId);
    revalidateJudgeViews(input.day);
    return { ok: true, submission };
  } catch (error) {
    return actionFailure("algorithm_judge", error, "评测状态刷新失败");
  }
}

export async function getAlgorithmLearningStateAction(input: {
  attemptId: number;
}): Promise<{ ok: boolean; error?: string; state?: AlgorithmLearningState }> {
  try {
    const access = await requireWorkspace();
    return {
      ok: true,
      state: getAlgorithmLearningState(getDb(), access, input.attemptId),
    };
  } catch (error) {
    return actionFailure("algorithm_judge", error, "训练复盘读取失败");
  }
}

export async function saveAlgorithmReflectionAction(input: {
  attemptId: number;
  errorCategory?: string;
  correctionRule?: string;
  complexityTime?: string;
  complexitySpace?: string;
  takeaway?: string;
}): Promise<{ ok: boolean; error?: string; state?: AlgorithmLearningState }> {
  try {
    const access = await requireWorkspace();
    const state = saveAlgorithmReflection(getDb(), access, input);
    revalidateJudgeViews();
    revalidatePath("/mistakes");
    return { ok: true, state };
  } catch (error) {
    return actionFailure("algorithm_judge", error, "训练复盘保存失败");
  }
}

export async function resolveAlgorithmErrorCaseAction(input: {
  attemptId: number;
  decision: "confirm" | "dismiss";
}): Promise<{ ok: boolean; error?: string; state?: AlgorithmLearningState }> {
  try {
    const access = await requireWorkspace();
    const state = resolveAlgorithmErrorCase(getDb(), access, input);
    revalidateJudgeViews();
    revalidatePath("/mistakes");
    return { ok: true, state };
  } catch (error) {
    return actionFailure("algorithm_judge", error, "算法错误案例处理失败");
  }
}

function requireCodeKey() {
  const key = loadJudgeCodeKey();
  if (!key) throw new Error("管理员尚未配置代码加密密钥");
  return key;
}
