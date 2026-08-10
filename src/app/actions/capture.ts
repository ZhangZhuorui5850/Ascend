"use server";

import { revalidatePath } from "next/cache";
import {
  recordCapture,
  type RecordCaptureInput,
  type RecordCaptureResult,
} from "@/lib/application/capture/record-capture";
import { actionFailure } from "@/lib/action-failure";
import { getDb } from "@/lib/db";
import { requireWorkspace } from "@/lib/request-auth";

export async function recordCaptureAction(
  input: RecordCaptureInput,
): Promise<{ ok: boolean; capture?: RecordCaptureResult; error?: string }> {
  try {
    const access = await requireWorkspace();
    const capture = recordCapture(getDb(), access, input);
    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath("/calendar");
    revalidatePath(`/day/${input.contextDay}`);
    if (capture.day && capture.day !== input.contextDay) revalidatePath(`/day/${capture.day}`);
    if (capture.kind === "study") {
      revalidatePath("/analytics");
      revalidatePath("/subjects");
    }
    if (capture.kind === "mistake") {
      revalidatePath("/mistakes");
      revalidatePath("/review");
    }
    return { ok: true, capture };
  } catch (error) {
    return { ok: false, error: actionFailure("capture", error).error };
  }
}
