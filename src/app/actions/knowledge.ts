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
  moveChapterToPosition,
  movePointToPosition,
  renameChapter,
  renameSubject,
  reorderPoints,
  reparentChapter,
  updatePoint,
  type PointDetail,
  type SubjectTrack,
} from "@/lib/repo/knowledge";
import { requireWorkspace } from "@/lib/request-auth";
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
    const access = await requireWorkspace();
    createSubject(getDb(), access, input);
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
    const access = await requireWorkspace();
    renameSubject(getDb(), access, input);
    revalidateKnowledge(input.code);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteSubjectAction(code: string): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    deleteSubject(getDb(), access, code);
    revalidateKnowledge(code);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createChapterAction(input: {
  subjectCode: string;
  title: string;
  parentId?: string | null;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    createChapter(getDb(), access, input);
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function reparentChapterAction(input: {
  id: string;
  parentId: string | null;
  subjectCode: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    reparentChapter(getDb(), access, { id: input.id, parentId: input.parentId });
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function renameChapterAction(input: { id: string; title: string; subjectCode: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    renameChapter(getDb(), access, input);
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function moveChapterAction(input: { id: string; direction: "up" | "down"; subjectCode: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    moveChapter(getDb(), access, input);
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteChapterAction(input: { id: string; subjectCode: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    deleteChapter(getDb(), access, input.id);
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
    const access = await requireWorkspace();
    createPoint(getDb(), access, input);
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
  mastery?: number;
  subjectCode: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    updatePoint(getDb(), access, input);
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deletePointAction(input: { id: string; subjectCode: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    deletePoint(getDb(), access, input.id);
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function reorderPointsAction(input: {
  chapterId: string;
  subjectCode: string;
  orderedIds: string[];
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    reorderPoints(getDb(), access, { chapterId: input.chapterId, orderedIds: input.orderedIds });
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function movePointAction(input: {
  pointId: string;
  targetChapterId: string;
  index: number;
  subjectCode: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    movePointToPosition(getDb(), access, {
      pointId: input.pointId,
      targetChapterId: input.targetChapterId,
      index: input.index,
    });
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function moveChapterToPositionAction(input: {
  id: string;
  parentId: string | null;
  index: number;
  subjectCode: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    moveChapterToPosition(getDb(), access, {
      id: input.id,
      parentId: input.parentId,
      index: input.index,
    });
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function getPointDetailAction(pointId: string): Promise<(ActionResult & { detail?: PointDetail })> {
  try {
    const access = await requireWorkspace();
    return { ok: true, detail: getPointDetail(getDb(), access, pointId) };
  } catch (error) {
    return failure(error);
  }
}
