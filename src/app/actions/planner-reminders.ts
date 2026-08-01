"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import type {
  PlannerReminder,
  PlannerReminderAnchor,
  PlannerReminderChannel,
  PlannerReminderEntityType,
} from "@/lib/planner/types";
import {
  cancelPlannerReminder,
  createPlannerReminder,
} from "@/lib/repo/planner-reminders";
import { requireWorkspace } from "@/lib/request-auth";

type ReminderActionResult = {
  ok: boolean;
  entity?: PlannerReminder;
  error?: string;
};

export async function createPlannerReminderAction(input: {
  clientMutationId: string;
  entityType: PlannerReminderEntityType;
  entityId: string;
  anchor: PlannerReminderAnchor;
  offsetMinutes?: number | null;
  exactAt?: string | null;
  channel: PlannerReminderChannel;
}): Promise<ReminderActionResult> {
  try {
    const access = await requireWorkspace();
    const entity = createPlannerReminder(getDb(), access, input);
    revalidatePlannerReminderViews(input.entityType);
    return { ok: true, entity };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelPlannerReminderAction(input: {
  id: string;
  entityType: PlannerReminderEntityType;
}): Promise<ReminderActionResult> {
  try {
    const access = await requireWorkspace();
    const entity = cancelPlannerReminder(getDb(), access, input.id);
    revalidatePlannerReminderViews(input.entityType);
    return { ok: true, entity };
  } catch (error) {
    return failure(error);
  }
}

function revalidatePlannerReminderViews(entityType: PlannerReminderEntityType): void {
  revalidatePath("/");
  revalidatePath(entityType === "task" ? "/tasks" : "/calendar");
}

function failure(error: unknown): ReminderActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "提醒操作失败" };
}
