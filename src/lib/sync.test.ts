import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runMigrations } from "./migrations";
import { pullChangesWithDb, registerDeviceWithDb, saveDraftWithDb } from "./sync";

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
  });
});
