import type Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { AccessContext, UserRole, UserStatus } from "./access-context";
import { SESSION_COOKIE } from "./auth-constants";
import { getDbHandle } from "./db";
import { ensureWorkspaceForUser } from "./repo/workspaces";

export { SESSION_COOKIE };

const SESSION_DAYS = 30;

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  must_change_password: number;
};

type LoginEnv = Record<string, string | undefined>;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, expectedHash] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHash) return false;

  const actual = Buffer.from(scryptSync(password, salt, 64));
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function getDefaultLoginConfig(env: LoginEnv = process.env): { email: string; password: string } | null {
  const email = env.APP_LOGIN_EMAIL || env.APP_BASIC_AUTH_USERNAME;
  const password = env.APP_LOGIN_PASSWORD || env.APP_BASIC_AUTH_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

function getAdminLoginConfig(env: LoginEnv): { email: string; password: string } | null {
  if (!env.APP_ADMIN_EMAIL || !env.APP_ADMIN_PASSWORD) return null;
  return { email: env.APP_ADMIN_EMAIL, password: env.APP_ADMIN_PASSWORD };
}

export function ensureBootstrapUsers(
  database: Database.Database = getDbHandle(),
  env: LoginEnv = process.env,
): void {
  const ordinary = getDefaultLoginConfig(env);
  const admin = getAdminLoginConfig(env);
  if (ordinary && admin && ordinary.email.trim().toLowerCase() === admin.email.trim().toLowerCase()) {
    throw new Error("Admin email must differ from ordinary user email");
  }

  database.transaction(() => {
    if (ordinary) {
      const email = ordinary.email.trim().toLowerCase();
      let user = database.prepare("SELECT id, display_name AS displayName FROM users WHERE email = ?").get(email) as
        | { id: string; displayName: string }
        | undefined;
      if (!user) {
        user = { id: randomUUID(), displayName: "ZGCA" };
        database.prepare(`
          INSERT INTO users (id, email, password_hash, display_name, role, status)
          VALUES (@id, @email, @passwordHash, @displayName, 'user', 'active')
        `).run({
          id: user.id,
          email,
          passwordHash: hashPassword(ordinary.password),
          displayName: user.displayName,
        });
      }
      ensureWorkspaceForUser(database, { id: user.id, displayName: user.displayName || "ZGCA" });
    }

    if (admin) {
      const email = admin.email.trim().toLowerCase();
      const existing = database.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (!existing) {
        database.prepare(`
          INSERT INTO users
            (id, email, password_hash, display_name, role, status, must_change_password)
          VALUES
            (@id, @email, @passwordHash, '管理员', 'admin', 'active', 1)
        `).run({ id: randomUUID(), email, passwordHash: hashPassword(admin.password) });
      }
    }

    const usersWithoutWorkspaces = database.prepare(`
      SELECT u.id, u.display_name AS displayName
      FROM users u
      LEFT JOIN workspaces w ON w.owner_user_id = u.id
      WHERE u.role = 'user' AND u.status IN ('active', 'suspended') AND w.id IS NULL
      ORDER BY u.created_at ASC, u.id ASC
    `).all() as Array<{ id: string; displayName: string }>;
    for (const user of usersWithoutWorkspaces) {
      ensureWorkspaceForUser(database, { id: user.id, displayName: user.displayName || "学习空间" });
    }
  })();
}

export function ensureDefaultUser(): void {
  ensureBootstrapUsers();
}

export function authenticateUser(
  email: string,
  password: string,
  input: { ipHint?: string } = {},
  database: Database.Database = getDbHandle(),
): AccessContext | null {
  ensureBootstrapUsers(database);
  const normalizedEmail = email.trim().toLowerCase();
  const ipHint = input.ipHint || "";
  if (isLoginRateLimited(database, normalizedEmail, ipHint)) return null;

  const user = database.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail) as UserRow | undefined;
  const succeeded = Boolean(user && user.status === "active" && verifyPassword(password, user.password_hash));
  database.prepare(`
    INSERT INTO login_attempts (email_hint, ip_hint, succeeded)
    VALUES (?, ?, ?)
  `).run(normalizedEmail, ipHint, succeeded ? 1 : 0);
  if (!succeeded || !user) return null;

  database.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
  const workspace = database.prepare("SELECT id FROM workspaces WHERE owner_user_id = ?").get(user.id) as
    | { id: string }
    | undefined;

  return {
    userId: user.id,
    email: user.email,
    displayName: user.display_name || user.email,
    role: user.role,
    status: user.status,
    workspaceId: workspace?.id ?? null,
    mustChangePassword: Boolean(user.must_change_password),
  };
}

export function createSession(
  input: { userId: string; userAgent?: string; ipHint?: string },
  database: Database.Database = getDbHandle(),
): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  database.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_hint)
    VALUES (@id, @userId, @tokenHash, @expiresAt, @userAgent, @ipHint)
  `).run({
    id: randomUUID(),
    userId: input.userId,
    tokenHash: hashToken(token),
    expiresAt: expiresAt.toISOString(),
    userAgent: input.userAgent || "",
    ipHint: input.ipHint || "",
  });

  return { token, expiresAt };
}

export function getSessionContext(
  token: string | undefined,
  database: Database.Database = getDbHandle(),
): AccessContext | null {
  if (!token) return null;

  const row = database.prepare(`
    SELECT
      u.id AS userId,
      u.email,
      u.display_name AS displayName,
      u.role,
      u.status,
      u.must_change_password AS mustChangePassword,
      w.id AS workspaceId,
      s.expires_at AS expiresAt
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN workspaces w ON w.owner_user_id = u.id
    WHERE s.token_hash = ?
  `).get(hashToken(token)) as
    | (AccessContext & { expiresAt: string })
    | undefined;

  if (!row || row.status !== "active" || new Date(row.expiresAt).getTime() <= Date.now()) return null;
  return {
    userId: row.userId,
    email: row.email,
    displayName: row.displayName || row.email,
    role: row.role,
    status: row.status,
    workspaceId: row.workspaceId,
    mustChangePassword: Boolean(row.mustChangePassword),
  };
}

export function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  database: Database.Database = getDbHandle(),
): void {
  if (newPassword.length < 12) throw new Error("新密码至少需要 12 个字符");
  const user = database.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as
    | { password_hash: string }
    | undefined;
  if (!user || !verifyPassword(currentPassword, user.password_hash)) throw new Error("当前密码不正确");
  database.transaction(() => {
    database.prepare(`
      UPDATE users
      SET password_hash = ?, must_change_password = 0,
          password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hashPassword(newPassword), userId);
    database.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  })();
}

/** @deprecated Use getSessionContext. */
export function getSessionUser(
  token: string | undefined,
  database: Database.Database = getDbHandle(),
): { id: string; email: string; displayName: string } | null {
  const context = getSessionContext(token, database);
  if (!context) return null;
  return { id: context.userId, email: context.email, displayName: context.displayName };
}

export function deleteSession(token: string | undefined, database: Database.Database = getDbHandle()): void {
  if (!token) return;
  database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

function isLoginRateLimited(database: Database.Database, email: string, ipHint: string): boolean {
  const row = database.prepare(`
    SELECT COUNT(*) AS count
    FROM login_attempts
    WHERE email_hint = ? AND ip_hint = ? AND succeeded = 0
      AND created_at >= datetime('now', '-15 minutes')
  `).get(email, ipHint) as { count: number };
  return row.count >= 5;
}
