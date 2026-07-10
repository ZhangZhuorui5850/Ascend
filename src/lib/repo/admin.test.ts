import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AccessContext } from "../access-context";
import { createSession, getSessionContext, verifyPassword } from "../auth";
import {
  activateInvitation,
  createInvitation,
  resetUserPassword,
  revokeUserSessions,
  setUserStatus,
  writeAuditLog,
} from "./admin";
import { createTestDb, createTestWorkspace } from "./testing";

function createAdmin(db: ReturnType<typeof createTestDb>): AccessContext & { role: "admin" } {
  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, role, status)
    VALUES ('admin-1', 'admin@example.com', 'hash', '管理员', 'admin', 'active')
  `).run();
  return {
    userId: "admin-1",
    email: "admin@example.com",
    displayName: "管理员",
    role: "admin",
    status: "active",
    workspaceId: null,
  };
}

describe("Admin invitation lifecycle", () => {
  it("stores only a 24-hour, one-time token hash and activates a personal workspace", () => {
    const db = createTestDb();
    const admin = createAdmin(db);
    const invitation = createInvitation(db, admin, {
      email: "Friend@Example.com",
      displayName: "朋友",
    });

    const row = db.prepare("SELECT token_hash, expires_at FROM invitations WHERE user_id = ?").get(invitation.userId) as {
      token_hash: string;
      expires_at: string;
    };
    expect(row.token_hash).toBe(createHash("sha256").update(invitation.invitationUrlToken).digest("hex"));
    expect(row.token_hash).not.toContain(invitation.invitationUrlToken);
    expect(new Date(row.expires_at).getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(new Date(row.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);

    const activated = activateInvitation(db, invitation.invitationUrlToken, "a-secure-password");
    expect(activated.userId).toBe(invitation.userId);
    expect(activated.workspaceId).toBeTruthy();
    expect(db.prepare("SELECT status FROM users WHERE id = ?").get(invitation.userId)).toEqual({ status: "active" });
    expect(() => activateInvitation(db, invitation.invitationUrlToken, "another-password")).toThrow("已使用");
  });

  it("rejects duplicate email, expired tokens, short passwords, and ordinary callers", () => {
    const db = createTestDb();
    const admin = createAdmin(db);
    const ordinary = createTestWorkspace(db, { email: "ordinary@example.com" });
    const ordinaryContext: AccessContext = {
      userId: ordinary.userId,
      email: "ordinary@example.com",
      displayName: "普通用户",
      role: "user",
      status: "active",
      workspaceId: ordinary.workspaceId,
    };
    const invitation = createInvitation(db, admin, { email: "new@example.com", displayName: "新用户" });

    expect(() => createInvitation(db, admin, { email: "NEW@example.com", displayName: "重复" })).toThrow("已存在");
    expect(() => createInvitation(db, ordinaryContext, { email: "blocked@example.com", displayName: "越权" })).toThrow(
      "管理员",
    );
    expect(() => activateInvitation(db, invitation.invitationUrlToken, "too-short")).toThrow("12");
    db.prepare("UPDATE invitations SET expires_at = datetime('now', '-1 minute') WHERE user_id = ?").run(invitation.userId);
    expect(() => activateInvitation(db, invitation.invitationUrlToken, "a-secure-password")).toThrow("已过期");
  });
});

describe("Admin user lifecycle", () => {
  it("revokes sessions on suspension and password reset; reactivation restores no old session", () => {
    const db = createTestDb();
    const admin = createAdmin(db);
    const target = createTestWorkspace(db, { email: "target@example.com" });
    const first = createSession({ userId: target.userId }, db);

    setUserStatus(db, admin, target.userId, "suspended");
    expect(getSessionContext(first.token, db)).toBeNull();
    setUserStatus(db, admin, target.userId, "active");
    expect(getSessionContext(first.token, db)).toBeNull();

    const second = createSession({ userId: target.userId }, db);
    resetUserPassword(db, admin, target.userId, "temporary-password");
    expect(getSessionContext(second.token, db)).toBeNull();
    const user = db.prepare("SELECT password_hash, must_change_password FROM users WHERE id = ?").get(target.userId) as {
      password_hash: string;
      must_change_password: number;
    };
    expect(verifyPassword("temporary-password", user.password_hash)).toBe(true);
    expect(user.must_change_password).toBe(1);
  });

  it("revokes all target sessions and records only allowlisted audit summary fields", () => {
    const db = createTestDb();
    const admin = createAdmin(db);
    const target = createTestWorkspace(db, { email: "sessions@example.com" });
    createSession({ userId: target.userId }, db);
    createSession({ userId: target.userId }, db);

    expect(revokeUserSessions(db, admin, target.userId)).toBe(2);
    writeAuditLog(db, {
      actorUserId: admin.userId,
      targetUserId: target.userId,
      action: "security.test",
      entityType: "user",
      entityId: target.userId,
      summary: { revokedSessions: 2, password: "must-not-leak", token: "must-not-leak" },
    });

    const summaries = db.prepare("SELECT summary_json FROM audit_logs ORDER BY id DESC LIMIT 1").get() as {
      summary_json: string;
    };
    expect(JSON.parse(summaries.summary_json)).toEqual({ revokedSessions: 2 });
  });
});
