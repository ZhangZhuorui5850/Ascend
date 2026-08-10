"use server";

import { revalidatePath } from "next/cache";
import { actionFailure } from "@/lib/action-failure";
import { getDb } from "@/lib/db";
import {
  addNote,
  deleteNote,
  updateNote,
  type DayNote,
} from "@/lib/repo/planner";
import { requireWorkspace } from "@/lib/request-auth";
import type { ActionResult } from "./day";

function failure(error: unknown): ActionResult {
  return actionFailure("planner", error);
}

export async function addNoteAction(input: { day: string; content: string }): Promise<ActionResult & { note?: DayNote }> {
  try {
    const access = await requireWorkspace();
    const note = addNote(getDb(), access, input);
    revalidatePath(`/day/${input.day}`);
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
