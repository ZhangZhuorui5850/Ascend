"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import type { PlannerLabel, TaskList } from "@/lib/planner/types";
import { createPlannerLabel } from "@/lib/repo/planner-labels";
import { createTaskList } from "@/lib/repo/planner-lists";
import { requireWorkspace } from "@/lib/request-auth";

export async function createTaskListAction(input: {
  name: string;
  colorToken?: string;
  icon?: string;
}): Promise<{ ok: boolean; entity?: TaskList; error?: string }> {
  try {
    const access = await requireWorkspace();
    const entity = createTaskList(getDb(), access, {
      name: input.name,
      colorToken: input.colorToken ?? "summit-blue",
      icon: input.icon ?? "ListTodo",
    });
    revalidatePath("/tasks");
    return { ok: true, entity };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "创建清单失败" };
  }
}

export async function createPlannerLabelAction(input: {
  name: string;
  colorToken?: string;
}): Promise<{ ok: boolean; entity?: PlannerLabel; error?: string }> {
  try {
    const access = await requireWorkspace();
    const entity = createPlannerLabel(getDb(), access, {
      name: input.name,
      colorToken: input.colorToken ?? "summit-blue",
    });
    revalidatePath("/tasks");
    return { ok: true, entity };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "创建标签失败" };
  }
}
