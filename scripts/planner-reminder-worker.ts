import { randomUUID } from "node:crypto";
import webPush from "web-push";
import { getDb } from "../src/lib/db";
import {
  claimDueReminders,
  createInAppNotification,
  markReminderFailed,
  markReminderSent,
} from "../src/lib/repo/planner-reminders";
import {
  expirePushSubscription,
  listActivePushSubscriptions,
  markPushSubscriptionSuccess,
} from "../src/lib/repo/push-subscriptions";
import type { PlannerReminder } from "../src/lib/planner/types";

const leaseOwner = `reminder-worker:${process.pid}:${randomUUID()}`;
const once = process.argv.includes("--once");
const pollMilliseconds = Math.max(1_000, Number(process.env.ASCEND_REMINDER_POLL_MS ?? 15_000));
let stopping = false;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function runBatch(): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();
  const reminders = claimDueReminders(db, {
    now,
    leaseOwner,
    leaseSeconds: 90,
    limit: 100,
  });
  for (const reminder of reminders) {
    try {
      const payload = reminderPayload(reminder);
      if (reminder.channel === "in_app") {
        createInAppNotification(db, reminder, payload);
      } else {
        await sendWebPush(reminder, payload);
      }
      markReminderSent(db, { id: reminder.id, leaseOwner, sentAt: new Date().toISOString() });
    } catch (error) {
      markReminderFailed(db, {
        id: reminder.id,
        leaseOwner,
        failedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return reminders.length;
}

async function sendWebPush(
  reminder: PlannerReminder,
  payload: { title: string; body: string; targetPath: string },
): Promise<void> {
  configureVapid();
  const db = getDb();
  const subscriptions = listActivePushSubscriptions(db, reminder.workspace_id);
  if (!subscriptions.length) throw new Error("workspace 当前没有可用 Push 订阅");
  let delivered = 0;
  for (const subscription of subscriptions) {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      }, JSON.stringify({
        ...payload,
        tag: `planner-reminder:${reminder.id}`,
      }), {
        TTL: 60 * 60,
        urgency: "normal",
      });
      markPushSubscriptionSuccess(db, subscription.id, new Date().toISOString());
      delivered += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        expirePushSubscription(db, subscription.id, new Date().toISOString());
        continue;
      }
      throw error;
    }
  }
  if (!delivered) throw new Error("Push 订阅均已失效");
}

function reminderPayload(reminder: PlannerReminder): {
  title: string;
  body: string;
  targetPath: string;
} {
  const db = getDb();
  const row = reminder.entity_type === "task"
    ? db.prepare(`
        SELECT title, notes AS detail FROM planner_tasks
        WHERE workspace_id = ? AND id = ?
      `).get(reminder.workspace_id, reminder.entity_id)
    : db.prepare(`
        SELECT title, location AS detail FROM calendar_events
        WHERE workspace_id = ? AND id = ?
      `).get(reminder.workspace_id, reminder.entity_id);
  const entity = row as { title: string; detail: string } | undefined;
  const privateMode = process.env.ASCEND_NOTIFICATION_PRIVACY !== "detail";
  return {
    title: privateMode ? "Ascend 提醒" : (entity?.title ?? "Ascend 提醒"),
    body: privateMode ? "你有一项计划即将开始。" : (entity?.detail || "打开 Ascend 查看详情"),
    targetPath: reminder.entity_type === "task"
      ? `/tasks?task=${encodeURIComponent(reminder.entity_id)}`
      : `/calendar?event=${encodeURIComponent(reminder.entity_id)}`,
  };
}

function configureVapid(): void {
  const subject = process.env.ASCEND_VAPID_SUBJECT?.trim();
  const publicKey = process.env.ASCEND_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.ASCEND_VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) throw new Error("VAPID 凭据未完整配置");
  webPush.setVapidDetails(subject, publicKey, privateKey);
}

async function main(): Promise<void> {
  do {
    const count = await runBatch();
    console.log(JSON.stringify({
      event: "planner_reminder_batch",
      leaseOwner,
      claimed: count,
      at: new Date().toISOString(),
    }));
    if (once || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
  } while (!stopping);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
