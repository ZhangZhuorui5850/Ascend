"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import {
  createChapter,
  createPoint,
  createSubject,
  deleteChapter,
  deletePoint,
  deleteSubject,
  getPointDetail,
  moveChapter,
  renameChapter,
  renameSubject,
  updatePoint,
  type PointDetail,
  type SubjectTrack,
} from "@/lib/repo/knowledge";
import { requireSession } from "@/lib/request-auth";
import type { Tier } from "@/lib/types";
import type { ActionResult } from "./day";

function failure(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
}

function revalidateKnowledge(subjectCode?: string) {
  revalidatePath("/subjects");
  if (subjectCode) revalidatePath(`/subjects/${subjectCode}`);
  // 收纳面板的层级数据由根布局提供
  revalidatePath("/", "layout");
}

export async function createSubjectAction(input: {
  code: string;
  name: string;
  description?: string;
  track?: SubjectTrack;
}): Promise<ActionResult> {
  try {
    await requireSession();
    createSubject(getDb(), input);
    revalidateKnowledge(input.code);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function renameSubjectAction(input: {
  code: string;
  name: string;
  description?: string;
  track?: SubjectTrack;
}): Promise<ActionResult> {
  try {
    await requireSession();
    renameSubject(getDb(), input);
    revalidateKnowledge(input.code);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteSubjectAction(code: string): Promise<ActionResult> {
  try {
    await requireSession();
    deleteSubject(getDb(), code);
    revalidateKnowledge(code);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createChapterAction(input: { subjectCode: string; title: string }): Promise<ActionResult> {
  try {
    await requireSession();
    createChapter(getDb(), input);
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function renameChapterAction(input: { id: string; title: string; subjectCode: string }): Promise<ActionResult> {
  try {
    await requireSession();
    renameChapter(getDb(), input);
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function moveChapterAction(input: { id: string; direction: "up" | "down"; subjectCode: string }): Promise<ActionResult> {
  try {
    await requireSession();
    moveChapter(getDb(), input);
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteChapterAction(input: { id: string; subjectCode: string }): Promise<ActionResult> {
  try {
    await requireSession();
    deleteChapter(getDb(), input.id);
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createPointAction(input: {
  chapterId: string;
  title: string;
  tier?: Tier;
  exam?: boolean;
  subjectCode: string;
}): Promise<ActionResult> {
  try {
    await requireSession();
    createPoint(getDb(), input);
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updatePointAction(input: {
  id: string;
  title?: string;
  tier?: Tier;
  exam?: boolean;
  subjectCode: string;
}): Promise<ActionResult> {
  try {
    await requireSession();
    updatePoint(getDb(), input);
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deletePointAction(input: { id: string; subjectCode: string }): Promise<ActionResult> {
  try {
    await requireSession();
    deletePoint(getDb(), input.id);
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function getPointDetailAction(pointId: string): Promise<(ActionResult & { detail?: PointDetail })> {
  try {
    await requireSession();
    return { ok: true, detail: getPointDetail(getDb(), pointId) };
  } catch (error) {
    return failure(error);
  }
}
