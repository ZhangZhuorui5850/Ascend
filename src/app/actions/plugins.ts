"use server";

import { revalidatePath } from "next/cache";
import { actionFailure } from "@/lib/action-failure";
import { getDb } from "@/lib/db";
import {
  requestAlgorithmPilot,
  type AlgorithmPilotEnrollment,
} from "@/lib/repo/algorithm-pilot";
import { savePluginOrder, setPluginEnabled } from "@/lib/repo/plugins";
import { requireWorkspace } from "@/lib/request-auth";
import type { ActionResult } from "./day";

function revalidatePluginSurfaces(): void {
  revalidatePath("/", "layout");
  revalidatePath("/extensions");
  revalidatePath("/settings");
}

export async function setPluginEnabledAction(input: {
  pluginId: string;
  enabled: boolean;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    const db = getDb();
    setPluginEnabled(db, access, input.pluginId, input.enabled);
    revalidatePluginSurfaces();
    return { ok: true };
  } catch (error) {
    return actionFailure("plugins", error, "扩展设置保存失败");
  }
}

export async function savePluginOrderAction(input: {
  pluginIds: string[];
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    savePluginOrder(getDb(), access, input.pluginIds);
    revalidatePluginSurfaces();
    return { ok: true };
  } catch (error) {
    return actionFailure("plugins", error, "扩展排序保存失败");
  }
}

export async function requestAlgorithmPilotAction(input: {
  consent: boolean;
}): Promise<ActionResult & { enrollment?: AlgorithmPilotEnrollment }> {
  try {
    const access = await requireWorkspace();
    const enrollment = requestAlgorithmPilot(getDb(), access, input);
    revalidatePluginSurfaces();
    revalidatePath("/practice/algorithms");
    return { ok: true, enrollment };
  } catch (error) {
    return actionFailure("plugins", error, "算法评测试点申请失败");
  }
}
