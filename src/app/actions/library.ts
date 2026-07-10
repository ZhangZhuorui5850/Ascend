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
import { requireWorkspace } from "@/lib/request-auth";
import type { ActionResult } from "./day";

function failure(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
}

function revalidateLibrary() {
  revalidatePath("/assets");
}

export async function createFolderAction(input: { parentPath: string; name: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    createFolder(getDb(), access, input);
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function renameFolderAction(input: { path: string; name: string }): Promise<ActionResult & { path?: string }> {
  try {
    const access = await requireWorkspace();
    const path = renameFolder(getDb(), access, input);
    revalidateLibrary();
    return { ok: true, path };
  } catch (error) {
    return failure(error);
  }
}

export async function moveFolderAction(input: { path: string; newParentPath: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    moveFolder(getDb(), access, input);
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteFolderAction(path: string): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    deleteFolder(getDb(), access, path);
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function moveAssetAction(input: { assetId: number; folderPath: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    moveAsset(getDb(), access, input);
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function renameAssetAction(input: { assetId: number; name: string }): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    renameAsset(getDb(), access, input);
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteAssetAction(assetId: number): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    deleteAsset(getDb(), access, assetId);
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
