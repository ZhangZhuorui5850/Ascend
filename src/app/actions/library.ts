"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import {
  createFolder,
  deleteAsset,
  deleteFolder,
  moveAsset,
  moveFolder,
  renameAsset,
  renameFolder,
} from "@/lib/repo/library";
import { requireSession } from "@/lib/request-auth";
import type { ActionResult } from "./day";

function failure(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
}

function revalidateLibrary() {
  revalidatePath("/assets");
}

export async function createFolderAction(input: { parentPath: string; name: string }): Promise<ActionResult> {
  try {
    await requireSession();
    createFolder(getDb(), input);
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function renameFolderAction(input: { path: string; name: string }): Promise<ActionResult & { path?: string }> {
  try {
    await requireSession();
    const path = renameFolder(getDb(), input);
    revalidateLibrary();
    return { ok: true, path };
  } catch (error) {
    return failure(error);
  }
}

export async function moveFolderAction(input: { path: string; newParentPath: string }): Promise<ActionResult> {
  try {
    await requireSession();
    moveFolder(getDb(), input);
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteFolderAction(path: string): Promise<ActionResult> {
  try {
    await requireSession();
    deleteFolder(getDb(), path);
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function moveAssetAction(input: { assetId: number; folderPath: string }): Promise<ActionResult> {
  try {
    await requireSession();
    moveAsset(getDb(), input);
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function renameAssetAction(input: { assetId: number; name: string }): Promise<ActionResult> {
  try {
    await requireSession();
    renameAsset(getDb(), input);
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteAssetAction(assetId: number): Promise<ActionResult> {
  try {
    await requireSession();
    deleteAsset(getDb(), assetId);
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
