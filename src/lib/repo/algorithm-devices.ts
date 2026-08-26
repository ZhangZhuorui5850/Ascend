import { createHash, randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { AccessContext, WorkspaceScope } from "../access-context";
import { writeAuditLog } from "../audit";
import { requirePluginEnabled } from "./plugins";

const TOKEN_PREFIX = "ascend_vscode_";
const MAX_ACTIVE_DEVICES = 10;
const DEVICE_TOKEN_DAYS = 365;

export type AlgorithmDevice = {
  id: string;
  name: string;
  platform: string;
  tokenPrefix: string;
  localRoot: string;
  expiresAt: string;
  lastSeenAt: string | null;
  createdAt: string;
};

export type AlgorithmDeviceContext = WorkspaceScope & {
  deviceId: string;
  deviceName: string;
};

export function listAlgorithmDevices(db: Database.Database, scope: WorkspaceScope): AlgorithmDevice[] {
  requirePluginEnabled(db, scope, "algorithms");
  return db
    .prepare(
      `
    SELECT id, name, platform, token_prefix AS tokenPrefix, local_root AS localRoot,
           expires_at AS expiresAt, last_seen_at AS lastSeenAt, created_at AS createdAt
    FROM algorithm_devices
    WHERE workspace_id = ? AND status = 'active' AND revoked_at IS NULL
      AND datetime(expires_at) > CURRENT_TIMESTAMP
    ORDER BY created_at DESC
  `,
    )
    .all(scope.workspaceId) as AlgorithmDevice[];
}

export function createAlgorithmDevice(
  db: Database.Database,
  context: Pick<AccessContext, "userId"> & { workspaceId: string },
  input: { name: string; platform?: string; localRoot?: string },
): { token: string; device: AlgorithmDevice } {
  return createAlgorithmDeviceWithToken(db, context, input);
}

export function createAlgorithmDeviceWithToken(
  db: Database.Database,
  context: Pick<AccessContext, "userId"> & { workspaceId: string },
  input: { name: string; platform?: string; localRoot?: string },
  requestedToken?: string,
): { token: string; device: AlgorithmDevice } {
  requirePluginEnabled(db, context, "algorithms");
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("设备名称必填");
  if (listAlgorithmDevices(db, context).length >= MAX_ACTIVE_DEVICES) {
    throw new Error(`最多连接 ${MAX_ACTIVE_DEVICES} 台刷题设备`);
  }
  const id = randomUUID();
  const token = requestedToken || `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  if (!new RegExp(`^${TOKEN_PREFIX}[A-Za-z0-9_-]{40,}$`).test(token)) throw new Error("设备凭据格式无效");
  const tokenPrefix = `${token.slice(0, TOKEN_PREFIX.length + 6)}…`;
  const expiresAt = new Date(Date.now() + DEVICE_TOKEN_DAYS * 86_400_000).toISOString();
  db.transaction(() => {
    db.prepare(
      `
      INSERT INTO algorithm_devices
        (workspace_id, id, name, platform, token_prefix, token_hash, local_root, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      context.workspaceId,
      id,
      name,
      (input.platform || "").trim().slice(0, 60),
      tokenPrefix,
      hashToken(token),
      (input.localRoot || "").trim().slice(0, 1_000),
      expiresAt,
    );
    writeAuditLog(db, {
      actorUserId: context.userId,
      targetUserId: context.userId,
      action: "algorithm.device.created",
      entityType: "algorithm_device",
      entityId: id,
    });
  })();
  const device = listAlgorithmDevices(db, context).find((item) => item.id === id);
  if (!device) throw new Error("刷题设备创建失败");
  return { token, device };
}

export function revokeAlgorithmDevice(
  db: Database.Database,
  context: AccessContext & { workspaceId: string },
  deviceId: string,
): void {
  requirePluginEnabled(db, context, "algorithms");
  db.transaction(() => {
    const result = db
      .prepare(
        `
      UPDATE algorithm_devices
      SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ? AND revoked_at IS NULL
    `,
      )
      .run(context.workspaceId, deviceId);
    if (!result.changes) throw new Error("刷题设备不存在或已撤销");
    writeAuditLog(db, {
      actorUserId: context.userId,
      targetUserId: context.userId,
      action: "algorithm.device.revoked",
      entityType: "algorithm_device",
      entityId: deviceId,
    });
  })();
}

export function authenticateAlgorithmDevice(
  db: Database.Database,
  authorization: string | null,
): AlgorithmDeviceContext {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match || !match[1].startsWith(TOKEN_PREFIX)) throw new Error("VS Code device token required");
  const row = db
    .prepare(
      `
    SELECT workspace_id, id, name
    FROM algorithm_devices
    WHERE token_hash = ? AND status = 'active' AND revoked_at IS NULL
      AND datetime(expires_at) > CURRENT_TIMESTAMP
  `,
    )
    .get(hashToken(match[1])) as { workspace_id: string; id: string; name: string } | undefined;
  if (!row) throw new Error("VS Code device token is invalid or expired");
  db.prepare(
    `
    UPDATE algorithm_devices
    SET last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND id = ?
      AND (last_seen_at IS NULL OR datetime(last_seen_at) < datetime('now', '-5 minutes'))
  `,
  ).run(row.workspace_id, row.id);
  return { workspaceId: row.workspace_id, deviceId: row.id, deviceName: row.name };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
