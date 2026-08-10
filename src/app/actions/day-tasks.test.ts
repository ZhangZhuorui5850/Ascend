import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "@/lib/repo/testing";
import { listDayTaskItems } from "@/lib/repo/task-read-model";

let testDb: Database.Database;
let testScope: { userId: string; workspaceId: string };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  getDb: () => testDb,
}));
vi.mock("@/lib/request-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/request-auth")>()),
  requireWorkspace: async () => testScope,
}));

describe("canonical Day task actions", () => {
  beforeEach(() => {
    testDb = createTestDb();
    testScope = createTestWorkspace(testDb);
  });

  afterEach(() => {
    testDb.close();
  });

  it("creates and updates planner/link state atomically without dropping the verification plan", async () => {
    const { createDayTaskAction, updateDayTaskAction } = await import("./day-tasks");
    const created = await createDayTaskAction({
      clientMutationId: "day-action-create",
      day: "2026-08-10",
      title: "原任务",
      completionCriteria: "完成十题",
      plannedVerificationMethod: "闭卷小测",
    });

    expect(created).toMatchObject({
      ok: true,
      task: { title: "原任务", planned_verification_method: "闭卷小测", learning_link_version: 1 },
    });

    const rejected = await updateDayTaskAction({
      id: created.task!.id,
      expectedVersion: created.task!.version,
      linkExpectedVersion: created.task!.learning_link_version,
      day: "2026-08-10",
      title: "不应提交",
      plannedVerificationMethod: "x".repeat(201),
    });
    expect(rejected.ok).toBe(false);
    expect(testDb.prepare(`
      SELECT title, version FROM planner_tasks WHERE workspace_id = ? AND id = ?
    `).get(testScope.workspaceId, created.task!.id)).toEqual({ title: "原任务", version: 1 });

    const updated = await updateDayTaskAction({
      id: created.task!.id,
      expectedVersion: created.task!.version,
      linkExpectedVersion: created.task!.learning_link_version,
      day: "2026-08-10",
      title: "新任务",
      plannedVerificationMethod: "独立重做",
    });
    expect(updated).toMatchObject({
      ok: true,
      task: { title: "新任务", planned_verification_method: "独立重做", learning_link_version: 2 },
    });
  });

  it("passes completion-panel fields into immutable completion evidence", async () => {
    seedSubjectWithChapter(testDb, testScope);
    const { createDayTaskAction, toggleDayTaskAction } = await import("./day-tasks");
    const created = await createDayTaskAction({
      clientMutationId: "day-action-evidence",
      day: "2026-08-10",
      title: "证据任务",
      knowledgePointId: "kp1",
      activityType: "practice",
      plannedVerificationMethod: "闭卷小测",
    });
    const completed = await toggleDayTaskAction({
      id: created.task!.id,
      expectedVersion: created.task!.version,
      clientMutationId: "day-action-evidence-complete",
      day: "2026-08-10",
      done: true,
      evidence: {
        actualMinutes: 40,
        output: "完成 10 题",
        verificationMethod: "闭卷小测",
        verificationResult: "8/10",
        verificationOutcome: "improved",
      },
    });

    expect(completed).toMatchObject({
      ok: true,
      task: {
        done: 1,
        actual_minutes: 40,
        completion_output: "完成 10 题",
        verification_result: "8/10",
        verification_outcome: "improved",
      },
    });
  });

  it("carries only canonical planner tasks and never falls back to day_tasks", async () => {
    const { carryDayTasksAction, createDayTaskAction } = await import("./day-tasks");
    const created = await createDayTaskAction({
      clientMutationId: "day-action-carry",
      day: "2026-08-09",
      title: "顺延任务",
      scheduledStart: "09:30",
    });
    expect(created.ok).toBe(true);

    expect(await carryDayTasksAction({ fromDay: "2026-08-09", toDay: "2026-08-10" }))
      .toMatchObject({ ok: true, moved: 1 });
    expect(listDayTaskItems(testDb, testScope, "2026-08-09")).toEqual([]);
    expect(listDayTaskItems(testDb, testScope, "2026-08-10")).toMatchObject([{
      id: created.task!.id,
      scheduled_start: null,
    }]);
    expect(testDb.prepare("SELECT COUNT(*) AS count FROM day_tasks").get()).toEqual({ count: 0 });
  });

  it("keeps the scheduled range consistent when only estimated minutes change", async () => {
    const { createDayTaskAction, updateDayTaskAction } = await import("./day-tasks");
    const created = await createDayTaskAction({
      clientMutationId: "day-action-duration",
      day: "2026-08-10",
      title: "调整时长",
      scheduledStart: "09:00",
      estimatedMinutes: 30,
    });

    const updated = await updateDayTaskAction({
      id: created.task!.id,
      expectedVersion: created.task!.version,
      day: "2026-08-10",
      estimatedMinutes: 45,
    });

    expect(updated).toMatchObject({ ok: true, task: { estimated_minutes: 45 } });
    const row = testDb.prepare(`
      SELECT scheduled_start_at, scheduled_end_at
      FROM planner_tasks WHERE workspace_id = ? AND id = ?
    `).get(testScope.workspaceId, created.task!.id) as {
      scheduled_start_at: string;
      scheduled_end_at: string;
    };
    expect(Date.parse(row.scheduled_end_at) - Date.parse(row.scheduled_start_at)).toBe(45 * 60_000);
  });
});
