const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createLibraryIndex,
  folderProblemCount,
  folderStats,
  formatProblemLabel,
  permanentProblemNumber,
  problemMatches,
  problemStatus,
  createPracticeSections,
  compactMoveEntries,
  insertionBeforeTarget,
  moveLibraryEntriesCompat,
  normalizeViewMode,
  shouldUseLegacyLibraryMove,
  groupProblemsByPhase,
  groupProblemsByStage,
  problemsForCourseStage,
  smartProblemMatches,
  createWorkspaceDocument,
} = require("./library-tree");

test("indexes nested folders and keeps server ordering", () => {
  const data = {
    problems: [
      { id: 1, title: "第一题" },
      { id: 2, title: "第二题" },
    ],
    library: {
      folders: [
        { id: "child", parentId: "root", name: "子目录", sortOrder: 1 },
        { id: "root", parentId: null, name: "根目录", sortOrder: 1 },
      ],
      items: [
        { problemId: 2, folderId: "child", sortOrder: 1, libraryNumber: 12 },
        { problemId: 1, folderId: null, sortOrder: 1, libraryNumber: 1 },
      ],
    },
  };
  const index = createLibraryIndex(data);
  assert.equal(index.foldersByParent.get("")[0].id, "root");
  assert.equal(index.itemsByFolder.get("child")[0].problemId, 2);
  assert.equal(folderProblemCount(index, "root"), 1);
  assert.equal(formatProblemLabel(data.problems[1], data.library.items[0], index.numberWidth), "012 · 第二题");
  assert.equal(formatProblemLabel(data.problems[1], data.library.items[0], index.numberWidth, 1), "01 · 第二题");
  assert.equal(permanentProblemNumber(data.problems[1], data.library.items[0], index.numberWidth), "P012");
});

test("computes learning status, folder progress and search matches", () => {
  const data = {
    today: "2026-08-20",
    problems: [
      { id: 1, title: "最短路", tags: ["图论"], evidenceStatus: "delayed_stable", libraryNumber: 1 },
      { id: 2, title: "区间 DP", tags: ["动态规划"], evidenceStatus: "attempted", nextReview: "2026-08-19" },
    ],
    library: {
      folders: [{ id: "folder-a", parentId: null, name: "专题", sortOrder: 1 }],
      items: [
        { problemId: 1, folderId: "folder-a", sortOrder: 1, libraryNumber: 1 },
        { problemId: 2, folderId: "folder-a", sortOrder: 2, libraryNumber: 2 },
      ],
    },
  };
  const index = createLibraryIndex(data);
  assert.deepEqual(folderStats(index, "folder-a", data.today), { total: 2, due: 1, stable: 1, percent: 50 });
  assert.equal(problemStatus(data.problems[1], data.today).key, "due");
  assert.equal(problemMatches(data.problems[0], data.library.items[0], "P001"), true);
  assert.equal(problemMatches(data.problems[0], data.library.items[0], "图论"), true);
  assert.equal(smartProblemMatches(data.problems[0], "stable", data.today), true);
  assert.equal(smartProblemMatches(data.problems[1], "due", data.today), true);
  assert.equal(smartProblemMatches({ materialStatus: "doing" }, "doing", data.today), true);
  assert.equal(smartProblemMatches({ hasFailedAttempt: true }, "failed", data.today), true);
  assert.equal(smartProblemMatches({ evidenceStatus: "unseen" }, "unseen", data.today), true);
});

test("builds a VS Code multi-root workspace from known local problem paths", () => {
  const document = JSON.parse(
    createWorkspaceDocument([
      { name: "第一题", path: "/tmp/problems/001" },
      { name: "第二题", path: "/tmp/problems/002" },
    ]),
  );
  assert.deepEqual(document, {
    folders: [
      { name: "第一题", path: "/tmp/problems/001" },
      { name: "第二题", path: "/tmp/problems/002" },
    ],
    settings: {},
  });
});

