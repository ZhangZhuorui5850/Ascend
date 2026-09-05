"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { actionFailure } from "@/lib/action-failure";
import { scanAlgorithmDirectory } from "@/lib/algorithm-import";
import { shiftDateKey, todayKey } from "@/lib/dates";
import { finalizeAlgorithmTrainingResult } from "@/lib/application/algorithms/finalize-training-result";
import { recordAlgorithmAttemptCommand } from "@/lib/application/algorithms/record-attempt";
import { getDb } from "@/lib/db";
import { importAlgorithmScan } from "@/lib/repo/algorithm-import";
import { approveAlgorithmDevicePairing } from "@/lib/repo/algorithm-device-pairings";
import { createAlgorithmDevice, revokeAlgorithmDevice } from "@/lib/repo/algorithm-devices";
import {
  createAlgorithmLibraryFolder,
  deleteAlgorithmLibraryFolder,
  moveAlgorithmLibraryFolder,
  renameAlgorithmLibraryFolder,
  reorderAlgorithmLibraryFolder,
} from "@/lib/repo/algorithm-library";
import { createAlgorithmProblem, deleteAlgorithmProblems, getAlgorithmProblemDetail, updateAlgorithmProblemDetails, type AlgorithmProblem } from "@/lib/repo/algorithms";
import { setAlgorithmCurriculumChapter } from "@/lib/repo/algorithm-curriculum";
import {
  continueAlgorithmPlanTomorrow,
  finishDueAlgorithmReview,
  moveAlgorithmProblemsToFolder,
  removeAlgorithmPlan,
  reorderAlgorithmPlans,
  rescheduleAlgorithmPlan,
  rescheduleAlgorithmPlans,
  scheduleAlgorithmProblems,
  setAlgorithmCourseMemberships,
} from "@/lib/repo/algorithm-training";
import { requireWorkspace } from "@/lib/request-auth";
import type { ActionResult } from "./day";

function revalidateAlgorithmViews(day?: string): void {
  revalidatePath("/practice/algorithms");
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/assets");
  if (day) {
    revalidatePath(`/day/${day}`);
    revalidatePath("/calendar");
  }
}

export async function getAlgorithmProblemDetailAction(problemId: number): Promise<ActionResult & { problem?: AlgorithmProblem }> {
  try {
    const access = await requireWorkspace();
    return { ok: true, problem: getAlgorithmProblemDetail(getDb(), access, problemId) };
  } catch (error) {
    return actionFailure("algorithms", error, "题目详情加载失败");
  }
}

export async function setAlgorithmCurriculumChapterAction(input: {
  problemIds: number[];
  chapterKey: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    setAlgorithmCurriculumChapter(getDb(), access, input);
    revalidateAlgorithmViews();
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "课程章节保存失败");
  }
}

export async function scheduleAlgorithmProblemsAction(input: {
  problemIds: number[];
  day: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    scheduleAlgorithmProblems(getDb(), access, input);
    revalidateAlgorithmViews(input.day);
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "加入训练计划失败");
  }
}

export async function removeAlgorithmPlanAction(input: {
  taskId: string;
  expectedVersion: number;
  day: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    removeAlgorithmPlan(getDb(), access, input);
    revalidateAlgorithmViews(input.day);
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "移出训练计划失败");
  }
}

export async function finishAlgorithmPlanAction(input: {
  taskId: string;
  expectedVersion: number;
  problemId: number;
  day: string;
  choice: "review" | "tomorrow" | "stop-review";
  attemptDayMode?: "now" | "backfill";
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    if (input.choice === "tomorrow") {
      continueAlgorithmPlanTomorrow(getDb(), access, input);
    } else {
      finalizeAlgorithmTrainingResult(getDb(), access, {
        operationId: `algorithm-plan-complete:${input.taskId}:v${input.expectedVersion}`,
        problemId: input.problemId,
        attemptDay: input.attemptDayMode === "backfill" ? input.day : todayKey(),
        verdict: "AC",
        maxHintLevel: 0,
        reviewChoice: input.choice === "review" ? "schedule" : "stop",
        plan: {
          taskId: input.taskId,
          expectedVersion: input.expectedVersion,
          disposition: "complete",
        },
      });
    }
    revalidateAlgorithmViews(input.day);
    revalidateAlgorithmViews(shiftDateKey(input.day, 1));
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "训练计划更新失败");
  }
}

