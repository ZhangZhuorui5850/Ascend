import type Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AccessContext, UserStatus } from "../access-context";
import { hashPassword } from "../auth";
import { ensureWorkspaceForUser } from "./workspaces";

const INVITATION_HOURS = 24;
const MIN_PASSWORD_LENGTH = 12;

type AdminContext = AccessContext & { role: "admin" };

type AuditSummary = Record<string, unknown>;

export type AdminUserSummary = {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "user";
  status: UserStatus;
  last_login_at: string | null;
  created_at: string;
  workspace_id: string | null;
  storage_quota_bytes: number | null;
  storage_used_bytes: number;
  session_count: number;
};

export type AuditLogRow = {
  id: number;
  actor_user_id: string;
  actor_name: string;
  target_user_id: string | null;
  target_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary_json: string;
  created_at: string;
};

function requireAdminContext(context: AccessContext): asserts context is AdminContext {
  if (context.role !== "admin" || context.status !== "active") throw new Error("需要管理员权限");
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("邮箱格式无效");
  return normalized;
}

export function createInvitation(
  db: Database.Database,
  admin: AccessContext,
  input: { email: string; displayName: string },
): { invitationUrlToken: string; userId: string; expiresAt: string } {
  requireAdminContext(admin);
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error("显示名称必填");
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) throw new Error("该邮箱已存在");

  const invitationUrlToken = randomBytes(32).toString("base64url");
  const userId = randomUUID();
  const invitationId = randomUUID();
  const expiresAt = new Date(Date.now() + INVITATION_HOURS * 60 * 60 * 1000).toISOString();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, role, status)
      VALUES (?, ?, 'invited:no-password', ?, 'user', 'invited')
    `).run(userId, email, displayName);
    db.prepare(`
      INSERT INTO invitations (id, user_id, token_hash, expires_at, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(invitationId, userId, tokenHash(invitationUrlToken), expiresAt, admin.userId);
    writeAuditLog(db, {
      actorUserId: admin.userId,
      targetUserId: userId,
      action: "invitation.created",
      entityType: "invitation",
      entityId: invitationId,
      summary: { expiresAt },
    });
  })();

  return { invitationUrlToken, userId, expiresAt };
}

export function activateInvitation(
  db: Database.Database,
  token: string,
  password: string,
): { userId: string; workspaceId: string } {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error("密码至少需要 12 个字符");
  const invitation = db.prepare(`
    SELECT i.id, i.user_id, i.expires_at, i.used_at, i.created_by, u.display_name, u.status
    FROM invitations i
    JOIN users u ON u.id = i.user_id
    WHERE i.token_hash = ?
  `).get(tokenHash(token)) as
    | {
        id: string;
        user_id: string;
        expires_at: string;
        used_at: string | null;
        created_by: string;
        display_name: string;
        status: UserStatus;
      }
    | undefined;
  if (!invitation) throw new Error("邀请链接无效");
  if (invitation.used_at) throw new Error("邀请链接已使用");
  if (new Date(invitation.expires_at).getTime() <= Date.now()) throw new Error("邀请链接已过期");
  if (invitation.status !== "invited") throw new Error("邀请账号状态无效");

  return db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET password_hash = ?, status = 'active', must_change_password = 0,
          password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hashPassword(password), invitation.user_id);
    db.prepare("UPDATE invitations SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL").run(invitation.id);
    const workspace = ensureWorkspaceForUser(db, {
      id: invitation.user_id,
      displayName: invitation.display_name,
    });
    writeAuditLog(db, {
      actorUserId: invitation.user_id,
      targetUserId: invitation.user_id,
      action: "invitation.activated",
      entityType: "user",
      entityId: invitation.user_id,
      summary: {},
    });
    return { userId: invitation.user_id, workspaceId: workspace.workspaceId };
  })();
}

export function getInvitationState(
  db: Database.Database,
  token: string,
): { valid: boolean; displayName?: string; email?: string; reason?: string } {
  const invitation = db.prepare(`
    SELECT i.expires_at, i.used_at, u.display_name, u.email, u.status
    FROM invitations i JOIN users u ON u.id = i.user_id
    WHERE i.token_hash = ?
  `).get(tokenHash(token)) as
    | { expires_at: string; used_at: string | null; display_name: string; email: string; status: UserStatus }
    | undefined;
  if (!invitation) return { valid: false, reason: "邀请链接无效" };
  if (invitation.used_at) return { valid: false, reason: "邀请链接已使用" };
  if (new Date(invitation.expires_at).getTime() <= Date.now()) return { valid: false, reason: "邀请链接已过期" };
  if (invitation.status !== "invited") return { valid: false, reason: "邀请账号状态无效" };
  return { valid: true, displayName: invitation.display_name, email: invitation.email };
}

export function setUserStatus(
  db: Database.Database,
  admin: AccessContext,
  targetUserId: string,
  status: "active" | "suspended",
): void {
  requireAdminContext(admin);
  const target = db.prepare("SELECT role, status FROM users WHERE id = ?").get(targetUserId) as
    | { role: "admin" | "user"; status: UserStatus }
    | undefined;
  if (!target || target.role !== "user") throw new Error("普通用户不存在");
  if (target.status === "invited") throw new Error("受邀用户尚未激活");

  db.transaction(() => {
    db.prepare("UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, targetUserId);
    let revokedSessions = 0;
    if (status === "suspended") {
      revokedSessions = Number(db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetUserId).changes);
    }
    writeAuditLog(db, {
      actorUserId: admin.userId,
      targetUserId,
      action: status === "suspended" ? "user.suspended" : "user.reactivated",
      entityType: "user",
      entityId: targetUserId,
      summary: { fromStatus: target.status, toStatus: status, revokedSessions },
    });
  })();
}

