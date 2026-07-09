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
import { requireSession } from "@/lib/request-auth";
import type { ActionResult } from "./day";

function failure(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
}

export async function addTaskAction(input: { day: string; title: string; subjectCode?: string }): Promise<ActionResult> {
  try {
    await requireSession();
    addTask(getDb(), input);
    revalidatePath(`/day/${input.day}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleTaskAction(input: { id: number; day: string; done: boolean }): Promise<ActionResult> {
  try {
    await requireSession();
    toggleTask(getDb(), input);
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
    await requireSession();
    updateTask(getDb(), input);
    revalidatePath(`/day/${input.day}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteTaskAction(input: { id: number; day: string }): Promise<ActionResult> {
  try {
    await requireSession();
    deleteTask(getDb(), input.id);
    revalidatePath(`/day/${input.day}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function carryOverTasksAction(input: { fromDay: string; toDay: string }): Promise<ActionResult & { moved?: number }> {
  try {
    await requireSession();
    const moved = carryOverTasks(getDb(), input);
    revalidatePath(`/day/${input.fromDay}`);
    revalidatePath(`/day/${input.toDay}`);
    return { ok: true, moved };
  } catch (error) {
    return failure(error);
  }
}

export async function addNoteAction(input: { day: string; content: string }): Promise<ActionResult> {
  try {
    await requireSession();
    addNote(getDb(), input);
    revalidatePath(`/day/${input.day}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateNoteAction(input: { id: number; day: string; content: string }): Promise<ActionResult> {
  try {
    await requireSession();
    updateNote(getDb(), input);
    revalidatePath(`/day/${input.day}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteNoteAction(input: { id: number; day: string }): Promise<ActionResult> {
  try {
    await requireSession();
    deleteNote(getDb(), input.id);
    revalidatePath(`/day/${input.day}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
