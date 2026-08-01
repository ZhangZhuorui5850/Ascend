import { describe, expect, it } from "vitest";
import { addNote, addTask } from "./planner";
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
    const task = addTask(db, scope, {
      day: "2026-07-25",
      title: "矩阵乘法训练",
      knowledgePointId: "kp1",
      completionCriteria: "完成矩阵乘法 20 题",
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
    addTask(db, mine, { day: "2026-07-25", title: "完成率 100%_核对" });
    addTask(db, mine, { day: "2026-07-25", title: "普通任务" });
    addTask(db, theirs, { day: "2026-07-25", title: "完成率 100%_别人的秘密" });

    const results = searchWorkspace(db, mine, "%_");

    expect(results.map((result) => result.title)).toEqual(["完成率 100%_核对"]);
    expect(JSON.stringify(results)).not.toContain("别人的秘密");
  });

  it("returns no results for blank input and bounds each entity group", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    for (let index = 0; index < 8; index += 1) {
      addTask(db, scope, { day: "2026-07-25", title: `同名训练 ${index}` });
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
});
