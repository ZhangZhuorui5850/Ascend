import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgentContext } from "./context";
import { agentOperations, executeAgentOperation, getAgentOperation, operationManifest } from "./operations";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "../repo/testing";
import { addTask } from "../repo/planner";
import { getLearningTaskLink, listLearningEvidence } from "../repo/learning-evidence";
import { createAlgorithmProblem } from "../repo/algorithms";
import { setPluginEnabled } from "../repo/plugins";

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
    expect(manifest
      .filter((item) => /^planner\.task\.(?:list|create|update|delete|restore)$/.test(item.id))
      .every((item) => item.description.includes("已弃用"))).toBe(true);
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
    })) as { id: string };
    const listed = (await executeAgentOperation({ db, context }, getAgentOperation("task.list"), {
      from: "2026-07-19",
      to: "2026-07-19",
    })) as Array<{ id: string; title: string }>;

    expect(listed).toContainEqual(expect.objectContaining({ id: created.id, title: "Agent 创建的任务" }));
    expect(db.prepare("SELECT COUNT(*) AS count FROM planner_tasks WHERE workspace_id = ?").get(other.workspaceId)).toEqual(
      { count: 0 },
    );
    expect(db.prepare("SELECT action, entity_type FROM audit_logs ORDER BY id DESC LIMIT 1").get()).toEqual({
      action: "agent.task.create",
      entity_type: "planner_task",
    });
  });

  it("rejects destructive operations without confirmation and leaves data intact", async () => {
    const { db, context } = setup();
    const created = (await executeAgentOperation({ db, context }, getAgentOperation("task.create"), {
      day: "2026-07-19",
      title: "不能误删",
    })) as { id: string };

    await expect(
      executeAgentOperation({ db, context }, getAgentOperation("task.delete"), { id: created.id, confirm: false }),
    ).rejects.toThrow("confirm=true");
    expect(
      db.prepare("SELECT title FROM planner_tasks WHERE workspace_id = ? AND id = ?").get(context.workspaceId, created.id),
    ).toEqual({ title: "不能误删" });
  });

  it("routes canonical and numeric-compatible task writes through one Planner entity", async () => {
    const { db, context } = setup();
    const created = (await executeAgentOperation({ db, context }, getAgentOperation("task.create"), {
      clientMutationId: "agent-task-canonical",
      day: "2026-07-19",
      title: "Canonical Agent task",
      activityType: "practice",
      plannedVerificationMethod: "闭卷复述",
    })) as { id: string; version: number };
    expect(getLearningTaskLink(db, context, created.id)).toMatchObject({
      activityType: "practice",
      plannedVerificationMethod: "闭卷复述",
    });

    await executeAgentOperation({ db, context }, getAgentOperation("task.update"), {
      id: created.id,
      expectedVersion: created.version,
      done: true,
      clientMutationId: "agent-task-complete",
      actualMinutes: 20,
      completionOutput: "完成一轮",
    });
    expect(listLearningEvidence(db, context, { taskId: created.id })).toMatchObject([
      { actualMinutes: 20, output: "完成一轮", outcome: "completed" },
    ]);

    const legacy = addTask(db, context, { day: "2026-07-20", title: "Legacy identity" });
    const mirrored = db.prepare(`
      SELECT id, version FROM planner_tasks
      WHERE workspace_id = ? AND legacy_day_task_id = ?
    `).get(context.workspaceId, legacy.id) as { id: string; version: number };
    await executeAgentOperation({ db, context }, getAgentOperation("task.update"), {
      id: legacy.id,
      expectedVersion: mirrored.version,
      title: "Updated through numeric compatibility",
    });
    expect(db.prepare("SELECT title FROM planner_tasks WHERE id = ?").get(mirrored.id)).toEqual({
      title: "Updated through numeric compatibility",
    });
    expect(db.prepare("SELECT title FROM day_tasks WHERE id = ?").get(legacy.id)).toEqual({
      title: "Legacy identity",
    });
  });

  it("routes idempotent Agent study capture through canonical learning evidence", async () => {
    const { db, context } = setup();
    const input = {
      kind: "study",
      operationId: "agent-study-capture-1",
      day: "2026-07-19",
      title: "Agent 学习记录",
      durationMinutes: 25,
      output: "完成一页笔记",
    };

    const first = await executeAgentOperation(
      { db, context },
      getAgentOperation("activity.record"),
      input,
    ) as { evidenceId: string; studySessionId: number };
    const replay = await executeAgentOperation(
      { db, context },
      getAgentOperation("activity.record"),
      input,
    ) as { evidenceId: string; studySessionId: number };

    expect(replay).toEqual(first);
    expect(listLearningEvidence(db, context)).toMatchObject([{
      id: first.evidenceId,
      taskId: null,
      actualMinutes: 25,
      sourceType: "agent_capture",
      sourceId: input.operationId,
    }]);
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM study_sessions WHERE workspace_id = ?
    `).get(context.workspaceId)).toEqual({ count: 1 });
  });

  it("routes replay-safe manual algorithm attempts through canonical learning evidence", async () => {
    const { db, context } = setup();
    setPluginEnabled(db, context, "algorithms", true);
    const problem = createAlgorithmProblem(db, context, {
      sourceUrl: "https://example.com/problems/agent-manual-attempt",
      title: "Agent Manual Attempt",
    });
    const input = {
      operationId: "algorithm:agent:manual:0001",
      problemId: problem.id,
      day: "2026-07-19",
      verdict: "WA",
      durationMinutes: 25,
      maxHintLevel: 0,
      errorCategory: "边界遗漏",
    };

    const first = await executeAgentOperation(
      { db, context },
      getAgentOperation("algorithm.attempt.record"),
      input,
    ) as { id: number };
    const replay = await executeAgentOperation(
      { db, context },
      getAgentOperation("algorithm.attempt.record"),
      input,
    ) as { id: number };

    expect(replay).toEqual(first);
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_attempts WHERE workspace_id = ?
    `).get(context.workspaceId)).toEqual({ count: 1 });
    expect(listLearningEvidence(db, context)).toMatchObject([{
      activityType: "practice",
      actualMinutes: 25,
      outcome: "WA",
      sourceType: "plugin:algorithms",
      sourceId: String(first.id),
      idempotencyKey: `algorithm-attempt:${input.operationId}`,
    }]);
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM study_sessions WHERE workspace_id = ?
    `).get(context.workspaceId)).toEqual({ count: 1 });
  });

  it("exposes explicit canonical complete, reopen, reschedule, delete, and restore commands", async () => {
    const { db, context } = setup();
    seedSubjectWithChapter(db, context);
    const created = (await executeAgentOperation({ db, context }, getAgentOperation("task.create"), {
      clientMutationId: "agent-explicit-lifecycle",
      day: "2026-07-19",
      title: "Explicit lifecycle",
      knowledgePointId: "kp1",
      activityType: "practice",
    })) as { id: string; version: number };

    const scheduled = (await executeAgentOperation({ db, context }, getAgentOperation("task.reschedule"), {
      id: created.id,
      expectedVersion: created.version,
      day: "2026-07-20",
      scheduledStart: "09:15",
      estimatedMinutes: 35,
    })) as { entity: { version: number; scheduled_start_at: string } };
    expect(scheduled.entity.scheduled_start_at).toBe("2026-07-20T01:15:00.000Z");

    const completed = (await executeAgentOperation({ db, context }, getAgentOperation("task.complete"), {
      id: created.id,
      expectedVersion: scheduled.entity.version,
      clientMutationId: "agent-explicit-complete",
      day: "2026-07-20",
      actualMinutes: 30,
      output: "完成并验证",
      scheduleRetestAfterDays: 3,
    })) as {
      entity: { version: number; status: string };
      retestTask: { due_date: string };
    };
    expect(completed.entity.status).toBe("completed");
    expect(completed.retestTask.due_date).toBe("2026-07-23");
    expect(listLearningEvidence(db, context, { taskId: created.id })).toMatchObject([
      { actualMinutes: 30, output: "完成并验证", outcome: "completed" },
    ]);

    const reopened = (await executeAgentOperation({ db, context }, getAgentOperation("task.reopen"), {
      id: created.id,
      expectedVersion: completed.entity.version,
      clientMutationId: "agent-explicit-reopen",
      day: "2026-07-20",
    })) as { entity: { version: number; status: string } };
    expect(reopened.entity.status).toBe("open");

    const deleted = (await executeAgentOperation({ db, context }, getAgentOperation("task.delete"), {
      id: created.id,
      expectedVersion: reopened.entity.version,
      clientMutationId: "agent-explicit-delete",
      confirm: true,
    })) as { entity: { version: number; deleted_at: string } };
    expect(deleted.entity.deleted_at).toBeTruthy();

    const restored = (await executeAgentOperation({ db, context }, getAgentOperation("task.restore"), {
      id: created.id,
      expectedVersion: deleted.entity.version,
      clientMutationId: "agent-explicit-restore",
    })) as { entity: { deleted_at: string | null } };
    expect(restored.entity.deleted_at).toBeNull();
  });

  it("supports idempotent Planner v2 task writes, conflicts, restore, and workspace isolation", async () => {
    const { db, context } = setup();
    const other = createTestWorkspace(db, { email: "planner-other@example.com" });
    const createInput = {
      clientMutationId: "agent-planner-create-1",
      title: "Agent Planner 任务",
      dueDate: "2026-07-31",
      scheduledStartAt: "2026-07-31T01:00:00.000Z",
      scheduledEndAt: "2026-07-31T02:00:00.000Z",
      scheduledTimezone: "Asia/Shanghai",
    };

    const created = (await executeAgentOperation(
      { db, context },
      getAgentOperation("planner.task.create"),
      createInput,
    )) as {
      id: string;
      version: number;
      deprecation: { deprecated: boolean; replacement: string };
    };
    const replay = (await executeAgentOperation(
      { db, context },
      getAgentOperation("planner.task.create"),
      { ...createInput, title: "重试标题" },
    )) as { id: string; version: number };
    expect(replay.id).toBe(created.id);
    expect(created.deprecation).toMatchObject({ deprecated: true, replacement: "task.*" });

    const updated = (await executeAgentOperation(
      { db, context },
      getAgentOperation("planner.task.update"),
      { id: created.id, expectedVersion: created.version, title: "Agent Planner 已更新" },
    )) as { entity: { id: string; version: number; title: string } };
    expect(updated.entity).toMatchObject({ id: created.id, title: "Agent Planner 已更新", version: 2 });
    const conflict = (await executeAgentOperation(
      { db, context },
      getAgentOperation("planner.task.update"),
      { id: created.id, expectedVersion: 1, title: "过期写入" },
    )) as { conflict: { actualVersion: number } };
    expect(conflict.conflict.actualVersion).toBe(2);

    const removed = (await executeAgentOperation(
      { db, context },
      getAgentOperation("planner.task.delete"),
      {
        id: created.id,
        expectedVersion: 2,
        clientMutationId: "agent-planner-delete-1",
        confirm: true,
      },
    )) as { entity: { version: number; deleted_at: string } };
    expect(removed.entity.deleted_at).toBeTruthy();
    const restored = (await executeAgentOperation(
      { db, context },
      getAgentOperation("planner.task.restore"),
      {
        id: created.id,
        expectedVersion: removed.entity.version,
        clientMutationId: "agent-planner-restore-1",
      },
    )) as { entity: { deleted_at: null } };
    expect(restored.entity.deleted_at).toBeNull();

    expect(
      db.prepare("SELECT COUNT(*) AS count FROM planner_tasks WHERE workspace_id = ?").get(other.workspaceId),
    ).toEqual({ count: 0 });
    expect(
      db.prepare("SELECT entity_id FROM audit_logs WHERE action = 'agent.planner.task.update' ORDER BY id DESC LIMIT 1").get(),
    ).toEqual({ entity_id: created.id });
  });

  it("supports Planner calendar discovery and idempotent event lifecycle operations", async () => {
    const { db, context } = setup();
    const calendars = (await executeAgentOperation(
      { db, context },
      getAgentOperation("planner.calendar.list"),
      {},
    )) as Array<{ id: string }>;
    const input = {
      clientMutationId: "agent-event-create-1",
      calendarId: calendars[0].id,
      title: "Agent 日历事件",
      location: "自习室",
      allDay: false,
      startAt: "2026-08-01T01:00:00.000Z",
      endAt: "2026-08-01T02:00:00.000Z",
      timezone: "Asia/Shanghai",
    };
    const created = (await executeAgentOperation(
      { db, context },
      getAgentOperation("planner.event.create"),
      input,
    )) as { id: string; version: number };
    const replay = (await executeAgentOperation(
      { db, context },
      getAgentOperation("planner.event.create"),
      { ...input, title: "重试标题" },
    )) as { id: string };
    expect(replay.id).toBe(created.id);
    const listed = (await executeAgentOperation(
      { db, context },
      getAgentOperation("planner.event.list"),
      { from: "2026-08-01", to: "2026-08-01" },
    )) as Array<{ id: string; title: string }>;
    expect(listed).toContainEqual(expect.objectContaining({ id: created.id, title: "Agent 日历事件" }));

    const updated = (await executeAgentOperation(
      { db, context },
      getAgentOperation("planner.event.update"),
      { id: created.id, expectedVersion: created.version, busyStatus: "free" },
    )) as { entity: { version: number; busy_status: string } };
    expect(updated.entity).toMatchObject({ version: 2, busy_status: "free" });
    const deleted = (await executeAgentOperation(
      { db, context },
      getAgentOperation("planner.event.delete"),
      {
        id: created.id,
        expectedVersion: 2,
        clientMutationId: "agent-event-delete-1",
        confirm: true,
      },
    )) as { entity: { deleted_at: string } };
    expect(deleted.entity.deleted_at).toBeTruthy();
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
