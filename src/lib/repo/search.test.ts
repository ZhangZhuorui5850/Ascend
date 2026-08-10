import { describe, expect, it } from "vitest";
import {
  completeTask,
  createTask,
  deleteTask,
  updateTask,
} from "../application/tasks/commands";
import { addNote } from "./planner";
import { createMistake } from "./reviews";
import { searchWorkspace } from "./search";
import { createAlgorithmProblem } from "./algorithms";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "./testing";

describe("workspace search", () => {
  it("finds grouped learning entities with actionable deep links", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db, { email: "search@example.com" });
    seedSubjectWithChapter(db, scope);
    const task = createTask(db, scope, {
      clientMutationId: "search-matrix-task",
      dueDate: "2026-07-25",
      title: "矩阵乘法训练",
      subjectCode: "M1",
    });
    const note = addNote(db, scope, {
      day: "2026-07-25",
      content: "矩阵乘法的维度顺序需要重新确认",
    });
    const mistake = createMistake(db, scope, {
      day: "2026-07-24",
      title: "矩阵乘法次序写反",
      cause: "没有先核对维度",
      knowledgePointId: "kp1",
    });
    db.prepare(`
      INSERT INTO assets
        (workspace_id, day, original_name, safe_name, relative_path, note)
      VALUES (?, '2026-07-25', '矩阵乘法讲义.pdf', 'matrix.pdf', 'matrix.pdf', '包含矩阵例题')
    `).run(scope.workspaceId);
    setPluginEnabled(db, scope, "algorithms", true);
    const algorithm = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/1000/",
      title: "矩阵快速幂",
      tags: ["矩阵", "快速幂"],
    });

    const results = searchWorkspace(db, scope, "矩阵");

    expect(new Set(results.map((result) => result.kind))).toEqual(new Set([
      "knowledge_point",
      "mistake",
      "task",
      "note",
      "asset",
      "algorithm_problem",
    ]));
    expect(results.find((result) => result.key === "knowledge_point:kp1")).toMatchObject({
      href: "/subjects/M1?focus=kp1",
      training: {
        knowledgePointId: "kp1",
        sourceType: "knowledge_point",
      },
    });
    expect(results.find((result) => result.key === `mistake:${mistake.id}`)).toMatchObject({
      href: `/mistakes#mistake-${mistake.id}`,
      training: {
        sourceId: String(mistake.id),
        sourceType: "mistake",
      },
    });
    expect(results.find((result) => result.key === `task:${task.id}`)?.href)
      .toBe(`/day/2026-07-25#task-${task.id}`);
    expect(results.find((result) => result.key === `note:${note.id}`)?.href)
      .toBe(`/day/2026-07-25#note-${note.id}`);
    expect(results.find((result) => result.kind === "asset")?.href)
      .toContain("/assets?q=");
    expect(results.find((result) => result.key === `algorithm_problem:${algorithm.id}`))
      .toMatchObject({
        href: `/practice/algorithms?problem=${algorithm.id}#algorithm-problem-${algorithm.id}`,
        training: null,
      });
  });

  it("keeps search workspace-scoped and treats LIKE wildcard characters literally", () => {
    const db = createTestDb();
    const mine = createTestWorkspace(db, { email: "mine-search@example.com" });
    const theirs = createTestWorkspace(db, { email: "their-search@example.com" });
    createTask(db, mine, {
      clientMutationId: "mine-literal",
      dueDate: "2026-07-25",
      title: "完成率 100%_核对",
    });
    createTask(db, mine, {
      clientMutationId: "mine-ordinary",
      dueDate: "2026-07-25",
      title: "普通任务",
    });
    createTask(db, theirs, {
      clientMutationId: "theirs-literal",
      dueDate: "2026-07-25",
      title: "完成率 100%_别人的秘密",
    });

    const results = searchWorkspace(db, mine, "%_");

    expect(results.map((result) => result.title)).toEqual(["完成率 100%_核对"]);
    expect(JSON.stringify(results)).not.toContain("别人的秘密");
  });

  it("returns no results for blank input and bounds each entity group", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    for (let index = 0; index < 8; index += 1) {
      createTask(db, scope, {
        clientMutationId: `bounded-${index}`,
        dueDate: "2026-07-25",
        title: `同名训练 ${index}`,
      });
    }

    expect(searchWorkspace(db, scope, "   ")).toEqual([]);
    expect(searchWorkspace(db, scope, "同名", { perKindLimit: 3 })
      .filter((result) => result.kind === "task")).toHaveLength(3);
  });

  it("hides algorithm entities while the plugin is disabled", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/problems/binary-search",
      title: "二分查找边界",
    });
    expect(searchWorkspace(db, scope, "二分").map((result) => result.kind))
      .toContain("algorithm_problem");

    setPluginEnabled(db, scope, "algorithms", false);
    expect(searchWorkspace(db, scope, "二分").map((result) => result.kind))
      .not.toContain("algorithm_problem");
  });

  it("uses scheduled timezone placement, searches completion evidence, and hides deleted or canceled tasks", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const timed = createTask(db, scope, {
      clientMutationId: "search-timed",
      title: "普通学习任务",
      dueDate: "2026-08-12",
      scheduledStartAt: "2026-08-09T16:30:00.000Z",
      scheduledEndAt: "2026-08-09T17:00:00.000Z",
      scheduledTimezone: "Asia/Shanghai",
    });
    expect(timed.legacy_day_task_id).toBeNull();
    completeTask(db, scope, {
      id: timed.id,
      expectedVersion: timed.version,
      day: "2026-08-10",
      evidence: { output: "独特矩阵产出" },
    });
    const deleted = createTask(db, scope, {
      clientMutationId: "search-deleted",
      title: "隐藏矩阵任务",
      dueDate: "2026-08-10",
    });
    deleteTask(db, scope, {
      id: deleted.id,
      expectedVersion: deleted.version,
      clientMutationId: "delete-search-task",
    });
    const canceled = createTask(db, scope, {
      clientMutationId: "search-canceled",
      title: "取消矩阵任务",
      dueDate: "2026-08-10",
    });
    updateTask(db, scope, {
      id: canceled.id,
      expectedVersion: canceled.version,
      status: "canceled",
    });

    const results = searchWorkspace(db, scope, "矩阵").filter((result) => result.kind === "task");

    expect(results).toEqual([
      expect.objectContaining({
        key: `task:${timed.id}`,
        href: `/day/2026-08-10#task-${timed.id}`,
        meta: expect.stringContaining("已完成"),
      }),
    ]);
    expect(JSON.stringify(results)).not.toContain(deleted.id);
    expect(JSON.stringify(results)).not.toContain(canceled.id);
  });
});
