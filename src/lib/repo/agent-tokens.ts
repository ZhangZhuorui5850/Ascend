import type Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AgentContext } from "../agent/context";
import type { AccessContext } from "../access-context";
import { writeAuditLog } from "../audit";

const TOKEN_PREFIX = "ascend_mcp_";
const MAX_ACTIVE_TOKENS = 5;
const TOKEN_LIFETIME_DAYS = 90;

export type AgentTokenRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  expiresAt: string;
  lastUsedAt: string | null;
  createdAt: string;
};

function hashAgentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function listAgentTokens(db: Database.Database, userId: string): AgentTokenRow[] {
  return db
    .prepare(
      `
        SELECT
          id,
          name,
          token_prefix AS tokenPrefix,
          expires_at AS expiresAt,
          last_used_at AS lastUsedAt,
          created_at AS createdAt
        FROM agent_tokens
        WHERE user_id = ? AND revoked_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP
        ORDER BY created_at DESC
      `,
    )
    .all(userId) as AgentTokenRow[];
}

export function createAgentToken(
  db: Database.Database,
  context: AccessContext & { workspaceId: string },
  input: { name: string },
): { token: string; record: AgentTokenRow } {
  const name = input.name.trim().slice(0, 40);
  if (!name) throw new Error("令牌名称必填");
  if (listAgentTokens(db, context.userId).length >= MAX_ACTIVE_TOKENS) {
    throw new Error(`每个账号最多保留 ${MAX_ACTIVE_TOKENS} 个有效 Agent 令牌`);
  }

  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const id = randomUUID();
  const tokenPrefix = `${token.slice(0, TOKEN_PREFIX.length + 6)}…`;
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.transaction(() => {
    db.prepare(
      `
        INSERT INTO agent_tokens (id, user_id, name, token_prefix, token_hash, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(id, context.userId, name, tokenPrefix, hashAgentToken(token), expiresAt);
    writeAuditLog(db, {
      actorUserId: context.userId,
      targetUserId: context.userId,
      action: "agent.token.created",
      entityType: "agent_token",
      entityId: id,
    });
  })();

  const record = listAgentTokens(db, context.userId).find((item) => item.id === id);
  if (!record) throw new Error("Agent 令牌创建失败");
  return { token, record };
}

export function revokeAgentToken(
  db: Database.Database,
  context: AccessContext & { workspaceId: string },
  tokenId: string,
): void {
  db.transaction(() => {
    const update = db
      .prepare(
        `
          UPDATE agent_tokens SET revoked_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ? AND revoked_at IS NULL
        `,
      )
      .run(tokenId, context.userId);
    if (!update.changes) throw new Error("Agent 令牌不存在或已撤销");
    writeAuditLog(db, {
      actorUserId: context.userId,
      targetUserId: context.userId,
      action: "agent.token.revoked",
      entityType: "agent_token",
      entityId: tokenId,
    });
  })();
}

export function authenticateAgentToken(db: Database.Database, authorization: string | null): AgentContext {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match || !match[1].startsWith(TOKEN_PREFIX)) throw new Error("Agent token required");
  const tokenHash = hashAgentToken(match[1]);
  const row = db
    .prepare(
      `
        SELECT
          t.id AS tokenId,
          u.id AS userId,
          u.email,
          u.display_name AS displayName,
          u.role,
          u.status,
          u.must_change_password AS mustChangePassword,
          w.id AS workspaceId
        FROM agent_tokens t
        JOIN users u ON u.id = t.user_id
        JOIN workspaces w ON w.owner_user_id = u.id
        WHERE t.token_hash = ?
          AND t.revoked_at IS NULL
          AND datetime(t.expires_at) > CURRENT_TIMESTAMP
          AND u.role = 'user'
          AND u.status = 'active'
      `,
    )
    .get(tokenHash) as
    | {
        tokenId: string;
        userId: string;
        email: string;
        displayName: string;
        role: "user";
        status: "active";
        mustChangePassword: number;
        workspaceId: string;
      }
    | undefined;
  if (!row || row.mustChangePassword) throw new Error("Agent token is invalid or expired");

  db.prepare(
    `
      UPDATE agent_tokens SET last_used_at = CURRENT_TIMESTAMP
      WHERE id = ? AND (last_used_at IS NULL OR datetime(last_used_at) < datetime('now', '-1 hour'))
    `,
  ).run(row.tokenId);

  return {
    userId: row.userId,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    workspaceId: row.workspaceId,
    mustChangePassword: false,
  };
}
