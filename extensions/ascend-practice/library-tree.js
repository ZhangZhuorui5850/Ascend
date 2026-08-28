function createLibraryIndex(data) {
  const fallbackItems = (data?.problems || []).map((problem, index) => ({
    problemId: problem.id,
    folderId: null,
    sortOrder: index + 1,
    libraryNumber: problem.libraryNumber || problem.id,
  }));
  const library = data?.library || { folders: [], items: fallbackItems };
  const problems = new Map((data?.problems || []).map((problem) => [Number(problem.id), problem]));
  const foldersById = new Map();
  const foldersByParent = new Map();
  const itemsByFolder = new Map();
  const itemByProblem = new Map();
  for (const folder of library.folders || []) {
    foldersById.set(folder.id, folder);
    const key = folder.parentId || "";
    const list = foldersByParent.get(key) || [];
    list.push(folder);
    foldersByParent.set(key, list);
  }
  for (const item of library.items || []) {
    const key = item.folderId || "";
    const list = itemsByFolder.get(key) || [];
    list.push(item);
    itemsByFolder.set(key, list);
    itemByProblem.set(Number(item.problemId), item);
  }
  for (const list of foldersByParent.values()) {
    list.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN"));
  }
  for (const list of itemsByFolder.values()) {
    list.sort((left, right) => left.sortOrder - right.sortOrder || left.libraryNumber - right.libraryNumber);
  }
  const maximum = Math.max(0, ...(library.items || []).map((item) => Number(item.libraryNumber) || 0));
  return {
    foldersById,
    foldersByParent,
    itemsByFolder,
    itemByProblem,
    problems,
    numberWidth: Math.max(3, String(maximum).length),
  };
}

function formatProblemLabel(problem, libraryItem, width = 3, visiblePosition = null) {
  const number = Number(libraryItem?.libraryNumber || problem?.libraryNumber || problem?.id || 0);
  const visible = visiblePosition === null ? number : Number(visiblePosition);
  const visibleWidth = visiblePosition === null ? width : Math.max(2, String(visible).length);
  return `${String(visible).padStart(visibleWidth, "0")} · ${problem?.title || "未命名题目"}`;
}

function permanentProblemNumber(problem, libraryItem, width = 3) {
  const number = Number(libraryItem?.libraryNumber || problem?.libraryNumber || problem?.id || 0);
  return `P${String(number).padStart(width, "0")}`;
}

function problemStatus(problem, today) {
  if (problem?.nextReview && problem.nextReview <= today) return { key: "due", label: "到期复测", icon: "history" };
  if (problem?.materialStatus === "doing") return { key: "doing", label: "正在训练", icon: "debug-start" };
  if (problem?.lastVerdict && problem.lastVerdict !== "AC")
    return { key: "failed", label: problem.lastVerdict, icon: "error" };
  if (["delayed_stable", "transfer_verified"].includes(problem?.evidenceStatus)) {
    return { key: "stable", label: "已稳定", icon: "pass-filled" };
  }
  if (problem?.evidenceStatus === "unseen") return { key: "unseen", label: "未开始", icon: "circle-outline" };
  if (problem?.evidenceStatus === "independent_completed") {
    return { key: "completed", label: "独立完成", icon: "check" };
  }
  return { key: "learning", label: "学习中", icon: "code" };
}

function folderStats(index, folderId, today) {
  const problemIds = [];
  collectFolderProblemIds(index, folderId, problemIds);
  const problems = problemIds.map((id) => index.problems.get(Number(id))).filter(Boolean);
  const due = problems.filter((problem) => problemStatus(problem, today).key === "due").length;
  const stable = problems.filter((problem) => problemStatus(problem, today).key === "stable").length;
  return {
    total: problems.length,
    due,
    stable,
    percent: problems.length ? Math.round((stable / problems.length) * 100) : 0,
  };
}

function collectFolderProblemIds(index, folderId, output) {
  for (const item of index.itemsByFolder.get(folderId) || []) output.push(item.problemId);
  for (const child of index.foldersByParent.get(folderId) || []) collectFolderProblemIds(index, child.id, output);
}

function problemMatches(problem, libraryItem, query) {
  const normalized = String(query || "")
    .trim()
    .toLocaleLowerCase("zh-CN");
  if (!normalized) return true;
  const permanent = permanentProblemNumber(problem, libraryItem, 3).toLowerCase();
  return [
    problem?.title,
    problem?.externalProblemId,
    problem?.providerLabel,
    problem?.phaseKey,
    problem?.priorityBand,
    permanent,
    ...(problem?.tags || []),
  ].some((value) =>
    String(value || "")
      .toLocaleLowerCase("zh-CN")
      .includes(normalized),
  );
}

function smartProblemMatches(problem, key, today) {
  if (key === "unseen") return problem?.evidenceStatus === "unseen";
  if (key === "doing") return problem?.materialStatus === "doing";
  if (key === "due") return Boolean(problem?.nextReview && problem.nextReview <= today);
  if (key === "failed") return Boolean(problem?.hasFailedAttempt);
  if (key === "stable") return ["delayed_stable", "transfer_verified"].includes(problem?.evidenceStatus);
  if (key === "recent") return Boolean(problem?.lastAttemptDay);
  return false;
}

