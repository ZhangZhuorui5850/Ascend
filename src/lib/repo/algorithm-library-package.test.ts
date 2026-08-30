import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildAlgorithmLibraryPackage,
  importAlgorithmLibraryPackage,
  parseAlgorithmLibraryPackage,
  previewAlgorithmLibraryPackage,
} from "./algorithm-library-package";
import {
  createAlgorithmLibraryFolder,
  listAlgorithmLibrary,
  moveAlgorithmLibraryProblem,
} from "./algorithm-library";
import { getAlgorithmTrainingRelations, setAlgorithmCourseMemberships } from "./algorithm-training";
import { createAlgorithmProblem, getAlgorithmDashboard, updateAlgorithmProblemDetails } from "./algorithms";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

describe("portable algorithm library packages", () => {
  it("round-trips content and organization, then reimports idempotently", () => {
    const db = createTestDb();
    const source = createTestWorkspace(db, { email: "source-package@example.com" });
    const target = createTestWorkspace(db, { email: "target-package@example.com" });
    setPluginEnabled(db, source, "algorithms", true);
    setPluginEnabled(db, target, "algorithms", true);
    const first = createAlgorithmProblem(db, source, {
      sourceUrl: "https://bailian.openjudge.cn/practice/5001/",
      title: "第一道题",
      difficultyBand: "standard",
      tags: ["动态规划"],
    });
    const second = createAlgorithmProblem(db, source, {
      sourceUrl: "https://bailian.openjudge.cn/practice/5002/",
      title: "第二道题",
      tags: ["字符串"],
    });
    db.prepare(`
      UPDATE algorithm_problems
      SET statement_markdown = '# 第一题\n\n完整题面', input_specification = '一个整数',
          output_specification = '一个整数', examples_json = '[{"input":"1","output":"1"}]',
          supported_languages_json = '["cpp17"]',
          metadata_json = '{"starterCode":{"cpp17":"int main() {}\\n"},"referenceCode":{"cpp17":"// answer\\n"}}'
      WHERE workspace_id = ? AND id = ?
    `).run(source.workspaceId, first.id);
    const course = createAlgorithmLibraryFolder(db, source, { name: "课程题库" });
    const dynamicProgramming = createAlgorithmLibraryFolder(db, source, {
      name: "动态规划",
      parentId: course.id,
    });
    moveAlgorithmLibraryProblem(db, source, { problemId: first.id, targetFolderId: dynamicProgramming.id });
    moveAlgorithmLibraryProblem(db, source, { problemId: second.id, targetFolderId: course.id });
    setAlgorithmCourseMemberships(db, source, {
      problemIds: [first.id, second.id],
      courseName: "程序设计实习",
      stageKey: "课后习题",
    });

    const pkg = buildAlgorithmLibraryPackage(db, source, {
      problemIds: [first.id, second.id],
      name: "课程精选题",
      description: "可移植题库",
      exportedAt: "2026-08-31T00:00:00.000Z",
    });
    expect(pkg).toMatchObject({
      schema: "ascend.algorithm-library",
      schemaVersion: 1,
      package: { name: "课程精选题", problemCount: 2 },
    });
    expect(pkg.problems[0]).toMatchObject({
      sourceLibraryNumber: 1,
      content: { statementMarkdown: expect.stringContaining("完整题面") },
      organization: { folderPath: ["课程题库", "动态规划"] },
    });
    expect(pkg.problems[0].content.referenceCode.cpp17).toContain("answer");
    expect(JSON.stringify(pkg)).not.toContain("workspaceId");
    expect(JSON.stringify(pkg)).not.toContain("attempts");

    expect(previewAlgorithmLibraryPackage(db, target, pkg)).toMatchObject({
      total: 2,
      created: 2,
      reused: 0,
      numberCollisions: 0,
    });
    const packageSha256 = createHash("sha256").update(JSON.stringify(pkg)).digest("hex");
    const imported = importAlgorithmLibraryPackage(db, target, pkg, {
      packageSha256,
      createPackageFolder: true,
    });
    expect(imported).toMatchObject({ created: 2, rootFolderId: expect.any(String) });
    expect(listAlgorithmLibrary(db, target).items.map((item) => item.libraryNumber)).toEqual([1, 2]);
    const targetDashboard = getAlgorithmDashboard(db, target, "2026-08-31");
    expect(targetDashboard.problems).toHaveLength(2);
    expect(targetDashboard.problems.find((problem) => problem.externalProblemId === "5001")).toMatchObject({
      title: "第一道题",
      statementMarkdown: expect.stringContaining("完整题面"),
      referenceCode: { cpp17: expect.stringContaining("answer") },
      attempts: [],
    });
    expect(getAlgorithmTrainingRelations(db, target).courses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "课程精选题", problemCount: 2 }),
        expect.objectContaining({ name: "程序设计实习", problemCount: 2 }),
      ]),
    );

    expect(previewAlgorithmLibraryPackage(db, target, pkg)).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 2,
    });
    importAlgorithmLibraryPackage(db, target, pkg, { packageSha256, createPackageFolder: true });
    expect(getAlgorithmDashboard(db, target, "2026-08-31").problems).toHaveLength(2);

    const targetFirst = getAlgorithmDashboard(db, target, "2026-08-31").problems.find(
      (problem) => problem.externalProblemId === "5001",
    )!;
    updateAlgorithmProblemDetails(db, target, targetFirst.id, { title: "我的自定义标题" });
    const updatedPackage = structuredClone(pkg);
    updatedPackage.problems[0].content.title = "题库发布者的新标题";
    updatedPackage.problems[0].contentSha256 = createHash("sha256")
      .update(JSON.stringify(updatedPackage.problems[0].content))
      .digest("hex");
    const parsedUpdate = parseAlgorithmLibraryPackage(JSON.stringify(updatedPackage));
    expect(previewAlgorithmLibraryPackage(db, target, parsedUpdate).updated).toBe(1);
    importAlgorithmLibraryPackage(db, target, parsedUpdate, {
      packageSha256: createHash("sha256").update(JSON.stringify(parsedUpdate)).digest("hex"),
    });
    expect(getAlgorithmDashboard(db, target, "2026-08-31").problems.find(
      (problem) => problem.externalProblemId === "5001",
    )?.title).toBe("我的自定义标题");
    expect(db.prepare(`
      SELECT title FROM algorithm_problems WHERE workspace_id = ? AND external_problem_id = '5001'
    `).get(target.workspaceId)).toEqual({ title: "题库发布者的新标题" });
  });

  it("allocates around number collisions and keeps workspaces isolated", () => {
    const db = createTestDb();
    const source = createTestWorkspace(db, { email: "number-source@example.com" });
    const target = createTestWorkspace(db, { email: "number-target@example.com" });
    const other = createTestWorkspace(db, { email: "number-other@example.com" });
    for (const scope of [source, target, other]) setPluginEnabled(db, scope, "algorithms", true);
    const sourceProblem = createAlgorithmProblem(db, source, {
      sourceUrl: "https://bailian.openjudge.cn/practice/6001/",
      title: "待导入题",
    });
    const existing = createAlgorithmProblem(db, target, {
      sourceUrl: "https://bailian.openjudge.cn/practice/6999/",
      title: "占用题号",
    });
    const pkg = buildAlgorithmLibraryPackage(db, source, {
      problemIds: [sourceProblem.id],
      name: "碰撞测试",
      exportedAt: "2026-08-31T00:00:00.000Z",
    });

    expect(previewAlgorithmLibraryPackage(db, target, pkg)).toMatchObject({
      created: 1,
      numberCollisions: 1,
    });
    importAlgorithmLibraryPackage(db, target, pkg, {
      packageSha256: "a".repeat(64),
      createPackageFolder: false,
    });
    const targetItems = listAlgorithmLibrary(db, target).items;
    expect(targetItems.find((item) => item.problemId === existing.id)?.libraryNumber).toBe(1);
    expect(targetItems.map((item) => item.libraryNumber).sort((left, right) => left - right)).toEqual([1, 2]);
    expect(getAlgorithmDashboard(db, other, "2026-08-31").problems).toHaveLength(0);
  });

  it("rejects corrupt and duplicate package content", () => {
    expect(() => parseAlgorithmLibraryPackage("not-json")).toThrow("有效的 JSON");
    expect(() => parseAlgorithmLibraryPackage(JSON.stringify({
      schema: "ascend.algorithm-library",
      schemaVersion: 99,
      package: {},
      problems: [],
    }))).toThrow();
  });
});
