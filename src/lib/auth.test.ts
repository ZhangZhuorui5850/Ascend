import { describe, expect, it } from "vitest";
import {
  createSession,
  changePassword,
  authenticateUser,
  ensureBootstrapUsers,
  findTokenForUser,
  getDefaultLoginConfig,
  getSessionContext,
  hashPassword,
  listAccountSummaries,
  listUserSessions,
  mergeAccountTokens,
  revokeUserSession,
  verifyPassword,
} from "./auth";
import { MAX_DEVICE_ACCOUNTS } from "./auth-constants";
import { assertAdmin, assertWorkspaceAccess } from "./request-auth";
import { createTestDb, createTestWorkspace } from "./repo/testing";

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong password", () => {
    const stored = hashPassword("correct-horse-battery-staple", "fixed-test-salt");

    expect(verifyPassword("correct-horse-battery-staple", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("stores algorithm and salt with the hash", () => {
    const stored = hashPassword("secret", "fixed-test-salt");

    expect(stored).toMatch(/^scrypt\$fixed-test-salt\$/);
  });
});

describe("default login config", () => {
  it("falls back to legacy basic auth environment variables", () => {
    expect(getDefaultLoginConfig({
      APP_BASIC_AUTH_USERNAME: "legacy@example.com",
      APP_BASIC_AUTH_PASSWORD: "legacy-password",
    })).toEqual({
      email: "legacy@example.com",
      password: "legacy-password",
    });
  });
});

