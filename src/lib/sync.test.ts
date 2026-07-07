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
});
