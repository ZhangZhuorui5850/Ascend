import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { WorkspaceScope } from "../access-context";
import {
  decryptPlannerSecret,
  encryptPlannerSecret,
  plannerSecretHash,
} from "../planner/secrets";
import type { PushSubscriptionRecord } from "../planner/types";

export type DecryptedPushSubscription = {
  id: string;
  workspaceId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export function upsertPushSubscription(
  db: Database.Database,
  scope: WorkspaceScope & { userId?: string },
  input: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    deviceName?: string;
  },
): PushSubscriptionRecord {
  if (!scope.userId) throw new Error("Push 订阅缺少用户身份");
  const endpoint = input.endpoint.trim();
  if (!endpoint.startsWith("https://")) throw new Error("Push endpoint 需使用 HTTPS");
  if (!input.keys.p256dh || !input.keys.auth) throw new Error("Push 订阅密钥缺失");
  const id = randomUUID();
  const endpointHash = plannerSecretHash(endpoint);
  db.prepare(`
    INSERT INTO push_subscriptions
      (id, workspace_id, user_id, endpoint_hash, endpoint_ciphertext,
       p256dh_ciphertext, auth_ciphertext, device_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, endpoint_hash) DO UPDATE SET
      user_id = excluded.user_id,
      endpoint_ciphertext = excluded.endpoint_ciphertext,
      p256dh_ciphertext = excluded.p256dh_ciphertext,
      auth_ciphertext = excluded.auth_ciphertext,
      device_name = excluded.device_name,
      expired_at = NULL,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    id,
    scope.workspaceId,
    scope.userId,
    endpointHash,
    encryptPlannerSecret(endpoint),
    encryptPlannerSecret(input.keys.p256dh),
    encryptPlannerSecret(input.keys.auth),
    input.deviceName?.trim().slice(0, 120) ?? "",
  );
  return db.prepare(`
    SELECT * FROM push_subscriptions WHERE workspace_id = ? AND endpoint_hash = ?
  `).get(scope.workspaceId, endpointHash) as PushSubscriptionRecord;
}

export function listActivePushSubscriptions(
  db: Database.Database,
  workspaceId: string,
): DecryptedPushSubscription[] {
  const rows = db.prepare(`
    SELECT * FROM push_subscriptions
    WHERE workspace_id = ? AND expired_at IS NULL
    ORDER BY id ASC
  `).all(workspaceId) as PushSubscriptionRecord[];
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    endpoint: decryptPlannerSecret(row.endpoint_ciphertext),
    keys: {
      p256dh: decryptPlannerSecret(row.p256dh_ciphertext),
      auth: decryptPlannerSecret(row.auth_ciphertext),
    },
  }));
}

export function markPushSubscriptionSuccess(
  db: Database.Database,
  id: string,
  at: string,
): void {
  db.prepare(`
    UPDATE push_subscriptions SET last_success_at = ?, updated_at = ? WHERE id = ?
  `).run(at, at, id);
}

export function expirePushSubscription(
  db: Database.Database,
  id: string,
  at: string,
): void {
  db.prepare(`
    UPDATE push_subscriptions SET expired_at = ?, updated_at = ? WHERE id = ?
  `).run(at, at, id);
}