export async function rescheduleAlgorithmPlanAction(input: {
  taskId: string;
  expectedVersion: number;
  fromDay: string;
  targetDay: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    rescheduleAlgorithmPlan(getDb(), access, input);
    revalidateAlgorithmViews(input.fromDay);
    revalidateAlgorithmViews(input.targetDay);
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "训练计划改期失败");
  }
}

export async function rescheduleAlgorithmPlansAction(input: {
  plans: Array<{ taskId: string; expectedVersion: number }>;
  fromDays: string[];
  targetDay: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    rescheduleAlgorithmPlans(getDb(), access, input);
    for (const day of new Set([...input.fromDays, input.targetDay])) revalidateAlgorithmViews(day);
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "训练计划批量改期失败");
  }
}

export async function finalizeAlgorithmTrainingResultAction(input: {
  operationId: string;
  problemId: number;
  attemptDayMode: "now" | "backfill";
  backfillDay?: string;
  verdict: string;
  durationMinutes?: number;
  maxHintLevel?: number;
  errorCategory?: string;
  reflection?: string;
  reviewChoice?: "schedule" | "stop" | "unchanged";
  plan?: { taskId: string; expectedVersion: number; disposition: "complete" | "keep" | "reschedule"; targetDay?: string };
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    const attemptDay = input.attemptDayMode === "backfill" ? String(input.backfillDay || "") : todayKey();
    finalizeAlgorithmTrainingResult(getDb(), access, { ...input, attemptDay });
    revalidateAlgorithmViews(attemptDay);
    if (input.plan?.targetDay) revalidateAlgorithmViews(input.plan.targetDay);
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "训练结果保存失败");
  }
}

export async function finishDueAlgorithmReviewAction(input: {
  problemId: number;
  day: string;
  choice: "review" | "tomorrow" | "stop-review";
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    finishDueAlgorithmReview(getDb(), access, input);
    revalidateAlgorithmViews(input.day);
    revalidateAlgorithmViews(shiftDateKey(input.day, 1));
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "复习计划更新失败");
  }
}

export async function reorderAlgorithmPlansAction(input: {
  day: string;
  taskIds: string[];
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    reorderAlgorithmPlans(getDb(), access, input);
    revalidateAlgorithmViews(input.day);
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "训练排序保存失败");
  }
}

export async function setAlgorithmCourseAction(input: {
  problemIds: number[];
  courseName: string;
  stageKey: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    setAlgorithmCourseMemberships(getDb(), access, input);
    revalidateAlgorithmViews();
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "课程属性保存失败");
  }
}

export async function moveAlgorithmProblemsAction(input: {
  problemIds: number[];
  folderId: string | null;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    moveAlgorithmProblemsToFolder(getDb(), access, input);
    revalidateAlgorithmViews();
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "移动题目失败");
  }
}

export async function createAlgorithmFolderAction(input: {
  name: string;
  parentId?: string | null;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    createAlgorithmLibraryFolder(getDb(), access, input);
    revalidateAlgorithmViews();
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "文件夹创建失败");
  }
}

export async function renameAlgorithmFolderAction(input: { folderId: string; name: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    renameAlgorithmLibraryFolder(getDb(), access, input.folderId, input.name);
    revalidateAlgorithmViews();
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "文件夹重命名失败");
  }
}

export async function deleteAlgorithmFolderAction(input: {
  folderId: string;
  promoteContents?: boolean;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    deleteAlgorithmLibraryFolder(getDb(), access, input.folderId, { promoteContents: input.promoteContents });
    revalidateAlgorithmViews();
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "文件夹删除失败");
  }
}

export async function moveAlgorithmFolderAction(input: {
  folderId: string;
  targetParentId?: string | null;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    moveAlgorithmLibraryFolder(getDb(), access, input);
    revalidateAlgorithmViews();
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "文件夹移动失败");
  }
}

export async function reorderAlgorithmFolderAction(input: {
  folderId: string;
  direction: "up" | "down" | "first";
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    reorderAlgorithmLibraryFolder(getDb(), access, input);
    revalidateAlgorithmViews();
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "文件夹排序失败");
  }
}

export async function createAlgorithmProblemAction(input: {
  sourceUrl?: string;
  title: string;
  externalProblemId?: string;
  difficultyBand?: string;
  tags?: string[];
  notes?: string;
  statementMarkdown?: string;
  inputSpecification?: string;
  outputSpecification?: string;
  examples?: Array<{ input: string; output: string; explanation?: string }>;
  timeLimitMs?: number;
  memoryLimitKb?: number;
}): Promise<ActionResult & { problemId?: number }> {
  try {
    const access = await requireWorkspace();
    const problem = createAlgorithmProblem(getDb(), access, input);
    revalidateAlgorithmViews();
    return { ok: true, problemId: problem.id };
  } catch (error) {
    return actionFailure("algorithms", error, "题目保存失败");
  }
}