test("builds learning navigation data with deduplicated action queues", () => {
  const due = {
    id: 1,
    title: "到期题",
    materialStatus: "review",
    nextReview: "2026-08-19",
    lastAttemptDay: "2026-08-18",
  };
  const doing = { id: 2, title: "训练中", materialStatus: "doing", hasFailedAttempt: true };
  const stable = { id: 3, title: "已掌握", evidenceStatus: "delayed_stable" };
  const unseen = { id: 4, title: "新题", evidenceStatus: "unseen" };
  const sections = createPracticeSections({
    today: "2026-08-20",
    problems: [due, doing, stable, unseen],
    todayQueue: [due, doing, unseen],
    due: [due],
    library: { items: [{ problemId: 1 }, { problemId: 2 }, { problemId: 3 }, { problemId: 4 }] },
  });

  assert.deepEqual(
    sections.todayPlan.map((problem) => problem.id),
    [1, 2, 4],
  );
  assert.deepEqual(sections.due.map((problem) => problem.id), [1]);
  assert.deepEqual(sections.continueLearning.map((problem) => problem.id), [2, 1]);
  assert.equal(sections.libraryCount, 4);
  assert.deepEqual(
    sections.progress.doing.map((problem) => problem.id),
    [2],
  );
  assert.deepEqual(
    sections.progress.failed.map((problem) => problem.id),
    [2],
  );
  assert.deepEqual(
    sections.progress.stable.map((problem) => problem.id),
    [3],
  );
  assert.deepEqual(
    sections.filters.unseen.map((problem) => problem.id),
    [4],
  );
  assert.deepEqual(
    sections.filters.recent.map((problem) => problem.id),
    [1],
  );
});

test("groups course problems by ordered phase", () => {
  const groups = groupProblemsByPhase([
    { id: 3, phaseKey: "W3" },
    { id: 1, phaseKey: "W1" },
    { id: 4, phaseKey: "" },
    { id: 2, phaseKey: "W2" },
  ]);
  assert.deepEqual(groups.map((group) => group.phaseKey), ["W1", "W2", "W3", "未分阶段"]);
});

test("groups course problems by membership stage for the requested course", () => {
  const groups = groupProblemsByStage(
    [
      { id: 3, courses: [{ courseKey: "c1", stageKey: "例题" }, { courseKey: "c2", stageKey: "W9" }] },
      { id: 1, courses: [{ courseKey: "c1", stageKey: "课后习题" }] },
      { id: 2, courses: [{ courseKey: "c1", stageKey: "例题" }] },
      { id: 4, courses: [] },
    ],
    "c1",
  );
  assert.deepEqual(groups.map((group) => group.phaseKey), ["课后习题", "例题", "未分阶段"]);
  assert.deepEqual(groups[1].problems.map((problem) => problem.id), [3, 2]);
  // c2 的归属不影响 c1 的分组
  assert.equal(groups[1].problems[0].courses.length, 2);
});

test("stage grouping keeps numeric stage order across double digits", () => {
  const groups = groupProblemsByStage(
    [
      { id: 1, courses: [{ courseKey: "c", stageKey: "W10" }] },
      { id: 2, courses: [{ courseKey: "c", stageKey: "W2" }] },
    ],
    "c",
  );
  assert.deepEqual(groups.map((group) => group.phaseKey), ["W2", "W10"]);
});

test("places one past paper in its topic chapter and comprehensive chapter", () => {
  const problem = {
    id: 1,
    courses: [
      { courseKey: "curriculum", stageKey: "8. 图论与最短路" },
      { courseKey: "curriculum", stageKey: "9. 历年机试综合" },
    ],
  };
  const groups = groupProblemsByStage([problem], "curriculum");
  assert.deepEqual(groups.map((group) => group.phaseKey), ["8. 图论与最短路", "9. 历年机试综合"]);
  assert.deepEqual(groups.map((group) => group.problems[0].id), [1, 1]);
});

test("returns the concrete problems under a persisted curriculum chapter", () => {
  const problems = [
    { id: 1, phaseKey: "W1", courses: [{ courseKey: "curriculum", stageKey: "1. 基础语法与 STL" }] },
    { id: 2, phaseKey: "W1", courses: [{ courseKey: "curriculum", stageKey: "2. 模拟与枚举" }] },
    { id: 3, phaseKey: "W5", courses: [{ courseKey: "source", stageKey: "1. 基础语法与 STL" }] },
  ];
  assert.deepEqual(
    problemsForCourseStage(problems, "curriculum", "1. 基础语法与 STL").map((problem) => problem.id),
    [1],
  );
});

