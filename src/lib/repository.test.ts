import Database from "better-sqlite3";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrations";
import { initializeDatabase } from "./db";
import { createAssetFromUploadWithDb, getActiveDayDraftsWithDb, markCommittedDayDraftsWithDb } from "./repository";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("day draft commits", () => {
  it("commits only drafts matching the submitted day snapshot", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    db.prepare(`
      INSERT INTO drafts (id, scope_type, scope_id, field, content, version, status)
      VALUES
        ('day:2026-07-07:plan', 'day', '2026-07-07', 'plan', 'submitted plan', 1, 'active'),
        ('day:2026-07-07:diary', 'day', '2026-07-07', 'diary', 'newer remote diary', 2, 'active')
    `).run();

    markCommittedDayDraftsWithDb(db, "2026-07-07", {
      plan: "submitted plan",
      diary: "older submitted diary",
    });

    expect(db.prepare("SELECT status FROM drafts WHERE id = 'day:2026-07-07:plan'").get()).toEqual({
      status: "committed",
    });
    expect(db.prepare("SELECT status FROM drafts WHERE id = 'day:2026-07-07:diary'").get()).toEqual({
      status: "active",
    });
  });

  it("returns active draft content with versions for reload-safe autosave", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    db.prepare(`
      INSERT INTO drafts (id, scope_type, scope_id, field, content, version, status)
      VALUES
        ('day:2026-07-07:summary', 'day', '2026-07-07', 'summary', 'reopened draft', 4, 'active'),
        ('day:2026-07-07:blockers', 'day', '2026-07-07', 'blockers', 'old blocker', 2, 'committed')
    `).run();

    expect(getActiveDayDraftsWithDb(db, "2026-07-07")).toEqual({
      values: { summary: "reopened draft" },
      versions: { summary: 4 },
    });
  });
});

describe("repository asset uploads", () => {
  it("deduplicates identical file content while keeping separate asset records", async () => {
    const uploadRoot = await mkdtemp(path.join(os.tmpdir(), "zgca-repository-upload-"));
    tempRoots.push(uploadRoot);
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db, { uploadRoot });

    const first = (await createAssetFromUploadWithDb(db, {
      file: new File(["same bytes"], "notes-a.txt", { type: "text/plain" }),
      uploadRoot,
      day: "2026-07-07",
      tags: ["linear algebra"],
    })) as { id: number; relative_path: string; original_name: string };
    const second = (await createAssetFromUploadWithDb(db, {
      file: new File(["same bytes"], "notes-b.txt", { type: "text/plain" }),
      uploadRoot,
      day: "2026-07-07",
      tags: ["linear algebra"],
    })) as { id: number; relative_path: string; original_name: string };

    expect(first.id).not.toBe(second.id);
    expect(first.original_name).toBe("notes-a.txt");
    expect(second.original_name).toBe("notes-b.txt");
    expect(first.relative_path).toBe(second.relative_path);
    expect(existsSync(path.join(uploadRoot, first.relative_path))).toBe(true);

    expect(db.prepare("SELECT COUNT(*) AS count FROM blobs").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT ref_count FROM blobs").get()).toEqual({ ref_count: 2 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM assets").get()).toEqual({ count: 2 });
  });
});
