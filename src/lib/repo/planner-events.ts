import type Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { RRule } from "rrule";
import type { WorkspaceScope } from "../access-context";
import type { CalendarEvent, PlannerActionConflict } from "../planner/types";
import { expandRecurrence } from "../planner/recurrence";
import { calendarEventDraftSchema } from "../planner/validation";
import { utcToZonedDateTime } from "../planner/time";
import type { ExamCountdown } from "./settings";
import { refreshEntityReminders } from "./planner-reminders";

type TimedEventInput = {
  allDay: false;
  startAt: string;
  endAt: string;
  timezone: string;
};

type AllDayEventInput = {
  allDay: true;
  startDate: string;
  endDateExclusive: string;
};

type EventCommonInput = {
  clientMutationId: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  subjectCode?: string | null;
  kind?: CalendarEvent["kind"];
  busyStatus?: CalendarEvent["busy_status"];
  recurrenceRule?: string | null;
};

export type CreateCalendarEventInput = EventCommonInput & (TimedEventInput | AllDayEventInput);

export type CalendarEventMutation = {
  entity?: CalendarEvent;
  conflict?: PlannerActionConflict<CalendarEvent>;
};

export function syncLegacyExamCountdownEvents(
  db: Database.Database,
  scope: WorkspaceScope,
  countdowns: ExamCountdown[],
): void {
  const calendarId = `${scope.workspaceId}:planner:milestone-calendar`;
  const now = new Date().toISOString();
  const activeKeys: string[] = [];
  const insert = db.prepare(`
    INSERT INTO calendar_events
      (id, workspace_id, calendar_id, title, description, subject_code, kind, busy_status,
       start_date, end_date_exclusive, all_day, migration_key, version, created_at, updated_at)
    VALUES
      (@id, @workspaceId, @calendarId, @title, @description, @subjectCode, 'exam', 'busy',
       @startDate, @endDateExclusive, 1, @migrationKey, 1, @now, @now)
    ON CONFLICT(workspace_id, migration_key) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      subject_code = excluded.subject_code,
      start_date = excluded.start_date,
      end_date_exclusive = excluded.end_date_exclusive,
      deleted_at = NULL,
      version = calendar_events.version + 1,
      updated_at = excluded.updated_at
  `);
  db.transaction(() => {
    for (const item of countdowns) {
      const normalized = `${item.name.trim()}\u0000${item.date}\u0000${item.subjectCode ?? ""}`;
      const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 24);
      const migrationKey = `legacy-exam:${digest}`;
      activeKeys.push(migrationKey);
      insert.run({
        id: `${scope.workspaceId}:planner:legacy-exam:${digest}`,
        workspaceId: scope.workspaceId,
        calendarId,
        title: item.name.trim(),
        description: item.targetScore ? `目标分数：${item.targetScore}` : "",
        subjectCode: item.subjectCode ?? null,
        startDate: item.date,
        endDateExclusive: shiftDateOnly(item.date, 1),
        migrationKey,
        now,
      });
    }
    const legacyRows = db.prepare(`
      SELECT id, migration_key FROM calendar_events
      WHERE workspace_id = ? AND migration_key LIKE 'legacy-exam:%' AND deleted_at IS NULL
    `).all(scope.workspaceId) as Array<{ id: string; migration_key: string }>;
    const active = new Set(activeKeys);
    const archive = db.prepare(`
      UPDATE calendar_events
      SET deleted_at = ?, version = version + 1, updated_at = ?
      WHERE workspace_id = ? AND id = ?
    `);
    for (const row of legacyRows) {
      if (!active.has(row.migration_key)) archive.run(now, now, scope.workspaceId, row.id);
    }
  })();
}

