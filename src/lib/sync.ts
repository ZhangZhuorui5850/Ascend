import type Database from "better-sqlite3";
import { getDb } from "./db";

export type Device = { id: string; name: string; lastSeenAt: string; lastPulledSeq: number };

export type SaveDraftInput = {
  scopeType: string;
  scopeId: string;
  field: string;
  content: string;
  baseVersion: number;
  deviceId?: string;
  opId: string;
};

export type DraftResult = { id: string; content: string; version: number; updatedAt: string };
export type SyncPull = { latestSeq: number; changes: Array<Record<string, unknown>> };
export type DraftConflict = {
  id: string;
  scopeType: string;
  scopeId: string;
  field: string;
  baseVersion: number;
  local: { content?: string };
  incoming: { content?: string; version?: number };
  status: string;
};

export class SyncConflictError extends Error {
  status = 409;
}

export function registerDevice(input: { id?: string; name?: string }): Device {
  return registerDeviceWithDb(getDb(), input);
}

export function registerDeviceWithDb(database: Database.Database, input: { id?: string; name?: string }): Device {
  const id = input.id || crypto.randomUUID();
  database.prepare(`
    INSERT INTO devices (id, name, last_seen_at)
    VALUES (@id, @name, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      last_seen_at = CURRENT_TIMESTAMP
  `).run({ id, name: input.name || "" });

  return database.prepare(`
    SELECT id, name, last_seen_at AS lastSeenAt, last_pulled_seq AS lastPulledSeq
    FROM devices
    WHERE id = ?
  `).get(id) as Device;
}

export function saveDraft(input: SaveDraftInput): DraftResult {
  return saveDraftWithDb(getDb(), input);
}

export function saveDraftWithDb(database: Database.Database, input: SaveDraftInput): DraftResult {
  const id = `${input.scopeType}:${input.scopeId}:${input.field}`;
  const existingChange = database
    .prepare("SELECT snapshot_json FROM entity_changes WHERE op_id = ?")
    .get(input.opId) as { snapshot_json: string } | undefined;
  if (existingChange) return JSON.parse(existingChange.snapshot_json) as DraftResult;

  const existingDraft = database.prepare("SELECT version FROM drafts WHERE id = ?").get(id) as { version: number } | undefined;
  if (existingDraft && input.baseVersion > 0 && existingDraft.version > input.baseVersion) {
    recordDraftConflict(database, {
      id,
      baseVersion: input.baseVersion,
      localJson: JSON.stringify({ content: input.content, baseVersion: input.baseVersion, deviceId: input.deviceId || null }),
      incomingJson: JSON.stringify(database.prepare(`
        SELECT id, content, version, updated_at AS updatedAt
        FROM drafts
        WHERE id = ?
      `).get(id)),
    });
    throw new SyncConflictError("Draft conflict");
  }

  const transaction = database.transaction(() => {
    database.prepare(`
      INSERT INTO drafts (id, scope_type, scope_id, field, content, base_version, version, device_id, updated_at)
      VALUES (@id, @scopeType, @scopeId, @field, @content, @baseVersion, 1, @deviceId, CURRENT_TIMESTAMP)
      ON CONFLICT(scope_type, scope_id, field) DO UPDATE SET
        content = excluded.content,
        base_version = excluded.base_version,
        version = drafts.version + 1,
        device_id = excluded.device_id,
        updated_at = CURRENT_TIMESTAMP
    `).run({ ...input, id, deviceId: input.deviceId || null });

    const row = database.prepare(`
      SELECT id, content, version, updated_at AS updatedAt
      FROM drafts
      WHERE id = ?
    `).get(id) as DraftResult;

    database.prepare(`
      INSERT OR IGNORE INTO entity_changes
        (op_id, entity_type, entity_id, op, base_version, patch_json, snapshot_json, device_id)
      VALUES
        (@opId, 'draft', @id, 'upsert', @baseVersion, @patchJson, @snapshotJson, @deviceId)
    `).run({
      opId: input.opId,
      id,
      baseVersion: input.baseVersion,
      patchJson: JSON.stringify({ content: input.content }),
      snapshotJson: JSON.stringify(row),
      deviceId: input.deviceId || null,
    });

    return row;
  });

  return transaction();
}

