import { describe, expect, it } from "vitest";
import { createTestDb } from "./testing";
import { ensureWorkspaceForUser, LEGACY_WORKSPACE_ID } from "./workspaces";

function insertUser(db: ReturnType<typeof createTestDb>, id: string, email: string, displayName: string) {
  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, role, status)
    VALUES (?, ?, 'hash', ?, 'user', 'active')
  `).run(id, email, displayName);
}

describe("workspace provisioning", () => {
  it("assigns the unowned legacy workspace to the first ordinary user", () => {
    const db = createTestDb();
    insertUser(db, "user-1", "first@example.com", "第一位用户");

    const result = ensureWorkspaceForUser(db, { id: "user-1", displayName: "第一位用户" });

    expect(result).toEqual({ workspaceId: LEGACY_WORKSPACE_ID });
    expect(db.prepare("SELECT owner_user_id FROM workspaces WHERE id = ?").get(LEGACY_WORKSPACE_ID)).toEqual({
      owner_user_id: "user-1",
    });
  });

  it("creates an idempotent seeded workspace for each later ordinary user", () => {
    const db = createTestDb();
    insertUser(db, "user-1", "first@example.com", "第一位用户");
    insertUser(db, "user-2", "second@example.com", "第二位用户");
    ensureWorkspaceForUser(db, { id: "user-1", displayName: "第一位用户" });

    const first = ensureWorkspaceForUser(db, { id: "user-2", displayName: "第二位用户" });
    const second = ensureWorkspaceForUser(db, { id: "user-2", displayName: "第二位用户" });

    expect(first.workspaceId).not.toBe(LEGACY_WORKSPACE_ID);
    expect(second).toEqual(first);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM subjects WHERE workspace_id = ?").get(first.workspaceId),
    ).toMatchObject({ count: 7 });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM knowledge_points WHERE workspace_id = ?").get(first.workspaceId),
    ).toMatchObject({ count: expect.any(Number) });
    const pointCount = db
      .prepare("SELECT COUNT(*) AS count FROM knowledge_points WHERE workspace_id = ?")
      .get(first.workspaceId) as { count: number };
    expect(pointCount.count).toBeGreaterThan(0);
  });

  it("stamps created_at on cloned seed points even when the column default is empty (migrated DBs)", () => {
    const db = createTestDb();
    // 模拟已迁移的存量库：0010 迁移经 ALTER TABLE 只能给 created_at 常量默认 ''，
    // 所以种子插入不能依赖列默认值，必须显式写 created_at。
    const ddl = (db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'knowledge_points'",
    ).get() as { sql: string }).sql;
    expect(ddl).toContain("created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
    db.exec("DROP TABLE knowledge_points");
    db.exec(ddl.replace(
      "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
      "created_at TEXT NOT NULL DEFAULT ''",
    ));

    insertUser(db, "user-1", "first@example.com", "第一位用户");
    insertUser(db, "user-2", "second@example.com", "第二位用户");
    ensureWorkspaceForUser(db, { id: "user-1", displayName: "第一位用户" }); // 认领 legacy，不触发克隆
    const { workspaceId } = ensureWorkspaceForUser(db, { id: "user-2", displayName: "第二位用户" }); // 克隆种子

    const stats = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN created_at IS NULL OR created_at = '' THEN 1 ELSE 0 END) AS missing
      FROM knowledge_points WHERE workspace_id = ?
    `).get(workspaceId) as { total: number; missing: number };
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.missing).toBe(0);
  });
});