export function revokeUserSessions(
  db: Database.Database,
  admin: AccessContext,
  targetUserId: string,
): number {
  requireAdminContext(admin);
  const target = db.prepare("SELECT role FROM users WHERE id = ?").get(targetUserId) as { role: string } | undefined;
  if (!target || target.role !== "user") throw new Error("普通用户不存在");
  return db.transaction(() => {
    const revokedSessions = Number(db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetUserId).changes);
    writeAuditLog(db, {
      actorUserId: admin.userId,
      targetUserId,
      action: "sessions.revoked",
      entityType: "user",
      entityId: targetUserId,
      summary: { revokedSessions },
    });
    return revokedSessions;
  })();
}

export function resetUserPassword(
  db: Database.Database,
  admin: AccessContext,
  targetUserId: string,
  temporaryPassword: string,
): void {
  requireAdminContext(admin);
  if (temporaryPassword.length < MIN_PASSWORD_LENGTH) throw new Error("临时密码至少需要 12 个字符");
  const target = db.prepare("SELECT role FROM users WHERE id = ?").get(targetUserId) as { role: string } | undefined;
  if (!target || target.role !== "user") throw new Error("普通用户不存在");
  db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET password_hash = ?, must_change_password = 1,
          password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hashPassword(temporaryPassword), targetUserId);
    const revokedSessions = Number(db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetUserId).changes);
    writeAuditLog(db, {
      actorUserId: admin.userId,
      targetUserId,
      action: "password.reset",
      entityType: "user",
      entityId: targetUserId,
      summary: { revokedSessions },
    });
  })();
}

export function setWorkspaceQuota(
  db: Database.Database,
  admin: AccessContext,
  targetUserId: string,
  quotaBytes: number,
): void {
  requireAdminContext(admin);
  if (!Number.isSafeInteger(quotaBytes) || quotaBytes < 0) throw new Error("容量配额无效");
  const workspace = db.prepare("SELECT id FROM workspaces WHERE owner_user_id = ?").get(targetUserId) as
    | { id: string }
    | undefined;
  if (!workspace) throw new Error("用户学习空间不存在");
  db.transaction(() => {
    db.prepare("UPDATE workspaces SET storage_quota_bytes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      quotaBytes,
      workspace.id,
    );
    writeAuditLog(db, {
      actorUserId: admin.userId,
      targetUserId,
      action: "workspace.quota_updated",
      entityType: "workspace",
      entityId: workspace.id,
      summary: { quotaBytes },
    });
  })();
}

export function writeAuditLog(
  db: Database.Database,
  entry: {
    actorUserId: string;
    targetUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    summary?: AuditSummary;
  },
): void {
  const summary = sanitizeAuditSummary(entry.summary || {});
  db.prepare(`
    INSERT INTO audit_logs
      (actor_user_id, target_user_id, action, entity_type, entity_id, summary_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    entry.actorUserId,
    entry.targetUserId ?? null,
    entry.action,
    entry.entityType,
    entry.entityId ?? null,
    JSON.stringify(summary),
  );
}

function sanitizeAuditSummary(summary: AuditSummary): AuditSummary {
  const allowed = new Set(["fromStatus", "toStatus", "quotaBytes", "revokedSessions", "expiresAt"]);
  return Object.fromEntries(Object.entries(summary).filter(([key]) => allowed.has(key)));
}

export function listAdminUsers(db: Database.Database): AdminUserSummary[] {
  return db.prepare(`
    SELECT
      u.id, u.email, u.display_name, u.role, u.status, u.last_login_at, u.created_at,
      w.id AS workspace_id, w.storage_quota_bytes,
      COALESCE((SELECT SUM(a.size) FROM assets a WHERE a.workspace_id = w.id), 0) AS storage_used_bytes,
      COALESCE((SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id), 0) AS session_count
    FROM users u
    LEFT JOIN workspaces w ON w.owner_user_id = u.id
    ORDER BY CASE u.role WHEN 'admin' THEN 0 ELSE 1 END, u.created_at DESC
  `).all() as AdminUserSummary[];
}

export function getAdminUser(db: Database.Database, userId: string): AdminUserSummary | null {
  return listAdminUsers(db).find((user) => user.id === userId) ?? null;
}

export function listAuditLogs(db: Database.Database, limit = 100): AuditLogRow[] {
  return db.prepare(`
    SELECT
      l.id, l.actor_user_id, actor.display_name AS actor_name,
      l.target_user_id, target.display_name AS target_name,
      l.action, l.entity_type, l.entity_id, l.summary_json, l.created_at
    FROM audit_logs l
    JOIN users actor ON actor.id = l.actor_user_id
    LEFT JOIN users target ON target.id = l.target_user_id
    ORDER BY l.id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(500, limit))) as AuditLogRow[];
}
