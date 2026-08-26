import { describe, expect, it } from "vitest";
import {
  createAlgorithmLibraryFolder,
  deleteAlgorithmLibraryFolder,
  listAlgorithmLibrary,
  moveAlgorithmLibraryEntries,
  moveAlgorithmLibraryFolder,
  moveAlgorithmLibraryProblem,
  reorderAlgorithmLibraryFolder,
  renameAlgorithmLibraryFolder,
} from "./algorithm-library";
import { createAlgorithmProblem } from "./algorithms";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

describe("algorithm library tree", () => {
  it("assigns stable numbers and persists nested folder moves", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const first = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/2001/",
      title: "第一题",
    });
    const second = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/2002/",
      title: "第二题",
    });

    const initial = listAlgorithmLibrary(db, scope);
    expect(initial.items.map((item) => [item.problemId, item.libraryNumber])).toEqual([
      [first.id, 1],
      [second.id, 2],
    ]);

    const dynamicProgramming = createAlgorithmLibraryFolder(db, scope, { name: "动态规划" });
    const interval = createAlgorithmLibraryFolder(db, scope, {
      name: "区间 DP",
      parentId: dynamicProgramming.id,
    });
    moveAlgorithmLibraryProblem(db, scope, {
      problemId: second.id,
      targetFolderId: interval.id,
    });
    moveAlgorithmLibraryProblem(db, scope, {
      problemId: first.id,
      targetFolderId: interval.id,
      afterProblemId: second.id,
    });

    const organized = listAlgorithmLibrary(db, scope);
    expect(organized.folders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: dynamicProgramming.id, parentId: null }),
        expect.objectContaining({ id: interval.id, parentId: dynamicProgramming.id }),
      ]),
    );
    expect(organized.items.map((item) => [item.problemId, item.folderId, item.sortOrder, item.libraryNumber])).toEqual([
      [second.id, interval.id, 1, 2],
      [first.id, interval.id, 2, 1],
    ]);

    moveAlgorithmLibraryProblem(db, scope, { problemId: first.id, targetFolderId: null });
    expect(listAlgorithmLibrary(db, scope).items.find((item) => item.problemId === first.id)).toMatchObject({
      folderId: null,
      libraryNumber: 1,
    });
  });

  it("validates folder names, cycles, workspace scope and non-empty deletion", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const other = createTestWorkspace(db, { email: "other-library@example.com" });
    setPluginEnabled(db, scope, "algorithms", true);
    setPluginEnabled(db, other, "algorithms", true);
    const parent = createAlgorithmLibraryFolder(db, scope, { name: "图论" });
    const child = createAlgorithmLibraryFolder(db, scope, { name: "最短路", parentId: parent.id });

    expect(() => createAlgorithmLibraryFolder(db, scope, { name: "图论" })).toThrow("已经存在");
    expect(() => createAlgorithmLibraryFolder(db, scope, { name: "a/b" })).toThrow("无效字符");
    expect(() => moveAlgorithmLibraryFolder(db, scope, { folderId: parent.id, targetParentId: child.id })).toThrow(
      "自身或其子文件夹",
    );
    expect(() => deleteAlgorithmLibraryFolder(db, scope, parent.id)).toThrow("请先移动");
    expect(() => renameAlgorithmLibraryFolder(db, other, parent.id, "跨空间")).toThrow("不存在");

    renameAlgorithmLibraryFolder(db, scope, child.id, "单源最短路");
    moveAlgorithmLibraryFolder(db, scope, { folderId: child.id, targetParentId: null });
    deleteAlgorithmLibraryFolder(db, scope, parent.id);
    expect(listAlgorithmLibrary(db, scope).folders).toEqual([
      expect.objectContaining({ id: child.id, name: "单源最短路", parentId: null }),
    ]);
  });

  it("gives newly imported problems the next permanent number", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const first = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/3001/",
      title: "已有题目",
    });
    expect(listAlgorithmLibrary(db, scope).items[0]).toMatchObject({ problemId: first.id, libraryNumber: 1 });
    const next = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/3002/",
      title: "新增题目",
    });
    expect(listAlgorithmLibrary(db, scope).items.find((item) => item.problemId === next.id)).toMatchObject({
      libraryNumber: 2,
    });
  });

  it("reorders folders and promotes contents when deleting", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const problem = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/4001/",
      title: "待提升题目",
    });
    const first = createAlgorithmLibraryFolder(db, scope, { name: "第一组" });
    const second = createAlgorithmLibraryFolder(db, scope, { name: "第二组" });
    const child = createAlgorithmLibraryFolder(db, scope, { name: "子组", parentId: second.id });
    moveAlgorithmLibraryProblem(db, scope, { problemId: problem.id, targetFolderId: second.id });

    reorderAlgorithmLibraryFolder(db, scope, { folderId: second.id, direction: "first" });
    expect(
      listAlgorithmLibrary(db, scope)
        .folders.filter((folder) => folder.parentId === null)
        .map((folder) => folder.id),
    ).toEqual([second.id, first.id]);

    deleteAlgorithmLibraryFolder(db, scope, second.id, { promoteContents: true });
    const promoted = listAlgorithmLibrary(db, scope);
    expect(promoted.folders.find((folder) => folder.id === child.id)).toMatchObject({ parentId: null });
    expect(promoted.items.find((item) => item.problemId === problem.id)).toMatchObject({ folderId: null });
  });

  it("moves multiple entries atomically", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const left = createAlgorithmLibraryFolder(db, scope, { name: "左侧" });
    const right = createAlgorithmLibraryFolder(db, scope, { name: "右侧" });
    const leftTopic = createAlgorithmLibraryFolder(db, scope, { name: "专题", parentId: left.id });
    const rightTopic = createAlgorithmLibraryFolder(db, scope, { name: "专题", parentId: right.id });

    expect(() =>
      moveAlgorithmLibraryEntries(db, scope, [
        { kind: "folder", id: leftTopic.id, targetFolderId: null },
        { kind: "folder", id: rightTopic.id, targetFolderId: null },
      ]),
    ).toThrow("已经存在");

    const folders = listAlgorithmLibrary(db, scope).folders;
    expect(folders.find((folder) => folder.id === leftTopic.id)?.parentId).toBe(left.id);
    expect(folders.find((folder) => folder.id === rightTopic.id)?.parentId).toBe(right.id);
  });
});