describe("access context", () => {
  it("returns the active ordinary user's workspace from a valid session", () => {
    const db = createTestDb();
    const { userId, workspaceId } = createTestWorkspace(db, {
      userId: "user-1",
      email: "user@example.com",
      displayName: "普通用户",
    });
    const session = createSession({ userId }, db);

    expect(getSessionContext(session.token, db)).toMatchObject({
      userId,
      email: "user@example.com",
      displayName: "普通用户",
      role: "user",
      status: "active",
      workspaceId,
      mustChangePassword: false,
    });
  });

  it("rejects a suspended user's existing session", () => {
    const db = createTestDb();
    const { userId } = createTestWorkspace(db, { userId: "user-1", email: "user@example.com" });
    const session = createSession({ userId }, db);
    db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(userId);

    expect(getSessionContext(session.token, db)).toBeNull();
  });

  it("keeps Admin separate from ordinary workspaces", () => {
    const db = createTestDb();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, role, status)
      VALUES ('admin-1', 'admin@example.com', 'hash', '管理员', 'admin', 'active')
    `).run();
    const session = createSession({ userId: "admin-1" }, db);
    const context = getSessionContext(session.token, db)!;

    expect(context).toMatchObject({ role: "admin", workspaceId: null });
    expect(assertAdmin(context)).toBe(context);
    expect(() => assertWorkspaceAccess(context)).toThrow("Learning workspace required");
  });

  it("prevents an ordinary user from using Admin access", () => {
    const db = createTestDb();
    const { userId } = createTestWorkspace(db, { userId: "user-1", email: "user@example.com" });
    const context = getSessionContext(createSession({ userId }, db).token, db)!;

    expect(() => assertAdmin(context)).toThrow("Administrator access required");
  });

  it("lists and revokes only the current user's device sessions", () => {
    const db = createTestDb();
    const alpha = createTestWorkspace(db, { email: "alpha-devices@example.com" });
    const beta = createTestWorkspace(db, { email: "beta-devices@example.com" });
    createSession({ userId: alpha.userId, userAgent: "Alpha browser", ipHint: "192.0.2.1" }, db);
    const betaSession = createSession({ userId: beta.userId, userAgent: "Beta browser" }, db);

    const sessions = listUserSessions(alpha.userId, db);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ userAgent: "Alpha browser", ipHint: "192.0.2.1" });
    expect(revokeUserSession(alpha.userId, sessions[0].id, db)).toBe(true);
    expect(revokeUserSession(alpha.userId, listUserSessions(beta.userId, db)[0].id, db)).toBe(false);
    expect(getSessionContext(betaSession.token, db)).not.toBeNull();
  });
});

describe("device accounts (multi-session quick switch)", () => {
  it("puts the active token first, dedupes by user keeping the newest, and drops invalid tokens", () => {
    const db = createTestDb();
    const alpha = createTestWorkspace(db, { email: "alpha@example.com" });
    const beta = createTestWorkspace(db, { email: "beta@example.com" });
    const alphaOld = createSession({ userId: alpha.userId }, db);
    const alphaNew = createSession({ userId: alpha.userId }, db);
    const betaSession = createSession({ userId: beta.userId }, db);

    const merged = mergeAccountTokens(alphaNew.token, ["broken-token", betaSession.token, alphaOld.token], db);

    expect(merged).toEqual([alphaNew.token, betaSession.token]);
  });

  it("caps the device account list", () => {
    const db = createTestDb();
    const tokens = Array.from({ length: MAX_DEVICE_ACCOUNTS + 2 }, (_, index) => {
      const { userId } = createTestWorkspace(db, { email: `user-${index}@example.com` });
      return createSession({ userId }, db).token;
    });

    expect(mergeAccountTokens(tokens[0], tokens.slice(1), db)).toHaveLength(MAX_DEVICE_ACCOUNTS);
  });

  it("summarises accounts in token order with avatar fields", () => {
    const db = createTestDb();
    const alpha = createTestWorkspace(db, { email: "alpha@example.com", displayName: "甲" });
    const beta = createTestWorkspace(db, { email: "beta@example.com", displayName: "乙" });
    const tokens = [createSession({ userId: alpha.userId }, db).token, createSession({ userId: beta.userId }, db).token];

    const summaries = listAccountSummaries(tokens, db);

    expect(summaries.map((account) => account.email)).toEqual(["alpha@example.com", "beta@example.com"]);
    expect(summaries[0]).toMatchObject({
      userId: alpha.userId,
      displayName: "甲",
      role: "user",
      avatarKind: "seal",
      avatarColor: "cinnabar",
    });
  });

  it("finds the token for a target user and rejects unknown users", () => {
    const db = createTestDb();
    const alpha = createTestWorkspace(db, { email: "alpha@example.com" });
    const beta = createTestWorkspace(db, { email: "beta@example.com" });
    const tokens = [createSession({ userId: alpha.userId }, db).token, createSession({ userId: beta.userId }, db).token];

    expect(findTokenForUser(tokens, beta.userId, db)).toBe(tokens[1]);
    expect(findTokenForUser(tokens, "missing-user", db)).toBeNull();
  });
});

describe("bootstrap users", () => {
  it("creates a separate ordinary user and bootstrap Admin", () => {
    const db = createTestDb();

    ensureBootstrapUsers(db, {
      APP_LOGIN_EMAIL: "owner@example.com",
      APP_LOGIN_PASSWORD: "owner-password",
      APP_ADMIN_EMAIL: "admin@example.com",
      APP_ADMIN_PASSWORD: "admin-password",
    });

    expect(db.prepare("SELECT role, status FROM users WHERE email = 'owner@example.com'").get()).toEqual({
      role: "user",
      status: "active",
    });
    expect(db.prepare("SELECT role, status, must_change_password FROM users WHERE email = 'admin@example.com'").get()).toEqual({
      role: "admin",
      status: "active",
      must_change_password: 1,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM workspaces WHERE owner_user_id IS NOT NULL").get()).toEqual({
      count: 1,
    });
  });

  it("uses the email local-part as the bootstrap ordinary user's display name", () => {
    const db = createTestDb();

    ensureBootstrapUsers(db, {
      APP_LOGIN_EMAIL: "Zhuorui@Example.com",
      APP_LOGIN_PASSWORD: "owner-password",
    });

    expect(db.prepare("SELECT display_name FROM users WHERE email = 'zhuorui@example.com'").get()).toEqual({
      display_name: "zhuorui",
    });
  });

  it("rejects using the same email for Admin and the ordinary user", () => {
    const db = createTestDb();

    expect(() =>
      ensureBootstrapUsers(db, {
        APP_LOGIN_EMAIL: "same@example.com",
        APP_LOGIN_PASSWORD: "owner-password",
        APP_ADMIN_EMAIL: "same@example.com",
        APP_ADMIN_PASSWORD: "admin-password",
      }),
    ).toThrow("Admin email must differ from ordinary user email");
  });

  it("repairs workspaces for active historical ordinary users", () => {
    const db = createTestDb();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, role, status)
      VALUES ('historical-user', 'history@example.com', 'hash', '历史用户', 'user', 'active')
    `).run();

    ensureBootstrapUsers(db, {
      APP_LOGIN_EMAIL: "owner@example.com",
      APP_LOGIN_PASSWORD: "owner-password",
    });

    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM users u JOIN workspaces w ON w.owner_user_id = u.id
      WHERE u.role = 'user' AND u.status = 'active'
    `).get()).toEqual({ count: 2 });
  });

  it("forces a bootstrap password change and revokes existing sessions when it is completed", () => {
    const db = createTestDb();
    ensureBootstrapUsers(db, {
      APP_ADMIN_EMAIL: "admin@example.com",
      APP_ADMIN_PASSWORD: "bootstrap-password",
    });
    const admin = authenticateUser("admin@example.com", "bootstrap-password", {}, db)!;
    const oldSession = createSession({ userId: admin.userId }, db);

    expect(admin.mustChangePassword).toBe(true);
    changePassword(admin.userId, "bootstrap-password", "zhang...", db);
    expect(getSessionContext(oldSession.token, db)).toBeNull();
    expect(authenticateUser("admin@example.com", "zhang...", {}, db)).toMatchObject({
      mustChangePassword: false,
    });
  });

  it("rejects an empty new password", () => {
    const db = createTestDb();
    const { userId } = createTestWorkspace(db, { email: "user@example.com" });
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword("current-password"), userId);

    expect(() => changePassword(userId, "current-password", "", db)).toThrow("新密码不能为空");
  });
});

describe("login throttling", () => {
  it("blocks the same email and IP for 15 minutes after five failures", () => {
    const db = createTestDb();
    const { userId } = createTestWorkspace(db, { userId: "user-1", email: "user@example.com" });
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword("correct-password"), userId);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(authenticateUser("user@example.com", "wrong-password", { ipHint: "203.0.113.10" }, db)).toBeNull();
    }

    expect(authenticateUser("user@example.com", "correct-password", { ipHint: "203.0.113.10" }, db)).toBeNull();
    expect(authenticateUser("user@example.com", "correct-password", { ipHint: "203.0.113.11" }, db)).not.toBeNull();
  });
});
