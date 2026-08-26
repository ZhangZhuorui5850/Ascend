import { createHash, randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { AccessContext } from "../access-context";
import { createAlgorithmDeviceWithToken } from "./algorithm-devices";
import { requirePluginEnabled } from "./plugins";

const PAIRING_PREFIX = "ascend_pair_";
const DEVICE_PREFIX = "ascend_vscode_";
const PAIRING_LIFETIME_MS = 10 * 60 * 1_000;
const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type AlgorithmDevicePairing = {
  userCode: string;
  deviceName: string;
  platform: string;
  environment: string;
  status: "pending" | "approved" | "consumed" | "expired";
  expiresAt: string;
};

export function createAlgorithmDevicePairing(
  db: Database.Database,
  input: {
    deviceName: string;
    platform?: string;
    environment?: string;
    requestFingerprint?: string;
  },
): { deviceCode: string; pairing: AlgorithmDevicePairing; intervalSeconds: number } {
  const deviceName = input.deviceName.trim().slice(0, 60);
  if (!deviceName) throw new Error("设备名称必填");
  const requestFingerprint = hashValue(input.requestFingerprint || "unknown");
  expireStalePairings(db);
  const recent = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM algorithm_device_pairings
      WHERE request_fingerprint = ? AND created_at >= datetime('now', '-10 minutes')
    `,
    )
    .get(requestFingerprint) as { count: number };
  if (recent.count >= 10) throw new Error("配对请求过于频繁，请稍后重试");
  const pending = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM algorithm_device_pairings
      WHERE status IN ('pending', 'approved') AND datetime(expires_at) > CURRENT_TIMESTAMP
    `,
    )
    .get() as { count: number };
  if (pending.count >= 1_000) throw new Error("配对服务繁忙，请稍后重试");

  const secret = randomBytes(32).toString("base64url");
  const deviceCode = `${PAIRING_PREFIX}${secret}`;
  const userCode = createUserCode(db);
  const expiresAt = new Date(Date.now() + PAIRING_LIFETIME_MS).toISOString();
  db.prepare(
    `
    INSERT INTO algorithm_device_pairings
      (id, device_code_hash, user_code, device_name, platform, environment,
       request_fingerprint, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    randomUUID(),
    hashValue(deviceCode),
    userCode,
    deviceName,
    (input.platform || "").trim().slice(0, 60),
    (input.environment || "").trim().slice(0, 120),
    requestFingerprint,
    expiresAt,
  );
  return {
    deviceCode,
    pairing: getPairingByUserCode(db, userCode),
    intervalSeconds: 3,
  };
}

export function getAlgorithmDevicePairingForApproval(db: Database.Database, userCode: string): AlgorithmDevicePairing {
  expireStalePairings(db);
  return getPairingByUserCode(db, normalizeUserCode(userCode));
}

export function approveAlgorithmDevicePairing(
  db: Database.Database,
  context: AccessContext & { workspaceId: string },
  userCode: string,
): AlgorithmDevicePairing {
  requirePluginEnabled(db, context, "algorithms");
  expireStalePairings(db);
  const normalized = normalizeUserCode(userCode);
  const result = db
    .prepare(
      `
      UPDATE algorithm_device_pairings
      SET status = 'approved', workspace_id = ?, approved_by_user_id = ?,
          approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_code = ? AND status = 'pending' AND datetime(expires_at) > CURRENT_TIMESTAMP
    `,
    )
    .run(context.workspaceId, context.userId, normalized);
  if (!result.changes) {
    const current = getPairingByUserCode(db, normalized);
    if (current.status !== "approved" && current.status !== "consumed") throw new Error("设备配对码已经失效");
  }
  return getPairingByUserCode(db, normalized);
}

export function exchangeAlgorithmDevicePairing(
  db: Database.Database,
  deviceCode: string,
):
  | { status: "pending"; intervalSeconds: number }
  | { status: "approved"; token: string; deviceId: string; deviceName: string; expiresAt: string } {
  if (!deviceCode.startsWith(PAIRING_PREFIX)) throw new Error("设备配对凭据无效");
  expireStalePairings(db);
  const row = db
    .prepare(
      `
      SELECT id, status, workspace_id AS workspaceId, approved_by_user_id AS userId,
             device_id AS deviceId, device_name AS deviceName, platform, expires_at AS expiresAt
      FROM algorithm_device_pairings
      WHERE device_code_hash = ?
    `,
    )
    .get(hashValue(deviceCode)) as
    | {
        id: string;
        status: string;
        workspaceId: string | null;
        userId: string | null;
        deviceId: string | null;
        deviceName: string;
        platform: string;
        expiresAt: string;
      }
    | undefined;
  if (!row || row.status === "expired" || new Date(row.expiresAt).getTime() <= Date.now()) {
    throw new Error("设备配对码已经失效");
  }
  if (row.status === "pending") return { status: "pending", intervalSeconds: 3 };
  const token = `${DEVICE_PREFIX}${deviceCode.slice(PAIRING_PREFIX.length)}`;
  if (row.status === "consumed" && row.deviceId) {
    const device = db
      .prepare(
        `
        SELECT id, name, expires_at AS expiresAt
        FROM algorithm_devices
        WHERE id = ? AND workspace_id = ? AND token_hash = ?
          AND status = 'active' AND revoked_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP
      `,
      )
      .get(row.deviceId, row.workspaceId, hashValue(token)) as
      { id: string; name: string; expiresAt: string } | undefined;
    if (!device) throw new Error("设备授权已经失效");
    return {
      status: "approved",
      token,
      deviceId: device.id,
      deviceName: device.name,
      expiresAt: device.expiresAt,
    };
  }
  if (row.status !== "approved" || !row.workspaceId || !row.userId) throw new Error("设备配对状态无效");

  return db.transaction(() => {
    const created = createAlgorithmDeviceWithToken(
      db,
      { workspaceId: row.workspaceId!, userId: row.userId! },
      { name: row.deviceName, platform: row.platform },
      token,
    );
    db.prepare(
      `
      UPDATE algorithm_device_pairings
      SET status = 'consumed', device_id = ?, consumed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'approved'
    `,
    ).run(created.device.id, row.id);
    return {
      status: "approved" as const,
      token,
      deviceId: created.device.id,
      deviceName: created.device.name,
      expiresAt: created.device.expiresAt,
    };
  })();
}

function expireStalePairings(db: Database.Database): void {
  db.prepare(
    `
    UPDATE algorithm_device_pairings
    SET status = 'expired', updated_at = CURRENT_TIMESTAMP
    WHERE status IN ('pending', 'approved') AND datetime(expires_at) <= CURRENT_TIMESTAMP
  `,
  ).run();
}

function createUserCode(db: Database.Database): string {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const bytes = randomBytes(8);
    const value = [...bytes].map((byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]).join("");
    const userCode = `${value.slice(0, 4)}-${value.slice(4)}`;
    const exists = db.prepare("SELECT 1 FROM algorithm_device_pairings WHERE user_code = ?").get(userCode);
    if (!exists) return userCode;
  }
  throw new Error("设备配对码生成失败");
}

function getPairingByUserCode(db: Database.Database, userCode: string): AlgorithmDevicePairing {
  const row = db
    .prepare(
      `
      SELECT user_code AS userCode, device_name AS deviceName, platform, environment,
             status, expires_at AS expiresAt
      FROM algorithm_device_pairings WHERE user_code = ?
    `,
    )
    .get(userCode) as AlgorithmDevicePairing | undefined;
  if (!row) throw new Error("设备配对码无效");
  return row;
}

function normalizeUserCode(value: string): string {
  const compact = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z2-9]{8}$/.test(compact)) throw new Error("设备配对码无效");
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
