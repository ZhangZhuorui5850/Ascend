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