test("compacts multi-selection when a selected folder already carries descendants", () => {
  const data = {
    problems: [{ id: 1 }, { id: 2 }],
    library: {
      folders: [
        { id: "parent", parentId: null, name: "父", sortOrder: 1 },
        { id: "child", parentId: "parent", name: "子", sortOrder: 1 },
      ],
      items: [
        { problemId: 1, folderId: "child", sortOrder: 1, libraryNumber: 1 },
        { problemId: 2, folderId: null, sortOrder: 1, libraryNumber: 2 },
      ],
    },
  };
  const entries = compactMoveEntries(
    [
      { kind: "folder", id: "parent" },
      { kind: "folder", id: "child" },
      { kind: "problem", id: 1 },
      { kind: "problem", id: 2 },
      { kind: "problem", id: 2 },
    ],
    createLibraryIndex(data),
  );
  assert.deepEqual(entries, [
    { kind: "folder", id: "parent" },
    { kind: "problem", id: 2 },
  ]);
});

test("resolves a normal row drop to the position before the highlighted target", () => {
  const entries = [{ problemId: 11 }, { problemId: 12 }, { problemId: 13 }, { problemId: 14 }];
  assert.deepEqual(insertionBeforeTarget(entries, "problemId", 11, [13]), {
    placeFirst: true,
    afterId: null,
  });
  assert.deepEqual(insertionBeforeTarget(entries, "problemId", 14, [12]), {
    placeFirst: false,
    afterId: 13,
  });
  assert.equal(insertionBeforeTarget(entries, "problemId", 99), null);
});

test("uses at least three digits for a compact stable number", () => {
  const index = createLibraryIndex({ problems: [], library: { folders: [], items: [] } });
  assert.equal(index.numberWidth, 3);
  assert.equal(formatProblemLabel({ id: 7, title: "A+B" }, null, index.numberWidth), "007 · A+B");
});

test("normalizes persisted navigation modes", () => {
  assert.equal(normalizeViewMode("learning"), "learning");
  assert.equal(normalizeViewMode("catalog"), "catalog");
  assert.equal(normalizeViewMode("directory"), "directory");
  assert.equal(normalizeViewMode("unknown"), "learning");
});

test("uses the batch library move API when the server supports it", async () => {
  const calls = [];
  const result = await moveLibraryEntriesCompat(
    {
      moveLibraryItems: async (entries) => calls.push(["batch", entries]),
      moveLibraryItem: async (entry) => calls.push(["single", entry]),
    },
    [{ kind: "problem", id: 1, targetFolderId: "folder-a" }],
  );
  assert.equal(result, "batch");
  assert.deepEqual(calls.map(([kind]) => kind), ["batch"]);
});

test("falls back to the legacy single-entry API for an older server", async () => {
  const calls = [];
  const entries = [
    { kind: "problem", id: 1, targetFolderId: "folder-a" },
    { kind: "problem", id: 2, targetFolderId: "folder-a" },
  ];
  const result = await moveLibraryEntriesCompat(
    {
      moveLibraryItems: async () => {
        throw new Error("题目库拖拽类型无效");
      },
      moveLibraryItem: async (entry) => calls.push(entry),
    },
    entries,
  );
  assert.equal(result, "legacy");
  assert.deepEqual(calls, entries);
  assert.equal(shouldUseLegacyLibraryMove(new Error("题目库拖拽类型无效")), true);
});

test("keeps unrelated library move failures visible", async () => {
  await assert.rejects(
    moveLibraryEntriesCompat(
      {
        moveLibraryItems: async () => {
          throw new Error("服务器暂时不可用");
        },
        moveLibraryItem: async () => assert.fail("single-entry fallback should stay unused"),
      },
      [{ kind: "problem", id: 1, targetFolderId: null }],
    ),
    /服务器暂时不可用/,
  );
});