export function createCalendarEvent(
  db: Database.Database,
  scope: WorkspaceScope,
  input: CreateCalendarEventInput,
): CalendarEvent {
  const clientMutationId = input.clientMutationId.trim();
  if (!clientMutationId) throw new Error("clientMutationId 必填");
  const opId = eventOperationId(scope.workspaceId, clientMutationId);
  return db.transaction(() => {
    const replay = db.prepare(`
      SELECT entity_id FROM entity_changes
      WHERE workspace_id = ? AND op_id = ? AND entity_type = 'calendar_event'
    `).get(scope.workspaceId, opId) as { entity_id: string } | undefined;
    if (replay) {
      const existing = getCalendarEvent(db, scope, replay.entity_id);
      if (!existing) throw new Error("幂等事件记录缺少实体");
      return existing;
    }
    assertCalendar(db, scope, input.calendarId);
    const parsed = calendarEventDraftSchema.parse(input);
    const id = randomUUID();
    const timed = parsed.allDay ? null : parsed;
    const allDay = parsed.allDay ? parsed : null;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO calendar_events
        (id, workspace_id, calendar_id, title, description, location, url, subject_code,
         kind, busy_status, start_at, end_at, timezone, start_date, end_date_exclusive,
         all_day, recurrence_rule, recurrence_until, version, created_at, updated_at)
      VALUES
        (@id, @workspaceId, @calendarId, @title, @description, @location, @url, @subjectCode,
         @kind, @busyStatus, @startAt, @endAt, @timezone, @startDate, @endDateExclusive,
         @allDay, @recurrenceRule, @recurrenceUntil, 1, @now, @now)
    `).run({
      id,
      workspaceId: scope.workspaceId,
      calendarId: parsed.calendarId,
      title: parsed.title,
      description: parsed.description,
      location: parsed.location,
      url: parsed.url,
      subjectCode: parsed.subjectCode ?? null,
      kind: parsed.kind,
      busyStatus: parsed.busyStatus,
      startAt: timed?.startAt ?? null,
      endAt: timed?.endAt ?? null,
      timezone: timed?.timezone ?? null,
      startDate: allDay?.startDate ?? null,
      endDateExclusive: allDay?.endDateExclusive ?? null,
      allDay: parsed.allDay ? 1 : 0,
      recurrenceRule: parsed.recurrenceRule ?? null,
      recurrenceUntil: recurrenceUntil(parsed.recurrenceRule),
      now,
    });
    const entity = getCalendarEvent(db, scope, id)!;
    recordEventChange(db, scope, opId, entity, "create", null, input);
    return entity;
  })();
}

export function getCalendarEvent(
  db: Database.Database,
  scope: WorkspaceScope,
  id: string,
): CalendarEvent | null {
  return (db.prepare(`
    SELECT ${EVENT_COLUMNS}
    FROM calendar_events WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as CalendarEvent | undefined) ?? null;
}

export function listCalendarEventRange(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { start: string; end: string; startDate: string; endDateExclusive: string },
): CalendarEvent[] {
  const direct = db.prepare(`
    SELECT ${EVENT_COLUMNS}
    FROM calendar_events
    WHERE workspace_id = @workspaceId AND deleted_at IS NULL
      AND recurrence_rule IS NULL
      AND COALESCE(exception_kind, '') != 'cancel'
      AND (
        (all_day = 1 AND start_date < @endDateExclusive AND end_date_exclusive > @startDate)
        OR
        (all_day = 0 AND start_at < @end AND end_at > @start)
    )
    ORDER BY COALESCE(start_date, start_at) ASC, all_day DESC, id ASC
  `).all({ workspaceId: scope.workspaceId, ...input }) as CalendarEvent[];
  const masters = db.prepare(`
    SELECT ${EVENT_COLUMNS}
    FROM calendar_events
    WHERE workspace_id = @workspaceId
      AND deleted_at IS NULL
      AND recurring_event_id IS NULL
      AND recurrence_rule IS NOT NULL
      AND (
        (all_day = 1 AND start_date < @endDateExclusive)
        OR (all_day = 0 AND start_at < @end)
      )
      AND (recurrence_until IS NULL OR recurrence_until >= @start)
    ORDER BY id ASC
  `).all({ workspaceId: scope.workspaceId, ...input }) as CalendarEvent[];
  if (!masters.length) return direct;
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?")
    .get(scope.workspaceId) as { timezone: string };
  const exceptions = db.prepare(`
    SELECT ${EVENT_COLUMNS}
    FROM calendar_events
    WHERE workspace_id = ? AND recurring_event_id IS NOT NULL AND deleted_at IS NULL
  `).all(scope.workspaceId) as CalendarEvent[];
  const expanded: CalendarEvent[] = [];
  for (const master of masters) {
    const masterExceptions = exceptions.filter((event) => event.recurring_event_id === master.id);
    const excluded = new Set(masterExceptions.map((event) => event.original_start_at!));
    const timeZone = master.timezone ?? workspace.timezone;
    const localStart = master.all_day
      ? { date: master.start_date!, time: "00:00:00" }
      : utcToZonedDateTime(master.start_at!, timeZone);
    const occurrences = expandRecurrence({
      rrule: master.recurrence_rule!,
      startDate: localStart.date,
      startTime: localStart.time,
      timeZone,
      rangeStart: new Date(new Date(input.start).getTime() - 24 * 60 * 60 * 1000).toISOString(),
      rangeEnd: new Date(new Date(input.end).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      excludedOccurrenceKeys: excluded,
    });
    for (const occurrence of occurrences) {
      if (master.all_day) {
        const durationDays = dateDistance(master.start_date!, master.end_date_exclusive!);
        const endDateExclusive = shiftDateOnly(occurrence.localDate, durationDays);
        if (occurrence.localDate >= input.endDateExclusive || endDateExclusive <= input.startDate) continue;
        expanded.push({
          ...master,
          id: `${master.id}:occurrence:${occurrence.occurrenceKey}`,
          recurrence_rule: null,
          recurring_event_id: master.id,
          original_start_at: occurrence.occurrenceKey,
          start_date: occurrence.localDate,
          end_date_exclusive: endDateExclusive,
        });
      } else {
        const duration = new Date(master.end_at!).getTime() - new Date(master.start_at!).getTime();
        const endAt = new Date(new Date(occurrence.startAt).getTime() + duration).toISOString();
        if (occurrence.startAt >= input.end || endAt <= input.start) continue;
        expanded.push({
          ...master,
          id: `${master.id}:occurrence:${occurrence.occurrenceKey}`,
          recurrence_rule: null,
          recurring_event_id: master.id,
          original_start_at: occurrence.occurrenceKey,
          start_at: occurrence.startAt,
          end_at: endAt,
        });
      }
    }
  }
  return [...direct, ...expanded].sort((left, right) => (
    (left.start_date ?? left.start_at ?? "").localeCompare(right.start_date ?? right.start_at ?? "")
    || right.all_day - left.all_day
    || left.id.localeCompare(right.id)
  ));
}

export function updateCalendarEvent(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    id: string;
    expectedVersion: number;
    calendarId?: string;
    title?: string;
    description?: string;
    location?: string;
    url?: string;
    subjectCode?: string | null;
    kind?: CalendarEvent["kind"];
    busyStatus?: CalendarEvent["busy_status"];
    recurrenceRule?: string | null;
    allDay?: boolean;
    startAt?: string;
    endAt?: string;
    timezone?: string;
    startDate?: string;
    endDateExclusive?: string;
  },
): CalendarEventMutation {
  return db.transaction(() => {
    const current = getCalendarEvent(db, scope, input.id);
    if (!current) throw new Error("事件不存在");
    if (current.version !== input.expectedVersion) {
      return {
        conflict: {
          entityId: current.id,
          expectedVersion: input.expectedVersion,
          actualVersion: current.version,
          latest: current,
        },
      };
    }
    const allDay = input.allDay ?? current.all_day === 1;
    const draft = calendarEventDraftSchema.parse({
      allDay,
      calendarId: input.calendarId ?? current.calendar_id,
      title: input.title ?? current.title,
      description: input.description ?? current.description,
      location: input.location ?? current.location,
      url: input.url ?? current.url,
      subjectCode: input.subjectCode === undefined ? current.subject_code : input.subjectCode,
      kind: input.kind ?? current.kind,
      busyStatus: input.busyStatus ?? current.busy_status,
      recurrenceRule: input.recurrenceRule === undefined ? current.recurrence_rule : input.recurrenceRule,
      ...(allDay
        ? {
            startDate: input.startDate ?? current.start_date,
            endDateExclusive: input.endDateExclusive ?? current.end_date_exclusive,
          }
        : {
            startAt: input.startAt ?? current.start_at,
            endAt: input.endAt ?? current.end_at,
            timezone: input.timezone ?? current.timezone,
          }),
    });
    assertCalendar(db, scope, draft.calendarId);
    const timed = draft.allDay ? null : draft;
    const dateRange = draft.allDay ? draft : null;
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE calendar_events
      SET calendar_id = @calendarId, title = @title, description = @description,
          location = @location, url = @url, subject_code = @subjectCode,
          kind = @kind, busy_status = @busyStatus,
          start_at = @startAt, end_at = @endAt, timezone = @timezone,
          start_date = @startDate, end_date_exclusive = @endDateExclusive,
          all_day = @allDay, recurrence_rule = @recurrenceRule,
          recurrence_until = @recurrenceUntil,
          version = version + 1, updated_at = @now
      WHERE workspace_id = @workspaceId AND id = @id AND version = @expectedVersion
    `).run({
      workspaceId: scope.workspaceId,
      id: current.id,
      expectedVersion: input.expectedVersion,
      calendarId: draft.calendarId,
      title: draft.title,
      description: draft.description,
      location: draft.location,
      url: draft.url,
      subjectCode: draft.subjectCode ?? null,
      kind: draft.kind,
      busyStatus: draft.busyStatus,
      startAt: timed?.startAt ?? null,
      endAt: timed?.endAt ?? null,
      timezone: timed?.timezone ?? null,
      startDate: dateRange?.startDate ?? null,
      endDateExclusive: dateRange?.endDateExclusive ?? null,
      allDay: draft.allDay ? 1 : 0,
      recurrenceRule: draft.recurrenceRule ?? null,
      recurrenceUntil: recurrenceUntil(draft.recurrenceRule),
      now,
    });
    if (!result.changes) {
      const latest = getCalendarEvent(db, scope, current.id)!;
      return {
        conflict: {
          entityId: latest.id,
          expectedVersion: input.expectedVersion,
          actualVersion: latest.version,
          latest,
        },
      };
    }
    const entity = getCalendarEvent(db, scope, current.id)!;
    recordEventChange(
      db,
      scope,
      eventOperationId(scope.workspaceId, `update:${current.id}:${entity.version}`),
      entity,
      "update",
      input.expectedVersion,
      input,
    );
    refreshEntityReminders(db, scope, { entityType: "event", entityId: entity.id });
    return { entity };
  })();
}

export function softDeleteCalendarEvent(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; expectedVersion: number; clientMutationId: string },
): CalendarEventMutation {
  const clientMutationId = input.clientMutationId.trim();
  if (!clientMutationId) throw new Error("clientMutationId 必填");
  const opId = eventOperationId(scope.workspaceId, clientMutationId);
  return db.transaction(() => {
    const replay = db.prepare(`
      SELECT entity_id FROM entity_changes
      WHERE workspace_id = ? AND op_id = ? AND entity_type = 'calendar_event'
    `).get(scope.workspaceId, opId) as { entity_id: string } | undefined;
    if (replay) {
      const entity = getCalendarEvent(db, scope, replay.entity_id);
      if (!entity) throw new Error("幂等事件记录缺少实体");
      return { entity };
    }
    const current = getCalendarEvent(db, scope, input.id);
    if (!current) throw new Error("事件不存在");
    if (current.version !== input.expectedVersion) {
      return {
        conflict: {
          entityId: current.id,
          expectedVersion: input.expectedVersion,
          actualVersion: current.version,
          latest: current,
        },
      };
    }
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE calendar_events
      SET deleted_at = ?, version = version + 1, updated_at = ?
      WHERE workspace_id = ? AND id = ? AND version = ?
    `).run(now, now, scope.workspaceId, current.id, input.expectedVersion);
    const entity = getCalendarEvent(db, scope, current.id)!;
    recordEventChange(db, scope, opId, entity, "delete", input.expectedVersion, input);
    refreshEntityReminders(db, scope, { entityType: "event", entityId: entity.id });
    return { entity };
  })();
}