export async function deleteAlgorithmProblemsAction(input: { problemIds: number[] }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    deleteAlgorithmProblems(getDb(), access, input);
    revalidateAlgorithmViews();
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "题目删除失败");
  }
}

export async function updateAlgorithmProblemAction(input: {
  problemId: number;
  title: string;
  difficultyBand?: string;
  tags?: string[];
  notes?: string;
  materialStatus?: string;
  priorityBand?: string;
  phaseKey?: string;
  nextReview?: string | null;
  sourceUrl?: string;
  externalProblemId?: string;
  statementMarkdown?: string;
  inputSpecification?: string;
  outputSpecification?: string;
  examples?: Array<{ input: string; output: string; explanation?: string }>;
  timeLimitMs?: number;
  memoryLimitKb?: number;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    updateAlgorithmProblemDetails(getDb(), access, input.problemId, input);
    revalidateAlgorithmViews();
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "题目资料保存失败");
  }
}

export async function recordAlgorithmAttemptAction(input: {
  operationId?: string;
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
    recordAlgorithmAttemptCommand(getDb(), access, {
      ...input,
      operationId: input.operationId ?? randomUUID(),
    });
    revalidateAlgorithmViews(input.day);
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "训练结果保存失败");
  }
}

export async function previewAlgorithmImportAction(input: { rootPath: string }): Promise<
  ActionResult & {
    preview?: {
      rootPath: string;
      rootName: string;
      total: number;
      warningCount: number;
      phases: Array<{ key: string; count: number }>;
      statuses: Array<{ key: string; count: number }>;
      items: Array<{
        sourcePath: string;
        title: string;
        phase: string;
        priority: string;
        status: string;
        warnings: string[];
      }>;
    };
  }
> {
  try {
    await requireWorkspace();
    const scan = scanAlgorithmDirectory(input.rootPath);
    return {
      ok: true,
      preview: {
        rootPath: scan.rootPath,
        rootName: scan.rootName,
        total: scan.exercises.length,
        warningCount: scan.warningCount,
        phases: countBy(scan.exercises.map((item) => item.phase)),
        statuses: countBy(scan.exercises.map((item) => item.materialStatus)),
        items: scan.exercises.slice(0, 120).map((item) => ({
          sourcePath: item.sourcePath,
          title: item.title,
          phase: item.phase,
          priority: item.priority,
          status: item.materialStatus,
          warnings: item.warnings,
        })),
      },
    };
  } catch (error) {
    return actionFailure("algorithms", error, "题库扫描失败");
  }
}

export async function importAlgorithmDirectoryAction(input: { rootPath: string }): Promise<
  ActionResult & {
    result?: {
      total: number;
      created: number;
      updated: number;
      unchanged: number;
      warningCount: number;
      collectionCount: number;
    };
  }
> {
  try {
    const access = await requireWorkspace();
    const result = importAlgorithmScan(getDb(), access, scanAlgorithmDirectory(input.rootPath));
    revalidateAlgorithmViews();
    return { ok: true, result };
  } catch (error) {
    return actionFailure("algorithms", error, "题库导入失败");
  }
}

function countBy(values: string[]): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].map(([key, count]) => ({ key, count }));
}

export async function createAlgorithmDeviceAction(input: {
  name: string;
  platform?: string;
  localRoot?: string;
}): Promise<ActionResult & { token?: string }> {
  try {
    const access = await requireWorkspace();
    const created = createAlgorithmDevice(getDb(), access, input);
    revalidatePath("/practice/algorithms");
    return { ok: true, token: created.token };
  } catch (error) {
    return actionFailure("algorithms", error, "VS Code 设备连接失败");
  }
}

export async function revokeAlgorithmDeviceAction(deviceId: string): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    revokeAlgorithmDevice(getDb(), access, deviceId);
    revalidatePath("/practice/algorithms");
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "VS Code 设备撤销失败");
  }
}

export async function approveAlgorithmDevicePairingAction(input: { userCode: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    approveAlgorithmDevicePairing(getDb(), access, input.userCode);
    revalidatePath("/practice/algorithms/connect");
    revalidatePath("/practice/algorithms");
    return { ok: true };
  } catch (error) {
    return actionFailure("algorithms", error, "VS Code 配对授权失败");
  }
}
