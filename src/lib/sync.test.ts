import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runMigrations } from "./migrations";
import {
  listConflictHistoryWithDb,
  listOpenConflictsWithDb,
  pruneResolvedConflictsWithDb,
  pullChangesWithDb,
  registerDeviceWithDb,
  resolveConflictWithDb,
  saveDraftWithDb,
} from "./sync";

describe("sync foundation", () => {
  it("registers devices and records draft changes", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    const device = registerDeviceWithDb(db, { id: "device-1", name: "MacBook" });
    const draft = saveDraftWithDb(db, {
      scopeType: "day",
      scopeId: "2026-07-07",
      field: "diary",
      content: "PCA today",
      baseVersion: 0,
      deviceId: device.id,
      opId: "op-1",
    });
    const pulled = pullChangesWithDb(db, 0);

    expect(device).toMatchObject({ id: "device-1", name: "MacBook" });
    expect(draft).toMatchObject({ version: 1, content: "PCA today" });
    expect(pulled.changes).toHaveLength(1);
    expect(pulled.latestSeq).toBe(1);
  });

  it("dedupes retried draft operations by op id before mutating drafts", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    const first = saveDraftWithDb(db, {
      scopeType: "day",
      scopeId: "2026-07-07",
      field: "diary",
      content: "first",
      baseVersion: 0,
      deviceId: "device-1",
      opId: "op-1",
    });
    const retry = saveDraftWithDb(db, {
      scopeType: "day",
      scopeId: "2026-07-07",
      field: "diary",
      content: "retry should not win",
      baseVersion: 0,
      deviceId: "device-1",
      opId: "op-1",
    });
    const draft = db.prepare("SELECT content, version FROM drafts WHERE id = ?").get("day:2026-07-07:diary");
    const pulled = pullChangesWithDb(db, 0);

    expect(first).toMatchObject({ content: "first", version: 1 });
    expect(retry).toMatchObject({ content: "first", version: 1 });
    expect(draft).toMatchObject({ content: "first", version: 1 });
    expect(pulled.changes).toHaveLength(1);
  });

  it("rejects stale draft writes when a base version is supplied", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    saveDraftWithDb(db, {
      scopeType: "day",
      scopeId: "2026-07-07",
      field: "summary",
      content: "v1",
      baseVersion: 0,
      deviceId: "device-1",
      opId: "op-1",
    });
    saveDraftWithDb(db, {
      scopeType: "day",
      scopeId: "2026-07-07",
      field: "summary",
      content: "v2",
      baseVersion: 1,
      deviceId: "device-1",
      opId: "op-2",
    });

    expect(() =>
      saveDraftWithDb(db, {
        scopeType: "day",
        scopeId: "2026-07-07",
        field: "summary",
        content: "stale",
        baseVersion: 1,
        deviceId: "device-2",
        opId: "op-3",
      }),
    ).toThrow("Draft conflict");

    const conflict = db.prepare("SELECT entity_type, entity_id, base_version, local_json, incoming_json, status FROM conflicts").get() as {
      entity_type: string;
      entity_id: string;
      base_version: number;
      local_json: string;
      incoming_json: string;
      status: string;
    };
    expect(conflict).toMatchObject({
      entity_type: "draft",
      entity_id: "day:2026-07-07:summary",
      base_version: 1,
      status: "open",
    });
    expect(JSON.parse(conflict.local_json)).toMatchObject({ content: "stale" });
    expect(JSON.parse(conflict.incoming_json)).toMatchObject({ content: "v2", version: 2 });
  });

  it("resolves draft conflicts by saving merged content on top of the remote version", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    saveDraftWithDb(db, {
      scopeType: "day",
      scopeId: "2026-07-07",
      field: "summary",
      content: "remote",
      baseVersion: 0,
      deviceId: "device-1",
      opId: "op-1",
    });
    saveDraftWithDb(db, {
      scopeType: "day",
      scopeId: "2026-07-07",
      field: "summary",
      content: "remote v2",
      baseVersion: 1,
      deviceId: "device-1",
      opId: "op-remote-2",
    });
    expect(() =>
      saveDraftWithDb(db, {
        scopeType: "day",
        scopeId: "2026-07-07",
        field: "summary",
        content: "local",
        baseVersion: 1,
        deviceId: "device-2",
        opId: "op-2",
      }),
    ).toThrow("Draft conflict");

    const conflict = listOpenConflictsWithDb(db, { scopeType: "day", scopeId: "2026-07-07" })[0];
    const resolved = resolveConflictWithDb(db, {
      conflictId: conflict.id,
      content: "merged",
      deviceId: "device-2",
      opId: "op-resolve",
    });
    const draft = db.prepare("SELECT content, version FROM drafts WHERE id = ?").get("day:2026-07-07:summary");
    const storedConflict = db.prepare("SELECT status FROM conflicts WHERE id = ?").get(conflict.id);

    expect(resolved).toMatchObject({ status: "resolved" });
    expect(draft).toMatchObject({ content: "merged", version: 3 });
    expect(storedConflict).toEqual({ status: "resolved" });
  });

  it("lists conflict history and prunes old resolved conflicts", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    db.prepare(`
      INSERT INTO conflicts (id, entity_type, entity_id, base_version, local_json, incoming_json, status, resolved_at)
      VALUES
        ('old-resolved', 'draft', 'day:2026-07-01:diary', 1, '{"content":"local old"}', '{"content":"remote old"}', 'resolved', '2026-07-01 00:00:00'),
        ('new-resolved', 'draft', 'day:2026-07-07:summary', 2, '{"content":"local new"}', '{"content":"remote new"}', 'resolved', '2026-07-07 00:00:00'),
        ('open-conflict', 'draft', 'day:2026-07-08:plan', 3, '{"content":"local open"}', '{"content":"remote open"}', 'open', NULL)
    `).run();

    expect(listConflictHistoryWithDb(db).map((conflict) => conflict.id)).toEqual([
      "open-conflict",
      "new-resolved",
      "old-resolved",
    ]);

    const pruned = pruneResolvedConflictsWithDb(db, { resolvedBefore: "2026-07-05 00:00:00" });

    expect(pruned).toEqual({ deleted: 1 });
    expect(listConflictHistoryWithDb(db).map((conflict) => conflict.id)).toEqual(["open-conflict", "new-resolved"]);
  });
});
