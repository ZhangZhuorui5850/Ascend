import { describe, expect, it } from "vitest";
import { listLearningEvidence } from "../../repo/learning-evidence";
import { listPlannerTasks } from "../../repo/planner-tasks";
import { createTestDb, createTestWorkspace } from "../../repo/testing";
import { recordCapture } from "./record-capture";

describe("recordCapture", () => {
  it("creates a parsed scheduled task through the canonical task command", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);

    const captured = recordCapture(db, scope, {
      clientMutationId: "task-1",
      kind: "task",
      text: "明天 20:00 红黑树练习 45 分钟",
      contextDay: "2026-08-10",
    });

    expect(captured).toMatchObject({ kind: "task", title: "红黑树练习", day: "2026-08-11" });
    expect(listPlannerTasks(db, scope)).toMatchObject([{
      id: captured.entityId,
      title: "红黑树练习",
      estimated_minutes: 45,
      scheduled_start_at: "2026-08-11T12:00:00.000Z",
      due_date: null,
    }]);
  });

  it("records study evidence and replays the same operation", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const input = {
      clientMutationId: "study-1",
      kind: "study" as const,
      text: "学习了 操作系统 30 分钟",
      contextDay: "2026-08-10",
    };

    expect(recordCapture(db, scope, input)).toEqual(recordCapture(db, scope, input));
    expect(listLearningEvidence(db, scope)).toMatchObject([{
      day: "2026-08-10",
      actualMinutes: 30,
      sourceType: "manual_capture",
    }]);
  });

  it("makes mistake and note capture idempotent and rejects payload conflicts", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const mistake = {
      clientMutationId: "mistake-1",
      kind: "mistake" as const,
      text: "边界条件写错",
      contextDay: "2026-08-10",
    };
    const note = {
      clientMutationId: "note-1",
      kind: "note" as const,
      text: "状态转移要先写不变量",
      contextDay: "2026-08-10",
    };

    expect(recordCapture(db, scope, mistake)).toEqual(recordCapture(db, scope, mistake));
    expect(recordCapture(db, scope, note)).toEqual(recordCapture(db, scope, note));
    expect(db.prepare("SELECT COUNT(*) AS count FROM mistakes WHERE workspace_id = ?").get(scope.workspaceId)).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM day_notes WHERE workspace_id = ?").get(scope.workspaceId)).toEqual({ count: 1 });
    expect(() => recordCapture(db, scope, { ...mistake, text: "另一个错题" })).toThrow("载荷冲突");
    expect(() => recordCapture(db, scope, { ...note, text: "另一个结论" })).toThrow("载荷冲突");
  });
});
