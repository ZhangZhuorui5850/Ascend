import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { WorkspaceScope } from "../access-context";
import type {
  PlannerNotification,
  PlannerReminder,
  PlannerReminderAnchor,
  PlannerReminderChannel,
  PlannerReminderEntityType,
} from "../planner/types";
import { localDateTimeToUtc } from "../planner/time";
import { plannerReminderDraftSchema } from "../planner/validation";

const REMINDER_COLUMNS = `
  id, workspace_id, entity_type, entity_id, anchor, offset_minutes, exact_at,
  channel, status, next_attempt_at, attempt_count, leased_until, lease_owner,
  sent_at, last_error, idempotency_key, created_at, updated_at
`;

export function createPlannerReminder(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    clientMutationId: string;
    entityType: PlannerReminderEntityType;
    entityId: string;
    anchor: PlannerReminderAnchor;
    offsetMinutes?: number | null;
    exactAt?: string | null;
    channel: PlannerReminderChannel;
  },
): PlannerReminder {
  const idempotencyKey = input.clientMutationId.trim();
  if (!idempotencyKey) throw new Error("clientMutationId 必填");
  const parsed = plannerReminderDraftSchema.parse(input);
  return db.transaction(() => {
    const replay = db.prepare(`
      SELECT ${REMINDER_COLUMNS} FROM planner_reminders
      WHERE workspace_id = ? AND idempotency_key = ?
    `).get(scope.workspaceId, idempotencyKey) as PlannerReminder | undefined;
    if (replay) return replay;
    const nextAttemptAt = reminderTarget(db, scope, parsed);
    const id = randomUUID();
    db.prepare(`
      INSERT INTO planner_reminders
        (id, workspace_id, entity_type, entity_id, anchor, offset_minutes, exact_at,
         channel, status, next_attempt_at, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id,
      scope.workspaceId,
      parsed.entityType,
      parsed.entityId,
      parsed.anchor,
      parsed.offsetMinutes ?? null,
      parsed.exactAt ?? null,
      parsed.channel,
      nextAttemptAt,
      idempotencyKey,
    );
    return getPlannerReminder(db, scope, id)!;
  })();
}

export function getPlannerReminder(
  db: Database.Database,
  scope: WorkspaceScope,
  id: string,
): PlannerReminder | null {
  return (db.prepare(`
    SELECT ${REMINDER_COLUMNS} FROM planner_reminders
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as PlannerReminder | undefined) ?? null;
}

export function listEntityReminders(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { entityType: PlannerReminderEntityType; entityId: string },
): PlannerReminder[] {
  return db.prepare(`
    SELECT ${REMINDER_COLUMNS} FROM planner_reminders
    WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(scope.workspaceId, input.entityType, input.entityId) as PlannerReminder[];
}

export function listWorkspaceReminders(
  db: Database.Database,
  scope: WorkspaceScope,
  limit = 500,
): PlannerReminder[] {
  return db.prepare(`
    SELECT ${REMINDER_COLUMNS} FROM planner_reminders
    WHERE workspace_id = ?
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).all(scope.workspaceId, Math.min(Math.max(limit, 1), 1000)) as PlannerReminder[];
}

export function cancelPlannerReminder(
  db: Database.Database,
  scope: WorkspaceScope,
  id: string,
): PlannerReminder {
  const current = getPlannerReminder(db, scope, id);
  if (!current) throw new Error("提醒不存在");
  db.prepare(`
    UPDATE planner_reminders
    SET status = 'canceled', leased_until = NULL, lease_owner = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND id = ?
  `).run(scope.workspaceId, id);
  return getPlannerReminder(db, scope, id)!;
}

export function refreshEntityReminders(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { entityType: PlannerReminderEntityType; entityId: string },
): void {
  const reminders = listEntityReminders(db, scope, input)
    .filter((reminder) => reminder.status === "pending" || reminder.status === "failed");
  const update = db.prepare(`
    UPDATE planner_reminders
    SET next_attempt_at = ?, status = 'pending', attempt_count = 0,
        leased_until = NULL, lease_owner = NULL, last_error = '', updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND id = ?
  `);
  const cancel = db.prepare(`
    UPDATE planner_reminders
    SET status = 'canceled', leased_until = NULL, lease_owner = NULL,
        last_error = ?, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND id = ?
  `);
  for (const reminder of reminders) {
    try {
      const nextAttemptAt = reminderTarget(db, scope, {
        entityType: reminder.entity_type,
        entityId: reminder.entity_id,
        anchor: reminder.anchor,
        offsetMinutes: reminder.offset_minutes,
        exactAt: reminder.exact_at,
        channel: reminder.channel,
      });
      update.run(nextAttemptAt, scope.workspaceId, reminder.id);
    } catch (error) {
      cancel.run(
        error instanceof Error ? error.message.slice(0, 1000) : "提醒锚点已失效",
        scope.workspaceId,
        reminder.id,
      );
    }
  }
}

export function claimDueReminders(
  db: Database.Database,
  input: { now: string; leaseOwner: string; leaseSeconds?: number; limit?: number },
): PlannerReminder[] {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const leaseUntil = new Date(new Date(input.now).getTime() + (input.leaseSeconds ?? 60) * 1000).toISOString();
  return db.transaction(() => {
    const candidates = db.prepare(`
      SELECT id FROM planner_reminders
      WHERE next_attempt_at <= @now
        AND (
          status IN ('pending', 'failed')
          OR (status = 'leased' AND leased_until < @now)
        )
      ORDER BY next_attempt_at ASC, id ASC
      LIMIT @limit
    `).all({ now: input.now, limit }) as Array<{ id: string }>;
    const claim = db.prepare(`
      UPDATE planner_reminders
      SET status = 'leased', leased_until = ?, lease_owner = ?, updated_at = ?
      WHERE id = ?
        AND (
          status IN ('pending', 'failed')
          OR (status = 'leased' AND leased_until < ?)
        )
    `);
    const claimed: PlannerReminder[] = [];
    for (const candidate of candidates) {
      const result = claim.run(leaseUntil, input.leaseOwner, input.now, candidate.id, input.now);
      if (!result.changes) continue;
      claimed.push(db.prepare(`
        SELECT ${REMINDER_COLUMNS} FROM planner_reminders WHERE id = ?
      `).get(candidate.id) as PlannerReminder);
    }
    return claimed;
  })();
}

export function markReminderSent(
  db: Database.Database,
  input: { id: string; leaseOwner: string; sentAt: string },
): boolean {
  return db.prepare(`
    UPDATE planner_reminders
    SET status = 'sent', sent_at = ?, leased_until = NULL, lease_owner = NULL,
        last_error = '', updated_at = ?
    WHERE id = ? AND status = 'leased' AND lease_owner = ?
  `).run(input.sentAt, input.sentAt, input.id, input.leaseOwner).changes === 1;
}

export function markReminderFailed(
  db: Database.Database,
  input: { id: string; leaseOwner: string; failedAt: string; error: string },
): boolean {
  const reminder = db.prepare(`
    SELECT attempt_count FROM planner_reminders
    WHERE id = ? AND status = 'leased' AND lease_owner = ?
  `).get(input.id, input.leaseOwner) as { attempt_count: number } | undefined;
  if (!reminder) return false;
  const attemptCount = reminder.attempt_count + 1;
  const delayMinutes = Math.min(360, 2 ** Math.min(attemptCount, 8));
  const nextAttemptAt = new Date(new Date(input.failedAt).getTime() + delayMinutes * 60_000).toISOString();
  return db.prepare(`
    UPDATE planner_reminders
    SET status = 'failed', attempt_count = ?, next_attempt_at = ?,
        leased_until = NULL, lease_owner = NULL, last_error = ?, updated_at = ?
    WHERE id = ? AND status = 'leased' AND lease_owner = ?
  `).run(
    attemptCount,
    nextAttemptAt,
    input.error.slice(0, 1000),
    input.failedAt,
    input.id,
    input.leaseOwner,
  ).changes === 1;
}

export function createInAppNotification(
  db: Database.Database,
  reminder: PlannerReminder,
  input: { title: string; body: string; targetPath: string },
): PlannerNotification {
  const id = `notification:${reminder.id}`;
  db.prepare(`
    INSERT OR IGNORE INTO planner_notifications
      (id, workspace_id, reminder_id, title, body, target_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, reminder.workspace_id, reminder.id, input.title, input.body, input.targetPath);
  return db.prepare(`
    SELECT id, workspace_id, reminder_id, title, body, target_path, read_at, created_at
    FROM planner_notifications WHERE workspace_id = ? AND id = ?
  `).get(reminder.workspace_id, id) as PlannerNotification;
}

export function listNotifications(
  db: Database.Database,
  scope: WorkspaceScope,
  limit = 50,
): PlannerNotification[] {
  return db.prepare(`
    SELECT id, workspace_id, reminder_id, title, body, target_path, read_at, created_at
    FROM planner_notifications
    WHERE workspace_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(scope.workspaceId, Math.min(Math.max(limit, 1), 100)) as PlannerNotification[];
}

function reminderTarget(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    entityType: PlannerReminderEntityType;
    entityId: string;
    anchor: PlannerReminderAnchor;
    offsetMinutes?: number | null;
    exactAt?: string | null;
    channel: PlannerReminderChannel;
  },
): string {
  if (input.anchor === "exact") return new Date(input.exactAt!).toISOString();
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?")
    .get(scope.workspaceId) as { timezone: string } | undefined;
  if (!workspace) throw new Error("学习空间不存在");
  let anchorAt: string | null = null;
  if (input.entityType === "task") {
    const task = db.prepare(`
      SELECT due_date, due_at, scheduled_start_at FROM planner_tasks
      WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
    `).get(scope.workspaceId, input.entityId) as {
      due_date: string | null;
      due_at: string | null;
      scheduled_start_at: string | null;
    } | undefined;
    if (!task) throw new Error("提醒任务不存在");
    if (input.anchor === "scheduled_start") anchorAt = task.scheduled_start_at;
    if (input.anchor === "due") {
      anchorAt = task.due_at ?? (task.due_date
        ? localDateTimeToUtc({ date: task.due_date, time: "09:00", timeZone: workspace.timezone })
        : null);
    }
  } else {
    const event = db.prepare(`
      SELECT start_at, start_date FROM calendar_events
      WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
    `).get(scope.workspaceId, input.entityId) as {
      start_at: string | null;
      start_date: string | null;
    } | undefined;
    if (!event) throw new Error("提醒事件不存在");
    anchorAt = event.start_at ?? (event.start_date
      ? localDateTimeToUtc({ date: event.start_date, time: "09:00", timeZone: workspace.timezone })
      : null);
  }
  if (!anchorAt) throw new Error("提醒锚点缺少时间");
  return new Date(new Date(anchorAt).getTime() + (input.offsetMinutes ?? 0) * 60_000).toISOString();
}
