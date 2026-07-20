import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgentContext } from "./context";
import { agentOperations, executeAgentOperation, getAgentOperation, operationManifest } from "./operations";
import { createTestDb, createTestWorkspace } from "../repo/testing";

describe("Ascend Agent operations", () => {
  const databases: ReturnType<typeof createTestDb>[] = [];
  const scratchRoots: string[] = [];
  const originalImportRoots = process.env.ASCEND_AGENT_IMPORT_ROOTS;
  const originalUploadRoot = process.env.ZGCA_UPLOAD_ROOT;

  afterEach(() => {
    for (const db of databases.splice(0)) db.close();
    for (const root of scratchRoots.splice(0)) rmSync(root, { recursive: true, force: true });
    if (originalImportRoots === undefined) delete process.env.ASCEND_AGENT_IMPORT_ROOTS;
    else process.env.ASCEND_AGENT_IMPORT_ROOTS = originalImportRoots;
    if (originalUploadRoot === undefined) delete process.env.ZGCA_UPLOAD_ROOT;
    else process.env.ZGCA_UPLOAD_ROOT = originalUploadRoot;
  });

  function setup() {
    const db = createTestDb();
    databases.push(db);
    const user = createTestWorkspace(db, { email: "agent@example.com", displayName: "Agent 用户" });
    const context = resolveAgentContext(db, "AGENT@example.com");
    return { db, context, user };
  }

  it("publishes unique operation ids and separates read and write capabilities", () => {
    const manifest = operationManifest();
    expect(new Set(manifest.map((item) => item.id)).size).toBe(agentOperations.length);
    expect(manifest.some((item) => item.readOnly)).toBe(true);
    expect(manifest.some((item) => !item.readOnly)).toBe(true);
    expect(manifest.find((item) => item.id === "task.delete")?.destructive).toBe(true);
  });

  it("requires an explicit account when multiple active workspaces exist", () => {
    const { db } = setup();
    createTestWorkspace(db, { email: "second@example.com" });
    expect(() => resolveAgentContext(db)).toThrow("存在多个学习账号");
    expect(resolveAgentContext(db, "second@example.com").email).toBe("second@example.com");
  });

  it("creates and reads a task only inside the selected workspace and writes an audit row", async () => {
    const { db, context } = setup();
    const other = createTestWorkspace(db, { email: "other@example.com" });

    const created = (await executeAgentOperation({ db, context }, getAgentOperation("task.create"), {
      day: "2026-07-19",
      title: "Agent 创建的任务",
      estimatedMinutes: 45,
    })) as { id: number };
    const listed = (await executeAgentOperation({ db, context }, getAgentOperation("task.list"), {
      from: "2026-07-19",
      to: "2026-07-19",
    })) as Array<{ id: number; title: string }>;

    expect(listed).toContainEqual(expect.objectContaining({ id: created.id, title: "Agent 创建的任务" }));
    expect(db.prepare("SELECT COUNT(*) AS count FROM day_tasks WHERE workspace_id = ?").get(other.workspaceId)).toEqual(
      { count: 0 },
    );
    expect(db.prepare("SELECT action, entity_type FROM audit_logs ORDER BY id DESC LIMIT 1").get()).toEqual({
      action: "agent.task.create",
      entity_type: "task",
    });
  });

  it("rejects destructive operations without confirmation and leaves data intact", async () => {
    const { db, context } = setup();
    const created = (await executeAgentOperation({ db, context }, getAgentOperation("task.create"), {
      day: "2026-07-19",
      title: "不能误删",
    })) as { id: number };

    await expect(
      executeAgentOperation({ db, context }, getAgentOperation("task.delete"), { id: created.id, confirm: false }),
    ).rejects.toThrow("confirm=true");
    expect(
      db.prepare("SELECT title FROM day_tasks WHERE workspace_id = ? AND id = ?").get(context.workspaceId, created.id),
    ).toEqual({ title: "不能误删" });
  });

  it("imports assets only from an explicitly allowed local root", async () => {
    const { db, context } = setup();
    const scratch = mkdtempSync(join(tmpdir(), "ascend-agent-import-"));
    scratchRoots.push(scratch);
    const allowed = join(scratch, "allowed");
    const uploads = join(scratch, "uploads");
    const filePath = join(allowed, "notes.md");
    mkdirSync(allowed, { recursive: true });
    writeFileSync(filePath, "agent import test", "utf8");
    process.env.ASCEND_AGENT_IMPORT_ROOTS = allowed;
    process.env.ZGCA_UPLOAD_ROOT = uploads;

    const imported = (await executeAgentOperation({ db, context }, getAgentOperation("asset.import"), {
      localPath: filePath,
      day: "2026-07-19",
      folderPath: "Agent 导入",
    })) as { id: number };

    expect(
      db
        .prepare("SELECT original_name, folder_path FROM assets WHERE workspace_id = ? AND id = ?")
        .get(context.workspaceId, imported.id),
    ).toEqual({ original_name: "notes.md", folder_path: "Agent 导入" });
    await expect(
      executeAgentOperation({ db, context }, getAgentOperation("asset.import"), {
        localPath: join(process.cwd(), "package.json"),
        day: "2026-07-19",
      }),
    ).rejects.toThrow("不在 ASCEND_AGENT_IMPORT_ROOTS");
  });
});
