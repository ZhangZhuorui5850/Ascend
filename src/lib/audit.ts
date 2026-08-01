import type Database from "better-sqlite3";

type AuditSummary = Record<string, unknown>;

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
  const allowed = new Set([
    "fromStatus",
    "toStatus",
    "quotaBytes",
    "revokedSessions",
    "revokedAgentTokens",
    "expiresAt",
    "cohort",
    "consentVersion",
  ]);
  return Object.fromEntries(Object.entries(summary).filter(([key]) => allowed.has(key)));
}
