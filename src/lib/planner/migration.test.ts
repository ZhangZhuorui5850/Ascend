import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { initializeDatabase } from "../db";
import { getAppliedMigrations, runMigrations } from "../migrations";
import { verifyPlannerMigration } from "./migration";
import { listLegacyDayTaskProjection } from "../repo/planner-tasks";

describe("Planner migrations", () => {
  it("migrates legacy day tasks field-for-field across two workspaces and stays idempotent", () => {
    const db = legacyDatabase();
    seedWorkspace(db, "user-a", "workspace-a", "a@example.com");
    seedWorkspace(db, "user-b", "workspace-b", "b@example.com");
    db.prepare(`
      INSERT INTO day_tasks
        (workspace_id, day, title, subject_code, done, sort_order, done_at,
         priority, estimated_minutes, scheduled_start, notes)
      VALUES
        ('workspace-a', '2026-03-08', 'A 定时任务', 'M1', 1, 4, '2026-03-08 12:00:00',
         1, 90, '09:30', 'A notes'),
        ('workspace-b', '2026-07-31', 'B 到期任务', NULL, 0, 2, NULL,
         3, 45, NULL, 'B notes')
    `).run();

    runMigrations(db);

    expect(getAppliedMigrations(db)).toContain("0018_planner_core");
    expect(getAppliedMigrations(db)).toContain("0019_planner_recurrence_reminders");
    for (const table of [
      "task_lists",
      "planner_tasks",
      "planner_calendars",
      "calendar_events",
      "planner_labels",
      "planner_task_labels",
      "planner_event_labels",
    ]) {
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
        .toEqual({ name: table });
    }
    expect(db.prepare("SELECT COUNT(*) AS count FROM task_lists WHERE is_inbox = 1").get()).toEqual({ count: 3 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM planner_calendars").get()).toEqual({ count: 6 });

    const timed = db.prepare(`
      SELECT status, completed_at, due_date, due_at, scheduled_start_at, scheduled_end_at,
             scheduled_timezone, priority, estimated_minutes, notes, legacy_day_task_id
      FROM planner_tasks WHERE workspace_id = 'workspace-a'
    `).get();
    expect(timed).toMatchObject({
      status: "completed",
      completed_at: "2026-03-08 12:00:00",
      due_date: null,
      due_at: null,
      scheduled_start_at: "2026-03-08T01:30:00.000Z",
      scheduled_end_at: "2026-03-08T03:00:00.000Z",
      scheduled_timezone: "Asia/Shanghai",
      priority: 1,
      estimated_minutes: 90,
      notes: "A notes",
      legacy_day_task_id: 1,
    });
    const due = db.prepare(`
      SELECT due_date, due_at, scheduled_start_at, scheduled_end_at
      FROM planner_tasks WHERE workspace_id = 'workspace-b'
    `).get();
    expect(due).toEqual({
      due_date: "2026-07-31",
      due_at: null,
      scheduled_start_at: null,
      scheduled_end_at: null,
    });

    const report = verifyPlannerMigration(db);
    expect(report.ok).toBe(true);
    expect(report.workspaceCount).toBe(3);
    expect(report.legacyTaskCount).toBe(2);
    expect(report.migratedLegacyTaskCount).toBe(2);
    expect(listLegacyDayTaskProjection(db, { workspaceId: "workspace-a" })).toEqual([
      expect.objectContaining({
        id: 1,
        day: "2026-03-08",
        title: "A 定时任务",
        done: 1,
        scheduled_start: "09:30",
      }),
    ]);

    const before = db.prepare("SELECT COUNT(*) AS count FROM planner_tasks").get();
    runMigrations(db);
    expect(db.prepare("SELECT COUNT(*) AS count FROM planner_tasks").get()).toEqual(before);
    // 合并线（2026-08）：生产库以本地功能线为准，day_tasks 保持可写；
    // 0018_planner_core 不再创建 v2 只读触发器，legacy 与 v2 双写并存。
    expect(() => db.prepare("UPDATE day_tasks SET title = 'changed' WHERE id = 1").run())
      .not.toThrow();
  });

  it("adds recurrence, reminder, notification, and encrypted subscription storage append-only", () => {
    const db = legacyDatabase();
    runMigrations(db, { throughVersion: "0018_planner_core" });
    expect(getAppliedMigrations(db)).not.toContain("0019_planner_recurrence_reminders");
    runMigrations(db);
    expect(getAppliedMigrations(db)).toContain("0019_planner_recurrence_reminders");
    for (const table of [
      "task_series",
      "planner_reminders",
      "planner_notifications",
      "push_subscriptions",
    ]) {
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
        .toEqual({ name: table });
    }
    runMigrations(db);
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM schema_migrations
      WHERE version = '0019_planner_recurrence_reminders'
    `).get()).toEqual({ count: 1 });
  });
});

function legacyDatabase(): Database.Database {
  const db = new Database(":memory:");
  initializeDatabase(db);
  runMigrations(db, { throughVersion: "0017_agent_tokens" });
  return db;
}

function seedWorkspace(
  db: Database.Database,
  userId: string,
  workspaceId: string,
  email: string,
): void {
  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, role, status)
    VALUES (?, ?, 'hash', ?, 'user', 'active')
  `).run(userId, email, userId);
  db.prepare(`
    INSERT INTO workspaces (id, owner_user_id, display_name)
    VALUES (?, ?, ?)
  `).run(workspaceId, userId, workspaceId);
  db.prepare(`
    INSERT INTO subjects (workspace_id, code, name, description)
    VALUES (?, 'M1', '线性代数', '')
  `).run(workspaceId);
}