function recordDraftConflict(
  database: Database.Database,
  input: { id: string; baseVersion: number; localJson: string; incomingJson: string },
) {
  database.prepare(`
    INSERT INTO conflicts (id, entity_type, entity_id, base_version, local_json, incoming_json, status)
    VALUES (@conflictId, 'draft', @id, @baseVersion, @localJson, @incomingJson, 'open')
    ON CONFLICT(id) DO UPDATE SET
      local_json = excluded.local_json,
      incoming_json = excluded.incoming_json,
      status = 'open'
  `).run({
    conflictId: `draft-conflict:${input.id}:${input.baseVersion}`,
    ...input,
  });
}

export function pullChanges(sinceSeq: number): SyncPull {
  return pullChangesWithDb(getDb(), sinceSeq);
}

export function pullChangesWithDb(database: Database.Database, sinceSeq: number): SyncPull {
  const changes = database.prepare(`
    SELECT seq, op_id, entity_type, entity_id, op, base_version, patch_json, snapshot_json, device_id, created_at
    FROM entity_changes
    WHERE seq > ?
    ORDER BY seq ASC
    LIMIT 500
  `).all(sinceSeq) as Array<Record<string, unknown>>;
  const latestSeq = changes.length ? Number(changes[changes.length - 1].seq) : sinceSeq;
  return { latestSeq, changes };
}

export function listOpenConflicts(input: { scopeType: string; scopeId: string }): DraftConflict[] {
  return listOpenConflictsWithDb(getDb(), input);
}

export function listOpenConflictsWithDb(
  database: Database.Database,
  input: { scopeType: string; scopeId: string },
): DraftConflict[] {
  const prefix = `${input.scopeType}:${input.scopeId}:`;
  const rows = database.prepare(`
    SELECT id, entity_id, base_version, local_json, incoming_json, status
    FROM conflicts
    WHERE entity_type = 'draft'
      AND entity_id LIKE ?
      AND status = 'open'
    ORDER BY id ASC
  `).all(`${prefix}%`) as Array<{
    id: string;
    entity_id: string;
    base_version: number;
    local_json: string;
    incoming_json: string;
    status: string;
  }>;

  return rows.map((row) => {
    const [scopeType, scopeId, field] = row.entity_id.split(":");
    return {
      id: row.id,
      scopeType,
      scopeId,
      field,
      baseVersion: row.base_version,
      local: JSON.parse(row.local_json),
      incoming: JSON.parse(row.incoming_json),
      status: row.status,
    };
  });
}

export function resolveConflict(input: { conflictId: string; content?: string; deviceId?: string; opId?: string }) {
  return resolveConflictWithDb(getDb(), input);
}

export function resolveConflictWithDb(
  database: Database.Database,
  input: { conflictId: string; content?: string; deviceId?: string; opId?: string },
) {
  const conflict = database.prepare(`
    SELECT id, entity_id, incoming_json
    FROM conflicts
    WHERE id = ? AND entity_type = 'draft' AND status = 'open'
  `).get(input.conflictId) as { id: string; entity_id: string; incoming_json: string } | undefined;
  if (!conflict) throw new Error("Conflict not found");

  const [scopeType, scopeId, field] = conflict.entity_id.split(":");
  const incoming = JSON.parse(conflict.incoming_json) as { content?: string; version?: number };
  const content = input.content ?? incoming.content ?? "";
  const transaction = database.transaction(() => {
    const draft = saveDraftWithDb(database, {
      scopeType,
      scopeId,
      field,
      content,
      baseVersion: Number(incoming.version ?? 0),
      deviceId: input.deviceId,
      opId: input.opId || crypto.randomUUID(),
    });
    database.prepare("UPDATE conflicts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?").run(conflict.id);
    return { status: "resolved", draft };
  });

  return transaction();
}
