"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import {
  addNote,
  addTask,
  carryOverTasks,
  deleteNote,
  deleteTask,
  toggleTask,
  updateNote,
  updateTask,
} from "@/lib/repo/planner";
import { requireWorkspace } from "@/lib/request-auth";
import type { ActionResult } from "./day";

function failure(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
}

export async function addTaskAction(input: { day: string; title: string; subjectCode?: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    addTask(getDb(), access, input);
    revalidatePath(`/day/${input.day}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleTaskAction(input: { id: number; day: string; done: boolean }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    toggleTask(getDb(), access, input);
    revalidatePath(`/day/${input.day}`);
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
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    updateTask(getDb(), access, input);
    revalidatePath(`/day/${input.day}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteTaskAction(input: { id: number; day: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    deleteTask(getDb(), access, input.id);
    revalidatePath(`/day/${input.day}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function carryOverTasksAction(input: { fromDay: string; toDay: string }): Promise<ActionResult & { moved?: number }> {
  try {
    const access = await requireWorkspace();
    const moved = carryOverTasks(getDb(), access, input);
    revalidatePath(`/day/${input.fromDay}`);
    revalidatePath(`/day/${input.toDay}`);
    return { ok: true, moved };
  } catch (error) {
    return failure(error);
  }
}

export async function addNoteAction(input: { day: string; content: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    addNote(getDb(), access, input);
    revalidatePath(`/day/${input.day}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateNoteAction(input: { id: number; day: string; content: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    updateNote(getDb(), access, input);
    revalidatePath(`/day/${input.day}`);
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
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
