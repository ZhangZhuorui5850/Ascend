import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE } from "./auth-constants";
import { getDbHandle } from "./db";

export { SESSION_COOKIE };

const SESSION_DAYS = 30;

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
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

export function ensureDefaultUser(): void {
  const config = getDefaultLoginConfig();
  if (!config) return;

  const db = getDbHandle();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(config.email);
  if (existing) return;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name)
    VALUES (@id, @email, @passwordHash, @displayName)
  `).run({
    id: randomUUID(),
    email: config.email,
    passwordHash: hashPassword(config.password),
    displayName: "ZGCA",
  });
}

export function authenticateUser(email: string, password: string): { id: string; email: string; displayName: string } | null {
  ensureDefaultUser();
  const user = getDbHandle().prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) return null;

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name || user.email,
  };
}

export function createSession(input: { userId: string; userAgent?: string; ipHint?: string }): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  getDbHandle().prepare(`
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

export function getSessionUser(token: string | undefined): { id: string; email: string; displayName: string } | null {
  if (!token) return null;

  const row = getDbHandle().prepare(`
    SELECT u.id, u.email, u.display_name AS displayName, s.expires_at AS expiresAt
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(hashToken(token)) as
    | { id: string; email: string; displayName: string; expiresAt: string }
    | undefined;

  if (!row || new Date(row.expiresAt).getTime() <= Date.now()) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName || row.email,
  };
}

export function deleteSession(token: string | undefined): void {
  if (!token) return;
  getDbHandle().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}
