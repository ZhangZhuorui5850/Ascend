"use server";

import { refresh } from "next/cache";
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
  return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
}

export async function addTaskAction(input: {
  day: string;
  title: string;
  subjectCode?: string;
  priority?: number;
  estimatedMinutes?: number;
  scheduledStart?: string | null;
  notes?: string;
}): Promise<ActionResult & { task?: DayTask }> {
  try {
    const access = await requireWorkspace();
    const task = addTask(getDb(), access, input);
    refresh();
    return { ok: true, task };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleTaskAction(input: { id: number; day: string; done: boolean }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    toggleTask(getDb(), access, input);
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
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    updateTask(getDb(), access, input);
    refresh();
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
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteTaskAction(input: { id: number; day: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    deleteTask(getDb(), access, input.id);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function carryOverTasksAction(input: { fromDay: string; toDay: string }): Promise<ActionResult & { moved?: number }> {
  try {
    const access = await requireWorkspace();
    const moved = carryOverTasks(getDb(), access, input);
    refresh();
    return { ok: true, moved };
  } catch (error) {
    return failure(error);
  }
}

export async function addNoteAction(input: { day: string; content: string }): Promise<ActionResult & { note?: DayNote }> {
  try {
    const access = await requireWorkspace();
    const note = addNote(getDb(), access, input);
    refresh();
    return { ok: true, note };
  } catch (error) {
    return failure(error);
  }
}

export async function updateNoteAction(input: { id: number; day: string; content: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    updateNote(getDb(), access, input);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteNoteAction(input: { id: number; day: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    deleteNote(getDb(), access, input.id);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
