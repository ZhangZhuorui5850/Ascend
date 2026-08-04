"use server";

import { revalidatePath } from "next/cache";
import { actionFailure } from "@/lib/action-failure";
import { getDb } from "@/lib/db";
import {
  addNote,
  addTask,
  carryOverTasks,
  deleteNote,
  deleteTask,
  scheduleTask,
  toggleTask,
  updateNote,
  updateTask,
  type DayNote,
  type DayTask,
} from "@/lib/repo/planner";
import { requireWorkspace } from "@/lib/request-auth";
import type { ActionResult } from "./day";

function failure(error: unknown): ActionResult {
  return actionFailure("planner", error);
}

// 任务同时展示在当日工作台、首页与学习日历上，三处路由缓存一起失效。
// 注意不要用 refresh()：Next 16.2 在软导航到达的页面上会丢弃 refresh() 的 RSC 回流
// （库写成功但 UI 直到硬刷新才更新），revalidatePath 无此问题。
function revalidateTaskViews(...days: string[]) {
  for (const day of new Set(days)) {
    revalidatePath(`/day/${day}`);
    revalidatePath(`/kinetic/day/${day}`);
  }
  revalidatePath("/");
  revalidatePath("/kinetic");
  revalidatePath("/calendar");
  revalidatePath("/kinetic/calendar");
}

export async function addTaskAction(input: {
  day: string;
  title: string;
  subjectCode?: string;
  priority?: number;
  estimatedMinutes?: number;
  scheduledStart?: string | null;
  notes?: string;
  knowledgePointId?: string | null;
  activityType?: string;
  completionCriteria?: string;
  plannedVerificationMethod?: string;
  sourceType?: string;
  sourceId?: string | number;
  verificationMethod?: string;
}): Promise<ActionResult & { task?: DayTask }> {
  try {
    const access = await requireWorkspace();
    const task = addTask(getDb(), access, input);
    revalidateTaskViews(input.day);
    return { ok: true, task };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleTaskAction(input: {
  id: number;
  day: string;
  done: boolean;
  actualMinutes?: number | null;
  completionOutput?: string;
  verificationMethod?: string;
  verificationResult?: string;
  verificationOutcome?: "" | "improved" | "unchanged" | "regressed" | "unknown";
  recordAsStudy?: boolean;
  scheduleRetestAfterDays?: number;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    const task = toggleTask(getDb(), access, input);
    // 完成态由页面客户端状态即时呈现；这里仍失效相关路由缓存，避免 30s 内切页看到旧完成数
    revalidateTaskViews(input.day);
    if (input.recordAsStudy) {
      revalidatePath("/analytics");
      revalidatePath("/subjects");
      if (task.subjectCode) revalidatePath(`/subjects/${task.subjectCode}`);
    }
    if (task.retestDay) revalidateTaskViews(task.retestDay);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateTaskAction(input: {
  id: number;
  day: string;
  title?: string;
  subjectCode?: string | null;
  priority?: number;
  estimatedMinutes?: number;
  scheduledStart?: string | null;
  notes?: string;
  knowledgePointId?: string | null;
  activityType?: string;
  completionCriteria?: string;
  plannedVerificationMethod?: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    updateTask(getDb(), access, input);
    revalidateTaskViews(input.day);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function scheduleTaskAction(input: {
  id: number;
  previousDay: string;
  day: string;
  scheduledStart?: string | null;
  estimatedMinutes?: number;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    scheduleTask(getDb(), access, input);
    revalidateTaskViews(input.previousDay, input.day);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteTaskAction(input: { id: number; day: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    deleteTask(getDb(), access, input.id);
    revalidateTaskViews(input.day);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function carryOverTasksAction(input: { fromDay: string; toDay: string }): Promise<ActionResult & { moved?: number }> {
  try {
    const access = await requireWorkspace();
    const moved = carryOverTasks(getDb(), access, input);
    revalidateTaskViews(input.fromDay, input.toDay);
    return { ok: true, moved };
  } catch (error) {
    return failure(error);
  }
}

export async function addNoteAction(input: { day: string; content: string }): Promise<ActionResult & { note?: DayNote }> {
  try {
    const access = await requireWorkspace();
    const note = addNote(getDb(), access, input);
    revalidatePath(`/day/${input.day}`);
    revalidatePath(`/kinetic/day/${input.day}`);
    return { ok: true, note };
  } catch (error) {
    return failure(error);
  }
}

export async function updateNoteAction(input: { id: number; day: string; content: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    updateNote(getDb(), access, input);
    revalidatePath(`/day/${input.day}`);
    revalidatePath(`/kinetic/day/${input.day}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteNoteAction(input: { id: number; day: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    deleteNote(getDb(), access, input.id);
    revalidatePath(`/day/${input.day}`);
    revalidatePath(`/kinetic/day/${input.day}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
