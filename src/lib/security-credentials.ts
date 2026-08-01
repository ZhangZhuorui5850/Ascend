import type Database from "better-sqlite3";

export type RevokedCredentials = {
  revokedSessions: number;
  revokedAgentTokens: number;
};

/** 在调用方事务内同时终止浏览器会话和长期 Agent 访问。 */
export function revokeAllCredentials(
  db: Database.Database,
  userId: string,
): RevokedCredentials {
  const revokedSessions = Number(
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId).changes,
  );
  const revokedAgentTokens = Number(
    db.prepare(`
      UPDATE agent_tokens
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND revoked_at IS NULL
    `).run(userId).changes,
  );
  return { revokedSessions, revokedAgentTokens };
}
