import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import {
  DAY_FIELDS,
  updateDayEntryAutosave,
  type DayField,
} from "@/lib/repo/days";
import {
  assertSameOrigin,
  AuthError,
  authErrorResponse,
  requireWorkspace,
} from "@/lib/request-auth";

type AutosaveBody = {
  date?: unknown;
  clientId?: unknown;
  revision?: unknown;
  fields?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  try {
    const access = await requireWorkspace(request);
    await assertSameOrigin(request);
    const body = await request.json() as AutosaveBody;
    const date = typeof body.date === "string" ? body.date : "";
    const clientId = typeof body.clientId === "string" ? body.clientId : "";
    const revision = typeof body.revision === "number" ? body.revision : Number.NaN;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AuthError("Invalid autosave date", 400);
    if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(clientId)) throw new AuthError("Invalid autosave client id", 400);
    if (!Number.isSafeInteger(revision) || revision < 1) throw new AuthError("Invalid autosave revision", 400);
    if (!body.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) {
      throw new AuthError("Autosave fields are required", 400);
    }

    const inputFields = body.fields as Record<string, unknown>;
    const fields: Partial<Record<DayField, string>> = {};
    for (const field of DAY_FIELDS) {
      if (typeof inputFields[field] === "string") fields[field] = inputFields[field];
    }

    const result = updateDayEntryAutosave(getDb(), access, date, { clientId, revision, fields });
    if (result.applied) {
      revalidatePath(`/day/${date}`);
      revalidatePath("/");
      revalidatePath("/calendar");
    }
    return Response.json(
      { ok: true, ...result },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
