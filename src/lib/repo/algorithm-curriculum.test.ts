import { describe, expect, it } from "vitest";
import { ALGORITHM_CURRICULUM_COURSE_KEY } from "../algorithm-curriculum";
import { createAlgorithmProblem } from "./algorithms";
import { listAlgorithmCurriculum, setAlgorithmCurriculumChapter } from "./algorithm-curriculum";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

describe("persisted algorithm curriculum", () => {
  it("stores all chapters and assigns new problems to a primary chapter", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const problem = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/2754/",
      title: "八皇后",
      tags: ["DFS", "回溯"],
    });

    const curriculum = listAlgorithmCurriculum(db, scope);
    expect(curriculum.key).toBe(ALGORITHM_CURRICULUM_COURSE_KEY);
    expect(curriculum.chapters).toHaveLength(9);
    expect(curriculum.items).toContainEqual(expect.objectContaining({
      problemId: problem.id,
      chapterKey: "graph-search",
      membershipKind: "primary",
    }));
  });

  it("moves the primary chapter and preserves a supplementary exam membership", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const problem = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/exercises/official/2025-autumn/a.cpp",
      externalProblemId: "exercises/official/2025-autumn/a.cpp",
      title: "最短路综合题",
      tags: ["最短路"],
    });

    expect(listAlgorithmCurriculum(db, scope).items.filter((item) => item.problemId === problem.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chapterKey: "graph-shortest-path", membershipKind: "primary" }),
        expect.objectContaining({ chapterKey: "exam-practice", membershipKind: "supplementary" }),
      ]),
    );

    setAlgorithmCurriculumChapter(db, scope, { problemIds: [problem.id], chapterKey: "dynamic-programming" });

    expect(listAlgorithmCurriculum(db, scope).items.filter((item) => item.problemId === problem.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chapterKey: "dynamic-programming", membershipKind: "primary" }),
        expect.objectContaining({ chapterKey: "exam-practice", membershipKind: "supplementary" }),
      ]),
    );
  });

  it("keeps chapter writes inside the active workspace", () => {
    const db = createTestDb();
    const first = createTestWorkspace(db);
    const second = createTestWorkspace(db);
    setPluginEnabled(db, first, "algorithms", true);
    setPluginEnabled(db, second, "algorithms", true);
    const problem = createAlgorithmProblem(db, first, {
      sourceUrl: "https://bailian.openjudge.cn/practice/2742/",
      title: "统计字符数",
    });

    expect(() => setAlgorithmCurriculumChapter(db, second, {
      problemIds: [problem.id],
      chapterKey: "cpp-stl",
    })).toThrow("题目列表包含无效记录");
  });
});
