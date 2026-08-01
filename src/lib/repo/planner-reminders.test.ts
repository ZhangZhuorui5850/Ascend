import { afterEach, describe, expect, it } from "vitest";
import { createTestDb, createTestWorkspace } from "./testing";
import { ensurePlannerDefaults } from "./planner-defaults";
import { listTaskLists } from "./planner-lists";
import { createPlannerTask } from "./planner-tasks";
import {
  claimDueReminders,
  createInAppNotification,
  createPlannerReminder,
  listEntityReminders,
  markReminderFailed,
  markReminderSent,
} from "./planner-reminders";
import {
  listActivePushSubscriptions,
  upsertPushSubscription,
} from "./push-subscriptions";

describe("Planner reminders and Push credentials", () => {
  const originalKey = process.env.ASCEND_PUSH_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ASCEND_PUSH_ENCRYPTION_KEY;
    else process.env.ASCEND_PUSH_ENCRYPTION_KEY = originalKey;
  });

  it("anchors reminders in workspace time and keeps idempotent writes isolated", () => {
    const db = createTestDb();
    const a = createTestWorkspace(db);
    const b = createTestWorkspace(db);
    ensurePlannerDefaults(db, a);
    ensurePlannerDefaults(db, b);
    const task = createPlannerTask(db, a, {
      clientMutationId: "reminder-task",
      listId: listTaskLists(db, a)[0].id,
      title: "带提醒的任务",
      dueDate: "2026-08-01",
    });
    const reminder = createPlannerReminder(db, a, {
      clientMutationId: "reminder-create-1",
      entityType: "task",
      entityId: task.id,
      anchor: "due",
      offsetMinutes: -30,
      channel: "in_app",
    });
    const replay = createPlannerReminder(db, a, {
      clientMutationId: "reminder-create-1",
      entityType: "task",
      entityId: task.id,
      anchor: "due",
      offsetMinutes: -15,
      channel: "in_app",
    });
    expect(replay.id).toBe(reminder.id);
    expect(reminder.next_attempt_at).toBe("2026-08-01T00:30:00.000Z");
    expect(listEntityReminders(db, b, { entityType: "task", entityId: task.id })).toHaveLength(0);
  });

  it("leases once, recovers expired leases, retries failures, and emits one notification", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    ensurePlannerDefaults(db, scope);
    const task = createPlannerTask(db, scope, {
      clientMutationId: "lease-task",
      listId: listTaskLists(db, scope)[0].id,
      title: "领取提醒",
      dueAt: "2026-08-01T01:00:00.000Z",
      dueTimezone: "UTC",
    });
    const reminder = createPlannerReminder(db, scope, {
      clientMutationId: "lease-reminder",
      entityType: "task",
      entityId: task.id,
      anchor: "due",
      offsetMinutes: 0,
      channel: "in_app",
    });
    const first = claimDueReminders(db, {
      now: "2026-08-01T01:00:00.000Z",
      leaseOwner: "worker-a",
      leaseSeconds: 30,
    });
    expect(first.map((item) => item.id)).toEqual([reminder.id]);
    expect(claimDueReminders(db, {
      now: "2026-08-01T01:00:01.000Z",
      leaseOwner: "worker-b",
    })).toHaveLength(0);
    const recovered = claimDueReminders(db, {
      now: "2026-08-01T01:00:31.000Z",
      leaseOwner: "worker-b",
    });
    expect(recovered).toHaveLength(1);
    expect(markReminderFailed(db, {
      id: reminder.id,
      leaseOwner: "worker-b",
      failedAt: "2026-08-01T01:00:31.000Z",
      error: "temporary",
    })).toBe(true);
    const retried = claimDueReminders(db, {
      now: "2026-08-01T01:02:31.000Z",
      leaseOwner: "worker-c",
    });
    expect(retried).toHaveLength(1);
    const notification = createInAppNotification(db, retried[0], {
      title: "领取提醒",
      body: "任务即将到期",
      targetPath: `/tasks?task=${task.id}`,
    });
    expect(createInAppNotification(db, retried[0], {
      title: "重复投递",
      body: "",
      targetPath: "/tasks",
    }).id).toBe(notification.id);
    expect(markReminderSent(db, {
      id: reminder.id,
      leaseOwner: "worker-c",
      sentAt: "2026-08-01T01:02:31.000Z",
    })).toBe(true);
  });

  it("encrypts Push endpoint and key material at rest", () => {
    process.env.ASCEND_PUSH_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const input = {
      endpoint: "https://push.example.test/subscription/private-token",
      keys: { p256dh: "public-key-material", auth: "auth-secret-material" },
      deviceName: "测试设备",
    };
    upsertPushSubscription(db, scope, input);
    const stored = db.prepare(`
      SELECT endpoint_ciphertext, p256dh_ciphertext, auth_ciphertext
      FROM push_subscriptions WHERE workspace_id = ?
    `).get(scope.workspaceId) as Record<string, string>;
    expect(JSON.stringify(stored)).not.toContain("private-token");
    expect(JSON.stringify(stored)).not.toContain("public-key-material");
    expect(JSON.stringify(stored)).not.toContain("auth-secret-material");
    expect(listActivePushSubscriptions(db, scope.workspaceId)).toEqual([
      expect.objectContaining({
        endpoint: input.endpoint,
        keys: input.keys,
      }),
    ]);
  });
});