const EVENT_COLUMNS = `
  id, workspace_id, calendar_id, title, description, location, url, subject_code,
  kind, busy_status, start_at, end_at, timezone, start_date, end_date_exclusive,
  all_day, recurrence_rule, recurrence_until, recurring_event_id, original_start_at,
  exception_kind, migration_key, deleted_at, version, created_at, updated_at
`;

function assertCalendar(db: Database.Database, scope: WorkspaceScope, id: string): void {
  const calendar = db.prepare(`
    SELECT 1 FROM planner_calendars
    WHERE workspace_id = ? AND id = ? AND archived_at IS NULL
  `).get(scope.workspaceId, id);
  if (!calendar) throw new Error("日历不存在");
}

function eventOperationId(workspaceId: string, clientMutationId: string): string {
  return `planner:${workspaceId}:${clientMutationId}`;
}

function shiftDateOnly(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`考试日期无效：${day}`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dateDistance(start: string, end: string): number {
  return Math.max(
    1,
    Math.round((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86_400_000),
  );
}

function recurrenceUntil(rrule: string | null | undefined): string | null {
  if (!rrule) return null;
  const until = RRule.parseString(rrule).until;
  return until ? until.toISOString() : null;
}

function recordEventChange(
  db: Database.Database,
  scope: WorkspaceScope,
  opId: string,
  entity: CalendarEvent,
  operation: string,
  baseVersion: number | null,
  patch: unknown,
): void {
  db.prepare(`
    INSERT INTO entity_changes
      (workspace_id, op_id, entity_type, entity_id, op, base_version, patch_json, snapshot_json)
    VALUES (?, ?, 'calendar_event', ?, ?, ?, ?, ?)
  `).run(
    scope.workspaceId,
    opId,
    entity.id,
    operation,
    baseVersion,
    JSON.stringify(patch),
    JSON.stringify(entity),
  );
}
