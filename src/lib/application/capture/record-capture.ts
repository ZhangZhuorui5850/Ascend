import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../../access-context";
import { parseCaptureText, type CaptureKind } from "../../capture/parser";
import { addMinutesToInstant, localDateTimeToUtc } from "../../planner/time";
import { addNote } from "../../repo/planner";
import { createMistake } from "../../repo/reviews";
import { getWorkspaceTimeZone } from "../../repo/today";
import { recordStudy } from "../learning/record-study";
import { createTask } from "../tasks/commands";

export type TextCaptureKind = Exclude<CaptureKind, "asset">;

export type RecordCaptureInput = {
  clientMutationId: string;
  kind: TextCaptureKind;
  text: string;
  contextDay: string;
  subjectCode?: string | null;
  knowledgePointId?: string | null;
  cause?: string;
};

export type RecordCaptureResult = {
  kind: TextCaptureKind;
  entityId: string;
  title: string;
  day: string | null;
  warnings: string[];
};

export function recordCapture(
  db: Database.Database,
  scope: WorkspaceScope,
  input: RecordCaptureInput,
): RecordCaptureResult {
  const clientMutationId = input.clientMutationId.trim();
  if (!clientMutationId) throw new Error("clientMutationId 必填");
  const parsed = parseCaptureText({
    text: input.text,
    contextDay: input.contextDay,
    selectedKind: input.kind,
  });
  if (!parsed.text) throw new Error("记录内容必填");
  const subjectCode = input.subjectCode?.trim() || null;
  const knowledgePointId = input.knowledgePointId?.trim() || null;
  return db.transaction(() => {
    if (input.kind === "task") {
      const timeZone = getWorkspaceTimeZone(db, scope);
      const startAt = parsed.time && parsed.date
        ? localDateTimeToUtc({ date: parsed.date, time: parsed.time, timeZone })
        : null;
      const estimatedMinutes = parsed.minutes ?? 25;
      const task = createTask(db, scope, {
        clientMutationId,
        title: parsed.text,
        subjectCode,
        estimatedMinutes,
        dueDate: startAt ? null : parsed.date,
        scheduledStartAt: startAt,
        scheduledEndAt: startAt ? addMinutesToInstant(startAt, estimatedMinutes) : null,
        scheduledTimezone: startAt ? timeZone : null,
        learning: knowledgePointId ? {
          expectedVersion: 0,
          knowledgePointId,
          activityType: "unspecified",
          sourceType: "manual_capture",
          sourceId: clientMutationId,
        } : undefined,
      });
      return result(input.kind, task.id, task.title, parsed.date, parsed.warnings);
    }
    if (input.kind === "study") {
      const evidence = recordStudy(db, scope, {
        idempotencyKey: `capture:${clientMutationId}`,
        day: parsed.date ?? input.contextDay,
        title: parsed.text,
        subjectCode,
        knowledgePointId,
        actualMinutes: parsed.minutes ?? undefined,
        activityType: "study",
        outcome: "recorded",
        sourceType: "manual_capture",
        sourceId: clientMutationId,
      });
      return result(input.kind, evidence.evidence.id, parsed.text, evidence.evidence.day, parsed.warnings);
    }
    if (input.kind === "mistake") {
      const mistake = createMistake(db, scope, {
        clientMutationId,
        day: parsed.date ?? input.contextDay,
        title: parsed.text,
        cause: input.cause,
        subjectCode: subjectCode ?? undefined,
        knowledgePointId: knowledgePointId ?? undefined,
      });
      return result(input.kind, String(mistake.id), parsed.text, parsed.date ?? input.contextDay, parsed.warnings);
    }
    const note = addNote(db, scope, {
      clientMutationId,
      day: parsed.date ?? input.contextDay,
      content: parsed.text,
    });
    return result(input.kind, String(note.id), parsed.text, note.day, parsed.warnings);
  })();
}

function result(
  kind: TextCaptureKind,
  entityId: string,
  title: string,
  day: string | null,
  warnings: string[],
): RecordCaptureResult {
  return { kind, entityId, title, day, warnings };
}