function createPracticeSections(data) {
  const problems = data?.problems || [];
  const today = data?.today || "";
  const todayPlan = uniqueProblems(data?.todayQueue || []);
  const due = problems.filter((problem) => smartProblemMatches(problem, "due", today));
  const recent = problems
    .filter((problem) => smartProblemMatches(problem, "recent", today))
    .sort((left, right) => right.lastAttemptDay.localeCompare(left.lastAttemptDay));
  const doing = problems
    .filter((problem) => smartProblemMatches(problem, "doing", today))
    .sort((left, right) => String(right.lastAttemptDay || "").localeCompare(String(left.lastAttemptDay || "")));
  const continueLearning = uniqueProblems(
    doing,
    recent,
  ).slice(0, 20);
  return {
    todayPlan,
    due,
    continueLearning,
    libraryCount: data?.library?.items?.length ?? problems.length,
    progress: {
      doing: problems.filter((problem) => smartProblemMatches(problem, "doing", today)),
      failed: problems.filter((problem) => smartProblemMatches(problem, "failed", today)),
      stable: problems.filter((problem) => smartProblemMatches(problem, "stable", today)),
    },
    filters: {
      unseen: problems.filter((problem) => smartProblemMatches(problem, "unseen", today)),
      recent: recent.slice(0, 20),
    },
  };
}

function groupProblemsByPhase(problems) {
  const groups = new Map();
  for (const problem of problems || []) {
    const key = String(problem?.phaseKey || "").trim() || "未分阶段";
    const list = groups.get(key) || [];
    list.push(problem);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([phaseKey, items]) => ({ phaseKey, problems: items }))
    .sort((left, right) => phaseOrder(left.phaseKey) - phaseOrder(right.phaseKey) || left.phaseKey.localeCompare(right.phaseKey, "zh-CN"));
}

function phaseOrder(phaseKey) {
  const match = String(phaseKey).match(/^W(\d+)/i);
  return match ? Number(match[1]) : phaseKey === "未分阶段" ? 10_000 : 1_000;
}

/** 按课程归属的阶段分组（与网页「课程与阶段」同一套 memberships 数据）。 */
function groupProblemsByStage(problems, courseKey) {
  const groups = new Map();
  for (const problem of problems || []) {
    const membership = (problem?.courses || []).find((course) => course.courseKey === courseKey);
    const key = String(membership?.stageKey || "").trim() || "未分阶段";
    const list = groups.get(key) || [];
    list.push(problem);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([phaseKey, items]) => ({ phaseKey, problems: items }))
    .sort((left, right) => phaseOrder(left.phaseKey) - phaseOrder(right.phaseKey) || left.phaseKey.localeCompare(right.phaseKey, "zh-CN"));
}

function compactMoveEntries(entries, index) {
  const unique = [];
  const seen = new Set();
  for (const entry of entries || []) {
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  const selectedFolders = new Set(unique.filter((entry) => entry.kind === "folder").map((entry) => entry.id));
  const movingFolders = new Set(
    [...selectedFolders].filter((folderId) => {
      let parentId = index.foldersById.get(folderId)?.parentId || null;
      while (parentId) {
        if (selectedFolders.has(parentId)) return false;
        parentId = index.foldersById.get(parentId)?.parentId || null;
      }
      return true;
    }),
  );
  const problemMovesWithFolder = (problemId) => {
    let folderId = index.itemByProblem.get(Number(problemId))?.folderId || null;
    while (folderId) {
      if (movingFolders.has(folderId)) return true;
      folderId = index.foldersById.get(folderId)?.parentId || null;
    }
    return false;
  };
  return unique.filter((entry) =>
    entry.kind === "folder" ? movingFolders.has(entry.id) : !problemMovesWithFolder(entry.id),
  );
}

function insertionBeforeTarget(entries, idKey, targetId, movingIds = []) {
  const moving = new Set(movingIds.map(String));
  const ordered = (entries || []).filter((entry) => !moving.has(String(entry[idKey])));
  const targetIndex = ordered.findIndex((entry) => String(entry[idKey]) === String(targetId));
  if (targetIndex < 0) return null;
  return {
    placeFirst: targetIndex === 0,
    afterId: targetIndex > 0 ? ordered[targetIndex - 1][idKey] : null,
  };
}

function normalizeViewMode(value) {
  return ["learning", "catalog", "directory"].includes(value) ? value : "learning";
}

function shouldUseLegacyLibraryMove(error) {
  const message = String(error?.message || error || "");
  return message.includes("题目库拖拽类型无效") || message.includes("批量移动格式无效");
}

async function moveLibraryEntriesCompat(api, entries) {
  try {
    await api.moveLibraryItems(entries);
    return "batch";
  } catch (error) {
    if (!shouldUseLegacyLibraryMove(error)) throw error;
    for (const entry of entries) await api.moveLibraryItem(entry);
    return "legacy";
  }
}

function uniqueProblems(...groups) {
  const seen = new Set();
  const result = [];
  for (const problem of groups.flat()) {
    const id = Number(problem?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(problem);
  }
  return result;
}

function createWorkspaceDocument(folders) {
  return JSON.stringify(
    {
      folders: folders.map((folder) => ({ name: folder.name || undefined, path: folder.path })),
      settings: {},
    },
    null,
    2,
  );
}

function folderProblemCount(index, folderId) {
  let count = (index.itemsByFolder.get(folderId) || []).length;
  for (const child of index.foldersByParent.get(folderId) || []) count += folderProblemCount(index, child.id);
  return count;
}

module.exports = {
  createLibraryIndex,
  folderProblemCount,
  folderStats,
  formatProblemLabel,
  permanentProblemNumber,
  problemMatches,
  problemStatus,
  createPracticeSections,
  groupProblemsByStage,
  compactMoveEntries,
  insertionBeforeTarget,
  moveLibraryEntriesCompat,
  normalizeViewMode,
  shouldUseLegacyLibraryMove,
  groupProblemsByPhase,
  smartProblemMatches,
  createWorkspaceDocument,
};
