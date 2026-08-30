const vscode = require("vscode");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const {
  escapeHtml,
  firstOutputDifference,
  renderMarkdown,
  safeSegment,
  selectInitialSource,
} = require("./session-core");
const {
  ConnectionError,
  classifyConnectionError,
  normalizeBaseUrl,
  profileIdFor,
  profileNameFor,
  statePresentation,
} = require("./connections");
const {
  createLibraryIndex,
  compactMoveEntries,
  folderStats,
  formatProblemLabel,
  permanentProblemNumber,
  problemMatches,
  problemStatus,
  createPracticeSections,
  groupProblemsByPhase,
  groupProblemsByStage,
  problemsForCourseStage,
  insertionBeforeTarget,
  moveLibraryEntriesCompat,
  smartProblemMatches,
  createWorkspaceDocument,
} = require("./library-tree");
const {
  localProblemKey,
  metadataMatchesScope,
  migrateLegacyProblemPaths,
  profileScopeKey,
  scopedProblemPaths,
  withScopedProblemPath,
} = require("./profile-state");
const { runProcess } = require("./process-runner");
const { SessionActivityTracker } = require("./activity-tracker");
const { draftConflictDecision, draftConflictFromError } = require("./draft-sync");
const { AscendApi } = require("./src/api-client");

const TOKEN_KEY = "ascendPractice.deviceToken";
const PROFILES_KEY = "ascendPractice.connectionProfiles.v1";
const ACTIVE_PROFILE_KEY = "ascendPractice.activeConnectionProfile.v1";
const PROFILE_TOKEN_PREFIX = "ascendPractice.connectionToken.v1.";
const LEGACY_PROBLEM_PATHS_KEY = "ascendPractice.problemPaths.v1";
const PROBLEM_PATHS_KEY = "ascendPractice.problemPaths.v2";
const EXPANDED_FOLDERS_KEY = "ascendPractice.expandedFolders.v1";
const LIBRARY_SORT_KEY = "ascendPractice.librarySort.v1";
const LIBRARY_SELECTION_KEY = "ascendPractice.librarySelection.v1";
const CURRENT_COURSE_KEY = "ascendPractice.currentCourse.v1";
const META_FILE = ".ascend.json";
const LIBRARY_DRAG_MIME = "application/vnd.code.tree.ascendpractice.library";

class ConnectionManager {
  constructor(context) {
    this.context = context;
    this.environment = describeEnvironment();
  }

  async initialize() {
    const legacyToken = await this.context.secrets.get(TOKEN_KEY);
    if (!legacyToken) return;
    const baseUrl = normalizeBaseUrl(
      vscode.workspace.getConfiguration("ascendPractice").get("baseUrl", "https://ascend.zhuorui.me"),
    );
    const id = profileIdFor(baseUrl, this.environment);
    if (!this.profiles().some((profile) => profile.id === id)) {
      await this.save({ baseUrl, name: profileNameFor(baseUrl) }, legacyToken);
    }
  }

  profiles() {
    return [...this.context.globalState.get(PROFILES_KEY, [])].sort((left, right) =>
      String(right.lastUsedAt || "").localeCompare(String(left.lastUsedAt || "")),
    );
  }

  active() {
    const profiles = this.profiles();
    const id = this.context.workspaceState.get(ACTIVE_PROFILE_KEY) || this.context.globalState.get(ACTIVE_PROFILE_KEY);
    return profiles.find((profile) => profile.id === id) || profiles[0] || null;
  }

  async token(profile = this.active()) {
    return profile ? this.context.secrets.get(`${PROFILE_TOKEN_PREFIX}${profile.id}`) : undefined;
  }

  async select(id) {
    const profile = this.profiles().find((candidate) => candidate.id === id);
    if (!profile) throw new ConnectionError("unpaired", "连接档案已经移除");
    const updated = { ...profile, lastUsedAt: new Date().toISOString() };
    await this.replaceProfile(updated);
    await this.context.workspaceState.update(ACTIVE_PROFILE_KEY, id);
    await this.context.globalState.update(ACTIVE_PROFILE_KEY, id);
    await vscode.workspace
      .getConfiguration("ascendPractice")
      .update("baseUrl", updated.baseUrl, vscode.ConfigurationTarget.Global);
    return updated;
  }

  async save(input, token) {
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const id = profileIdFor(baseUrl, this.environment);
    const prior = this.profiles().find((profile) => profile.id === id);
    const now = new Date().toISOString();
    const profile = {
      id,
      name: String(input.name || prior?.name || profileNameFor(baseUrl))
        .trim()
        .slice(0, 60),
      baseUrl,
      environment: this.environment,
      deviceName: String(input.deviceName || prior?.deviceName || "VS Code")
        .trim()
        .slice(0, 60),
      createdAt: prior?.createdAt || now,
      lastUsedAt: now,
    };
    await this.replaceProfile(profile);
    await this.context.secrets.store(`${PROFILE_TOKEN_PREFIX}${id}`, String(token).trim());
    await this.select(id);
    return profile;
  }

  async remove(id) {
    const profiles = this.profiles().filter((profile) => profile.id !== id);
    await this.context.globalState.update(PROFILES_KEY, profiles);
    await this.context.secrets.delete(`${PROFILE_TOKEN_PREFIX}${id}`);
    const next = profiles[0];
    await this.context.workspaceState.update(ACTIVE_PROFILE_KEY, next?.id);
    await this.context.globalState.update(ACTIVE_PROFILE_KEY, next?.id);
  }

  async replaceProfile(profile) {
    const profiles = this.profiles().filter((candidate) => candidate.id !== profile.id);
    profiles.push(profile);
    await this.context.globalState.update(PROFILES_KEY, profiles);
  }
}

class PracticeTreeProvider {
  constructor(api, onStateChange, context) {
    this.api = api;
    this.context = context;
    this.data = null;
    this.state = { kind: "unpaired", message: "连接 Ascend 后读取今日题目" };
    this.libraryIndex = createLibraryIndex(null);
    this.query = "";
    this.sortMode = context.workspaceState.get(LIBRARY_SORT_KEY, "manual");
    this.currentCourseId = context.workspaceState.get(CURRENT_COURSE_KEY, "");
    this.lastMove = null;
    this.expandedFolderIds = new Set(context.workspaceState.get(EXPANDED_FOLDERS_KEY, []));
    this.dragMimeTypes = [LIBRARY_DRAG_MIME];
    this.dropMimeTypes = [LIBRARY_DRAG_MIME];
    this.onStateChange = onStateChange;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
  }

  async refresh(options = {}) {
    try {
      this.data = await this.api.queue();
      this.libraryIndex = createLibraryIndex(this.data);
      if (!this.preferredCourses().some((collection) => collection.id === this.currentCourseId)) {
        this.currentCourseId = this.preferredCourses()[0]?.id || "";
        await this.context.workspaceState.update(CURRENT_COURSE_KEY, this.currentCourseId);
      }
      const scopeKey = this.scopeKey();
      const store = this.context.globalState.get(PROBLEM_PATHS_KEY, {});
      const migrated = migrateLegacyProblemPaths(
        store,
        scopeKey,
        this.context.globalState.get(LEGACY_PROBLEM_PATHS_KEY, {}),
      );
      if (migrated !== store) await this.context.globalState.update(PROBLEM_PATHS_KEY, migrated);
      this.setState("connected", "今日题目已更新");
      this.emitter.fire();
    } catch (error) {
      this.data = null;
      this.libraryIndex = createLibraryIndex(null);
      const kind = classifyConnectionError(error);
      this.setState(kind, String(error.message || error));
      this.emitter.fire();
      if (options.notify) vscode.window.showErrorMessage(String(error.message || error));
    }
  }

  setState(kind, message) {
    this.state = { kind, message };
    this.onStateChange?.(this.state);
  }

  getTreeItem(element) {
    return element;
  }

  scopeKey() {
    return profileScopeKey(this.api.connections.active(), this.data);
  }

  problemPaths() {
    return scopedProblemPaths(this.context.globalState.get(PROBLEM_PATHS_KEY, {}), this.scopeKey());
  }

  getParent(element) {
    if (element.group === "libraryUnfiled") return personalDirectoryItem(this.data, this.libraryIndex);
    if (element.group === "libraryFolder") {
      const folder = this.data?.library?.folders.find((candidate) => candidate.id === element.folderId);
      if (folder?.parentId) {
        const parent = this.data.library.folders.find((candidate) => candidate.id === folder.parentId);
        return parent ? this.folderItem(parent) : undefined;
      }
      return personalDirectoryItem(this.data, this.libraryIndex);
    }
    if (element.contextValue === "ascendLibraryProblem") {
      const libraryItem = this.libraryIndex.itemByProblem.get(Number(element.problemId));
      if (libraryItem?.folderId) {
        const folder = this.data?.library?.folders.find((candidate) => candidate.id === libraryItem.folderId);
        return folder ? this.folderItem(folder) : undefined;
      }
      return unfiledDirectoryItem(this.libraryIndex);
    }
    return undefined;
  }

  findPersistentElement(id) {
    if (!id || !this.data) return null;
    if (id === "ascend-library-unfiled") return unfiledDirectoryItem(this.libraryIndex);
    if (id.startsWith("ascend-library-folder:")) {
      const folder = this.data.library?.folders.find((candidate) => `ascend-library-folder:${candidate.id}` === id);
      return folder ? this.folderItem(folder) : null;
    }
    if (id.startsWith("ascend-library-problem:")) {
      const problemId = Number(id.slice("ascend-library-problem:".length));
      const problem = this.libraryIndex.problems.get(problemId);
      const libraryItem = this.libraryIndex.itemByProblem.get(problemId);
      return problem && libraryItem ? this.problemItem(problem, libraryItem, true) : null;
    }
    return null;
  }

  setSearchQuery(query) {
    this.query = String(query || "").trim();
    vscode.commands.executeCommand("setContext", "ascendPractice.hasProblemSearch", Boolean(this.query));
    this.emitter.fire();
  }

  setSortMode(mode) {
    this.sortMode = mode;
    this.context.workspaceState.update(LIBRARY_SORT_KEY, mode);
    this.emitter.fire();
  }

  async setCurrentCourse(collectionId) {
    if (!this.findCourseNode(collectionId)) {
      throw new Error("课程或题单已经不存在");
    }
    this.currentCourseId = collectionId;
    await this.context.workspaceState.update(CURRENT_COURSE_KEY, collectionId);
    this.emitter.fire();
  }

  async setFolderExpanded(folderId, expanded) {
    if (!folderId) return;
    if (expanded) this.expandedFolderIds.add(folderId);
    else this.expandedFolderIds.delete(folderId);
    await this.context.workspaceState.update(EXPANDED_FOLDERS_KEY, [...this.expandedFolderIds]);
  }

  async getChildren(element) {
    if (!this.data) {
      await this.refresh();
      if (!this.data) return [connectionMessageItem(this.state)];
    }
    if (!element) {
      if (this.query) {
        const matched = this.data.problems.filter((problem) => this.matchesProblem(problem));
        return [
          groupItem(`搜索结果：“${this.query}”`, "searchResults", matched.length, "search", "", {
            expanded: true,
            tooltip: "点击工具栏清除搜索，返回完整题目导航",
          }),
        ];
      }
      const sections = createPracticeSections(this.data);
      return [
        groupItem("今日训练", "todayPlan", sections.todayPlan.length, "calendar", "ascendTodayRoot", {
          expanded: true,
          tooltip: "网页端手动加入的今日训练",
        }),
        groupItem("到期复习", "smartView", sections.due.length, "history", "ascendReviewRoot", {
          smartKey: "due",
          tooltip: "今天到期的复习题",
        }),
        groupItem("题库", "catalogAll", this.data.problems.length, "library", "ascendCatalogRoot", {
          tooltip: "Ascend 中的全部算法题",
        }),
        personalDirectoryItem(this.data, this.libraryIndex),
      ];
    }
    if (element.group === "searchResults") {
      const results = this.problemItems(this.data.problems);
      return results.length ? results : [infoItem("没有找到匹配题目", "search-stop")];
    }
    if (element.group === "learning") {
      const sections = createPracticeSections(this.data);
      return [
        currentCourseItem(this.currentCourse(), this.courseProblems(this.currentCourseId).length),
        smartItem("今日任务", "todayPlan", sections.todayPlan.length, "calendar", {}),
        smartItem("到期复习", "smartView", sections.due.length, "history", { smartKey: "due" }),
        smartItem("继续上次", "continueLearning", sections.continueLearning.length, "debug-continue", {}),
        categoryItem("全部课程与题单", "courses", this.preferredCourses().length, "个", "list-tree", "选择和浏览学习路线"),
      ];
    }
    if (element.group === "todayPlan") {
      const plan = this.problemItems(createPracticeSections(this.data).todayPlan);
      return plan.length ? plan : [infoItem("今日任务已完成", "pass-filled")];
    }
    if (element.group === "continueLearning") {
      const problems = this.problemItems(createPracticeSections(this.data).continueLearning);
      return problems.length ? problems : [infoItem("打开一道题后会出现在这里", "history")];
    }
    if (element.group === "currentCourse") return this.coursePhaseItems(this.currentCourseId);
    if (element.group === "courses") return this.preferredCourses().map((course) => this.courseItem(course));
    if (element.group === "course") return this.coursePhaseItems(element.collectionId);
    if (element.group === "coursePhase") {
      if (element.collectionId.startsWith("course:")) {
        return this.problemItems(problemsForCourseStage(
          this.data.problems,
          element.collectionId.slice("course:".length),
          element.phaseKey,
        ));
      }
      return this.problemItems(this.courseProblems(element.collectionId).filter(
        (problem) => (problem.phaseKey || "未分阶段") === element.phaseKey,
      ));
    }
    if (element.group === "catalog") {
      const progress = createPracticeSections(this.data).progress;
      return [
        smartItem("全部题目", "catalogAll", this.data.problems.length, "list-unordered", {}),
        categoryItem("课程与题单", "courses", this.preferredCourses().length, "个", "list-tree", "按学习路线浏览题目"),
        categoryItem("知识点", "smartTags", this.tagKeys().length, "个", "tag", "按题目知识点筛选"),
        categoryItem("来源", "catalogSources", this.sourceKeys().length, "个", "repo", "按题目来源筛选"),
        categoryItem("难度", "catalogDifficulties", this.difficultyGroups().length, "级", "symbol-number", "按难度筛选题目"),
        categoryItem(
          "学习状态",
          "progress",
          progress.doing.length + progress.failed.length + progress.stable.length,
          "项",
          "graph",
          "按训练进度筛选题目",
        ),
      ];
    }
    if (element.group === "catalogAll") return this.catalogChildren();
    if (element.group === "catalogUnsorted") {
      return this.problemItems(this.data.problems.filter((problem) => !(problem.courses || []).length));
    }
    if (element.group === "progress") {
      return [
        smartItem("尚未开始", "smartView", this.smartProblems("unseen").length, "circle-outline", {
          smartKey: "unseen",
        }),
        smartItem("正在训练", "smartView", this.smartProblems("doing").length, "debug-start", { smartKey: "doing" }),
        smartItem("到期复习", "smartView", this.smartProblems("due").length, "history", { smartKey: "due" }),
        smartItem("做错过", "smartView", this.smartProblems("failed").length, "error", { smartKey: "failed" }),
        smartItem("已稳定掌握", "smartView", this.smartProblems("stable").length, "pass-filled", { smartKey: "stable" }),
        smartItem("最近训练", "smartView", this.smartProblems("recent").length, "history", { smartKey: "recent" }),
        smartItem("最近编辑代码", "smartView", this.smartProblems("localRecent").length, "edit", { smartKey: "localRecent" }),
      ];
    }
    if (element.group === "smartView") return this.problemItems(this.smartProblems(element.smartKey));
    if (element.group === "smartPhases") return this.phaseItems();
    if (element.group === "smartPhase") {
      return this.problemItems(this.data.problems.filter((problem) => problem.phaseKey === element.phaseKey));
    }
    if (element.group === "smartTags") return this.tagItems();
    if (element.group === "smartTag") {
      return this.problemItems(this.data.problems.filter((problem) => problem.tags.includes(element.tag)));
    }
    if (element.group === "catalogSources") return this.sourceItems();
    if (element.group === "catalogSource") {
      return this.problemItems(
        this.data.problems.filter((problem) => (problem.providerLabel || "未标注来源") === element.source),
      );
    }
    if (element.group === "catalogDifficulties") return this.difficultyItems();
    if (element.group === "catalogDifficulty") {
      return this.problemItems(
        this.data.problems.filter((problem) => (problem.difficultyBand || "") === element.difficultyBand),
      );
    }
    if (element.group === "library") return this.personalDirectoryChildren();
    if (element.group === "libraryUnfiled") return this.libraryChildren(null, { includeFolders: false });
    if (element.group === "libraryFolder") return this.libraryChildren(element.folderId);
    return [];
  }

  personalDirectoryChildren() {
    const folders = this.libraryChildren(null, { includeProblems: false });
    return [...folders, unfiledDirectoryItem(this.libraryIndex)];
  }

  libraryChildren(parentId, options = {}) {
    const includeFolders = options.includeFolders !== false;
    const includeProblems = options.includeProblems !== false;
    const key = parentId || "";
    const folders = includeFolders
      ? (this.libraryIndex.foldersByParent.get(key) || [])
          .filter((folder) => this.folderMatchesQuery(folder))
          .map((folder) => this.folderItem(folder))
      : [];
    const libraryItems = includeProblems
      ? (this.libraryIndex.itemsByFolder.get(key) || []).filter((libraryItem) => {
          const problem = this.libraryIndex.problems.get(Number(libraryItem.problemId));
          return problem && this.matchesProblem(problem, libraryItem);
        })
      : [];
    const problems = libraryItems
      .map((libraryItem) => {
        const problem = this.libraryIndex.problems.get(Number(libraryItem.problemId));
        return problem ? this.problemItem(problem, libraryItem, true, 0) : null;
      })
      .filter(Boolean);
    problems.forEach((item, index) => {
      item.label = formatProblemLabel(
        this.libraryIndex.problems.get(Number(item.problemId)),
        this.libraryIndex.itemByProblem.get(Number(item.problemId)),
        this.libraryIndex.numberWidth,
        index + 1,
      );
    });
    return [...folders, ...problems];
  }

  currentCourse() {
    return this.findCourseNode(this.currentCourseId);
  }

  /** 课程树（memberships）优先，兼容旧题单（collections）。 */
  findCourseNode(courseId) {
    const data = this.data;
    if (!data || !courseId) return null;
    return (data.courseTree || []).find((course) => course.id === courseId)
      || data.collections.find((collection) => collection.id === courseId)
      || null;
  }

  preferredCourses() {
    const courseTree = this.data?.courseTree || [];
    if (courseTree.length) {
      // 课程树为主；已迁移进课程的旧题单不再重复出现，口径不明的旧题单（固定题单/变式等）保留为兼容分组
      const migrated = new Set(["郭炜课程例题", "郭炜课程作业"]);
      const legacy = (this.data?.collections || []).filter(
        (collection) => collection.kind === "source" && !migrated.has(collection.name),
      );
      return [...courseTree, ...legacy].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
    }
    const collections = this.data?.collections || [];
    const primary = collections.filter((collection) => collection.kind !== "phase");
    return [...(primary.length ? primary : collections)].sort((left, right) =>
      courseKindOrder(left.kind) - courseKindOrder(right.kind) || left.name.localeCompare(right.name, "zh-CN"),
    );
  }

  courseProblems(collectionId) {
    if (!collectionId) return [];
    if (collectionId.startsWith("course:")) {
      const courseKey = collectionId.slice("course:".length);
      return this.data.problems.filter((problem) =>
        (problem.courses || []).some((course) => course.courseKey === courseKey),
      );
    }
    return this.data.problems.filter((problem) => problem.collectionIds.includes(collectionId));
  }

  /** 题库 = 课程树（与网页/网盘同构）+ 未归类兜底；无课程数据时退回平铺。 */
  catalogChildren() {
    if (!this.data?.courseTree?.length) return this.problemItems(this.data.problems);
    const items = [];
    const grouped = new Set();
    for (const course of this.data.courseTree) {
      const problems = this.courseProblems(course.id);
      problems.forEach((problem) => grouped.add(problem.id));
      items.push(this.courseItem({ ...course, problemCount: problems.length }));
    }
    const rest = this.data.problems.filter((problem) => !grouped.has(problem.id));
    if (rest.length) {
      items.push(categoryItem("未归类", "catalogUnsorted", rest.length, "题", "question", "尚未归入任何课程阶段"));
    }
    return items;
  }

  courseItem(course) {
    const item = new vscode.TreeItem(
      course.name,
      course.problemCount ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    item.description = `${course.problemCount} 题 · ${course.openCount} 待掌握`;
    item.tooltip = `${course.name}\n${courseKindLabel(course.kind)} · ${course.openCount} 题尚未稳定掌握`;
    item.iconPath = new vscode.ThemeIcon(course.id === this.currentCourseId ? "bookmark" : "list-unordered");
    item.contextValue = "ascendCourse";
    item.group = "course";
    item.collectionId = course.id;
    return item;
  }

  coursePhaseItems(collectionId) {
    const problems = this.courseProblems(collectionId);
    const groups = collectionId.startsWith("course:")
      ? groupProblemsByStage(problems, collectionId.slice("course:".length))
      : groupProblemsByPhase(problems);
    if (!groups.length) return [infoItem("当前课程还没有题目", "info")];
    return groups.map((group) => {
      const item = categoryItem(group.phaseKey, "coursePhase", group.problems.length, "题", "symbol-enum", "按课程阶段学习");
      item.collectionId = collectionId;
      item.phaseKey = group.phaseKey;
      return item;
    });
  }

  sourceKeys() {
    return [...new Set(this.data.problems.map((problem) => problem.providerLabel || "未标注来源"))].sort((a, b) =>
      a.localeCompare(b, "zh-CN"),
    );
  }

  sourceItems() {
    return this.sourceKeys().map((source) => {
      const count = this.data.problems.filter((problem) => (problem.providerLabel || "未标注来源") === source).length;
      const item = categoryItem(source, "catalogSource", count, "题", "repo", `查看来自 ${source} 的题目`);
      item.source = source;
      return item;
    });
  }

  difficultyGroups() {
    const values = ["foundation", "standard", "challenge", ""];
    return values
      .map((difficultyBand) => ({
        difficultyBand,
        count: this.data.problems.filter((problem) => (problem.difficultyBand || "") === difficultyBand).length,
      }))
      .filter((group) => group.count > 0);
  }

  difficultyItems() {
    return this.difficultyGroups().map((group) => {
      const item = categoryItem(
        difficultyLabel(group.difficultyBand),
        "catalogDifficulty",
        group.count,
        "题",
        "symbol-number",
        `查看${difficultyLabel(group.difficultyBand)}题目`,
      );
      item.difficultyBand = group.difficultyBand;
      return item;
    });
  }

  folderItem(folder) {
    const expanded = this.expandedFolderIds.has(folder.id);
    const item = new vscode.TreeItem(
      folder.name,
      expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.id = `ascend-library-folder:${folder.id}`;
    const stats = folderStats(this.libraryIndex, folder.id, this.data.today);
    item.description = `${stats.total} 题 · ${stats.due} 待复测 · ${stats.percent}% 稳定`;
    item.tooltip = `${folder.name}\n${stats.stable}/${stats.total} 题达到稳定掌握`;
    item.iconPath = new vscode.ThemeIcon(expanded ? "folder-opened" : "folder");
    item.contextValue = "ascendLibraryFolder";
    item.group = "libraryFolder";
    item.folderId = folder.id;
    item.parentFolderId = folder.parentId;
    item.folderSortOrder = folder.sortOrder;
    return item;
  }

  problemItem(
    problem,
    libraryItem = this.libraryIndex.itemByProblem.get(Number(problem.id)),
    inLibraryTree = false,
    visiblePosition = null,
    localPaths = this.problemPaths(),
  ) {
    return problemItem(
      problem,
      libraryItem,
      this.libraryIndex.numberWidth,
      inLibraryTree,
      visiblePosition,
      localPaths[problem.id],
      this.data?.today,
    );
  }

  problemItems(problems) {
    const localPaths = this.problemPaths();
    return this.sortProblems(problems.filter((problem) => this.matchesProblem(problem))).map((problem, index) =>
      this.problemItem(problem, undefined, false, index + 1, localPaths),
    );
  }

  matchesProblem(problem, libraryItem = this.libraryIndex.itemByProblem.get(Number(problem.id))) {
    return problemMatches(problem, libraryItem, this.query);
  }

  folderMatchesQuery(folder) {
    if (!this.query) return true;
    if (folder.name.toLocaleLowerCase("zh-CN").includes(this.query.toLocaleLowerCase("zh-CN"))) return true;
    const statsItems = this.descendantProblemIds(folder.id);
    return statsItems.some((id) => {
      const problem = this.libraryIndex.problems.get(Number(id));
      return problem && this.matchesProblem(problem);
    });
  }

  descendantProblemIds(folderId) {
    const ids = (this.libraryIndex.itemsByFolder.get(folderId) || []).map((item) => item.problemId);
    for (const child of this.libraryIndex.foldersByParent.get(folderId) || []) {
      ids.push(...this.descendantProblemIds(child.id));
    }
    return ids;
  }

  sortLibraryItems(items) {
    if (this.sortMode === "manual") return [...items];
    return [...items].sort((left, right) =>
      this.compareProblems(
        this.libraryIndex.problems.get(Number(left.problemId)),
        this.libraryIndex.problems.get(Number(right.problemId)),
      ),
    );
  }

  sortProblems(problems) {
    if (this.sortMode === "manual") return [...problems];
    return [...problems].sort((left, right) => this.compareProblems(left, right));
  }

  compareProblems(left, right) {
    if (this.sortMode === "title") return left.title.localeCompare(right.title, "zh-CN");
    if (this.sortMode === "number")
      return Number(left.libraryNumber || left.id) - Number(right.libraryNumber || right.id);
    if (this.sortMode === "status") {
      return (
        statusOrder(problemStatus(left, this.data.today).key) - statusOrder(problemStatus(right, this.data.today).key)
      );
    }
    return 0;
  }

  smartProblems(key) {
    const problems = this.data.problems;
    if (key === "recent")
      return [...problems]
        .filter((problem) => problem.lastAttemptDay)
        .sort((a, b) => b.lastAttemptDay.localeCompare(a.lastAttemptDay))
        .slice(0, 20);
    if (key === "localRecent") {
      const paths = this.problemPaths();
      return [...problems]
        .filter((problem) => problemPathValue(paths[problem.id]))
        .sort((left, right) =>
          problemPathTimestamp(paths[right.id]).localeCompare(problemPathTimestamp(paths[left.id])),
        )
        .slice(0, 20);
    }
    if (["unseen", "doing", "due", "failed", "stable"].includes(key)) {
      return problems.filter((problem) => smartProblemMatches(problem, key, this.data.today));
    }
    return [];
  }

  phaseKeys() {
    return [...new Set(this.data.problems.map((problem) => problem.phaseKey).filter(Boolean))].sort();
  }

  tagKeys() {
    return [...new Set(this.data.problems.flatMap((problem) => problem.tags))].sort((a, b) =>
      a.localeCompare(b, "zh-CN"),
    );
  }

  phaseItems() {
    return this.phaseKeys().map((phaseKey) =>
      smartItem(
        phaseKey,
        "smartPhase",
        this.data.problems.filter((problem) => problem.phaseKey === phaseKey).length,
        "symbol-enum",
        { phaseKey },
      ),
    );
  }

  tagItems() {
    return this.tagKeys().map((tag) =>
      smartItem(tag, "smartTag", this.data.problems.filter((problem) => problem.tags.includes(tag)).length, "tag", {
        tag,
      }),
    );
  }

  async handleDrag(source, dataTransfer) {
    const entries = compactMoveEntries(
      source
      .filter((item) => item.contextValue === "ascendLibraryFolder" || Number(item.problemId) > 0)
      .map((item) =>
        item.contextValue === "ascendLibraryFolder"
          ? { kind: "folder", id: item.folderId }
          : { kind: "problem", id: item.problemId },
      ),
      this.libraryIndex,
    );
    if (entries.length) dataTransfer.set(LIBRARY_DRAG_MIME, new vscode.DataTransferItem(JSON.stringify(entries)));
  }

  async handleDrop(target, dataTransfer) {
    try {
      const transfer = dataTransfer.get(LIBRARY_DRAG_MIME);
      if (!transfer) return;
      const entries = compactMoveEntries(JSON.parse(await transfer.asString()), this.libraryIndex);
      if (!Array.isArray(entries) || !entries.length) return;
      if (
        (target?.contextValue === "ascendLibraryProblem" && entries.some((entry) => entry.kind === "problem" && Number(entry.id) === Number(target.problemId))) ||
        (target?.contextValue === "ascendLibraryFolder" && entries.some((entry) => entry.kind === "folder" && entry.id === target.folderId))
      ) return;
      const destination = dropDestination(target, entries, this.libraryIndex);
      if (!destination) throw new Error("请把题目或文件夹拖到目标行");
      await this.moveEntries(entries, destination);
    } catch (error) {
      vscode.window.showErrorMessage(String(error.message || error));
    }
  }

  async moveEntries(inputEntries, destination) {
    const entries = compactMoveEntries(inputEntries, this.libraryIndex);
    if (!entries.length) return;
    if (destination.entryKind && entries.some((entry) => entry.kind !== destination.entryKind)) {
      throw new Error(destination.entryKind === "folder" ? "这条插入线用于调整文件夹顺序" : "这条插入线用于调整题目顺序");
    }
    this.lastMove = this.captureMove(entries);
    vscode.commands.executeCommand("setContext", "ascendPractice.canUndoLibraryMove", true);
    let afterProblemId = destination.afterProblemId;
    let afterFolderId = destination.afterFolderId;
    let firstProblem = true;
    let firstFolder = true;
    const moves = [];
    try {
      for (const entry of entries) {
        if (entry.kind === "problem" && Number(entry.id) === Number(afterProblemId)) continue;
        if (entry.kind === "folder" && entry.id === afterFolderId) continue;
        if (entry.kind === "folder" && entry.id === destination.targetFolderId) continue;
        if (entry.kind === "problem") {
          moves.push({
            kind: entry.kind,
            id: entry.id,
            targetFolderId: destination.targetFolderId,
            afterProblemId,
            placeFirst: firstProblem && destination.placeFirst === true,
          });
          afterProblemId = Number(entry.id);
          firstProblem = false;
        } else {
          moves.push({
            kind: entry.kind,
            id: entry.id,
            targetFolderId: destination.targetFolderId,
            afterFolderId,
            placeFirst: firstFolder && destination.placeFirst === true,
          });
          afterFolderId = entry.id;
          firstFolder = false;
        }
      }
      if (!moves.length) {
        this.lastMove = null;
        vscode.commands.executeCommand("setContext", "ascendPractice.canUndoLibraryMove", false);
        return;
      }
      await moveLibraryEntriesCompat(this.api, moves);
    } catch (error) {
      await this.refresh();
      throw error;
    }
    await this.refresh({ notify: true });
    const position = destination.label ? `，${destination.label}` : "";
    const choice = await vscode.window.showInformationMessage(`已移动 ${moves.length} 项${position}`, "撤销");
    if (choice === "撤销") await this.undoLastMove();
  }

  captureMove(entries) {
    return entries.map((entry) => {
      if (entry.kind === "folder") {
        const folder = this.data.library.folders.find((item) => item.id === entry.id);
        return { ...entry, targetFolderId: folder?.parentId || null, originalSortOrder: folder?.sortOrder || 1 };
      }
      const item = this.libraryIndex.itemByProblem.get(Number(entry.id));
      const siblings = this.libraryIndex.itemsByFolder.get(item?.folderId || "") || [];
      const index = siblings.findIndex((candidate) => Number(candidate.problemId) === Number(entry.id));
      return {
        ...entry,
        targetFolderId: item?.folderId || null,
        originalSortOrder: index + 1,
        afterProblemId: index > 0 ? siblings[index - 1].problemId : null,
        placeFirst: index === 0,
      };
    });
  }

  async undoLastMove() {
    const entries = this.lastMove;
    if (!entries?.length) return vscode.window.showInformationMessage("当前没有可撤销的题目移动");
    const ordered = [...entries].sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
      if (left.targetFolderId !== right.targetFolderId) {
        return String(left.targetFolderId).localeCompare(String(right.targetFolderId));
      }
      return Number(left.originalSortOrder || 0) - Number(right.originalSortOrder || 0);
    });
    await moveLibraryEntriesCompat(
      this.api,
      ordered.map((entry) => ({
        kind: entry.kind,
        id: entry.id,
        targetFolderId: entry.targetFolderId,
        afterProblemId: entry.afterProblemId || null,
        placeFirst: entry.placeFirst || false,
      })),
    );
    for (const entry of ordered) {
      if (entry.kind === "folder") {
        await this.api.moveLibraryItem({ kind: "folder", id: entry.id, direction: "first" });
        for (let index = 1; index < entry.originalSortOrder; index += 1) {
          await this.api.moveLibraryItem({ kind: "folder", id: entry.id, direction: "down" });
        }
      }
    }
    this.lastMove = null;
    vscode.commands.executeCommand("setContext", "ascendPractice.canUndoLibraryMove", false);
    await this.refresh({ notify: true });
    vscode.window.showInformationMessage("题目移动已撤销");
  }
}

function connectionMessageItem(state) {
  if (state.kind === "offline")
    return messageItem("服务器暂时不可用，点击重试", "ascendPractice.refresh", "cloud-offline");
  if (state.kind === "auth-expired") return messageItem("授权已失效，点击重新配对", "ascendPractice.connect", "key");
  if (state.kind === "error") return messageItem("连接异常，点击重试", "ascendPractice.refresh", "warning");
  return messageItem("连接 Ascend 后读取今日题目", "ascendPractice.connect", "plug");
}

class ReferenceCodeProvider {
  constructor() {
    this.sources = new Map();
  }
  set(uri, sourceCode) {
    this.sources.set(uri.toString(), sourceCode);
  }
  provideTextDocumentContent(uri) {
    return this.sources.get(uri.toString()) || "// 参考代码当前不可用\n";
  }
}

function groupItem(label, group, count, icon, contextValue = "", options = {}) {
  const item = new vscode.TreeItem(
    label,
    options.expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
  );
  item.description = options.description ?? (count === null || count === undefined ? "" : `${count} 题`);
  item.tooltip = options.tooltip;
  item.iconPath = new vscode.ThemeIcon(icon);
  item.group = group;
  item.contextValue = contextValue;
  item.id = `ascend-group:${group}`;
  Object.assign(item, options);
  return item;
}

function personalDirectoryItem(data, index) {
  const folderCount = data?.library?.folders?.length || 0;
  const unfiledCount = index.itemsByFolder.get("")?.length || 0;
  return groupItem("我的文件夹", "library", null, "root-folder", "ascendDirectoryRoot", {
    expanded: false,
    description: `${folderCount} 个文件夹 · ${unfiledCount} 未整理`,
    tooltip: "与 Ascend 网盘同步的个人题目文件夹",
  });
}

function unfiledDirectoryItem(index) {
  const count = index.itemsByFolder.get("")?.length || 0;
  const item = new vscode.TreeItem(
    "未整理",
    count ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
  );
  item.id = "ascend-library-unfiled";
  item.description = `${count} 题`;
  item.tooltip = "个人目录根层的题目；可拖入文件夹完成整理";
  item.iconPath = new vscode.ThemeIcon("inbox");
  item.contextValue = "ascendLibraryUnfiled";
  item.group = "libraryUnfiled";
  return item;
}

function currentCourseItem(course, count) {
  if (!course) {
    const item = infoItem("选择当前课程", "bookmark");
    item.contextValue = "ascendCurrentCourseEmpty";
    item.command = { command: "ascendPractice.selectCurrentCourse", title: "选择当前课程" };
    return item;
  }
  const item = new vscode.TreeItem(
    `当前课程 · ${course.name}`,
    count ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
  );
  item.id = "ascend-current-course";
  item.description = `${count} 题 · ${course.openCount} 待掌握`;
  item.tooltip = `${course.name}\n按阶段继续学习`;
  item.iconPath = new vscode.ThemeIcon("bookmark");
  item.contextValue = "ascendCurrentCourse";
  item.group = "currentCourse";
  item.collectionId = course.id;
  return item;
}

function courseKindOrder(kind) {
  return { course: 0, phase: 1, exam: 2, source: 3, custom: 4 }[kind] ?? 9;
}

function courseKindLabel(kind) {
  return { course: "课程", phase: "学习阶段", exam: "模拟考试", source: "来源题单", custom: "自定义题单" }[kind] || "训练题单";
}

function difficultyLabel(difficultyBand) {
  return { foundation: "基础", standard: "标准", challenge: "挑战", "": "未标注难度" }[difficultyBand] || difficultyBand;
}

function smartItem(label, group, count, icon, extra = {}) {
  const item = new vscode.TreeItem(
    label,
    count ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
  );
  item.description = `${count} 题`;
  item.iconPath = new vscode.ThemeIcon(icon);
  item.group = group;
  Object.assign(item, extra);
  return item;
}

function categoryItem(label, group, count, unit, icon, tooltip) {
  const item = new vscode.TreeItem(
    label,
    count ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
  );
  item.description = `${count} ${unit}`;
  item.tooltip = tooltip;
  item.iconPath = new vscode.ThemeIcon(icon);
  item.group = group;
  return item;
}

function infoItem(label, icon) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon(icon);
  return item;
}

function problemItem(
  problem,
  libraryItem,
  numberWidth = 3,
  inLibraryTree = false,
  visiblePosition = null,
  localPathRecord = null,
  today = "",
) {
  const status = problemStatus(problem, today);
  const permanentNumber = permanentProblemNumber(problem, libraryItem, numberWidth);
  const item = new vscode.TreeItem(
    formatProblemLabel(problem, libraryItem, numberWidth, visiblePosition),
    vscode.TreeItemCollapsibleState.None,
  );
  item.description = [
    permanentNumber,
    status.label,
    problem.courses?.[0] ? `${problem.courses[0].courseName} · ${problem.courses[0].stageKey}` : problem.phaseKey,
    problem.priorityBand,
    problemPathValue(localPathRecord) && "本地代码",
    problem.hasCloudDraft && "云端草稿",
    localPathRecord?.lastSyncedAt && "已同步",
  ]
    .filter(Boolean)
    .join(" · ");
  item.tooltip = `${permanentNumber} · ${problem.title}\n${problem.providerLabel}${problem.externalProblemId ? ` #${problem.externalProblemId}` : ""}\n${status.label}${problem.lastAttemptDay ? ` · 最近训练 ${problem.lastAttemptDay}` : ""}\n${problem.tags.join(" · ")}`;
  item.iconPath = new vscode.ThemeIcon(status.icon);
  item.contextValue = inLibraryTree ? "ascendLibraryProblem" : "ascendProblem";
  item.problemId = problem.id;
  item.problemTitle = problem.title;
  if (inLibraryTree) item.id = `ascend-library-problem:${problem.id}`;
  item.libraryFolderId = inLibraryTree ? libraryItem?.folderId || null : undefined;
  item.command = { command: "ascendPractice.openProblem", title: "开始训练", arguments: [item] };
  return item;
}

function statusOrder(key) {
  return { due: 0, failed: 1, doing: 2, learning: 3, unseen: 4, completed: 5, stable: 6 }[key] ?? 9;
}

function dropDestination(target, entries, index) {
  const kinds = new Set(entries.map((entry) => entry.kind));
  if (
    !target ||
    target?.contextValue === "ascendDirectoryRoot" ||
    target?.contextValue === "ascendLibraryUnfiled"
  ) {
    return { targetFolderId: null, afterProblemId: null, afterFolderId: null, label: "已移到未整理" };
  }
  if (target?.contextValue === "ascendLibraryFolder") {
    if (kinds.size === 1 && kinds.has("folder")) {
      const parentId = target.parentFolderId || null;
      const position = insertionBeforeTarget(
        index.foldersByParent.get(parentId || "") || [],
        "id",
        target.folderId,
        entries.map((entry) => entry.id),
      );
      if (!position) return null;
      return {
        targetFolderId: parentId,
        afterFolderId: position.afterId,
        placeFirst: position.placeFirst,
        entryKind: "folder",
        label: `已排在「${target.label}」之前`,
      };
    }
    if (kinds.size === 1 && kinds.has("problem")) {
      return {
        targetFolderId: target.folderId,
        afterProblemId: null,
        label: `已移入「${target.label}」`,
      };
    }
    return null;
  }
  if (target?.contextValue === "ascendLibraryProblem") {
    if (kinds.size !== 1 || !kinds.has("problem")) return null;
    const folderId = target.libraryFolderId || null;
    const position = insertionBeforeTarget(
      index.itemsByFolder.get(folderId || "") || [],
      "problemId",
      target.problemId,
      entries.map((entry) => entry.id),
    );
    if (!position) return null;
    return {
      targetFolderId: folderId,
      afterProblemId: position.afterId,
      placeFirst: position.placeFirst,
      entryKind: "problem",
      label: `已排在「${target.problemTitle || target.label}」之前`,
    };
  }
  return null;
}

function messageItem(label, command, icon = "plug") {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.command = { command, title: label };
  item.iconPath = new vscode.ThemeIcon(icon);
  return item;
}

async function activate(context) {
  const connections = new ConnectionManager(context);
  await connections.initialize();
  const api = new AscendApi(
    connections,
    ConnectionError,
    () => normalizeBaseUrl(vscode.workspace.getConfiguration("ascendPractice").get("baseUrl", "https://ascend.zhuorui.me")),
  );
  const output = vscode.window.createOutputChannel("Ascend Practice");
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
  const updateConnectionStatus = (state) => {
    const active = connections.active();
    const presentation = statePresentation(state.kind, active?.name || "Ascend");
    status.text = `${presentation.icon} Ascend · ${presentation.label}`;
    status.tooltip = active
      ? `${presentation.tooltip}\n${active.baseUrl}\n${active.environment}`
      : presentation.tooltip;
  };
  const tree = new PracticeTreeProvider(api, updateConnectionStatus, context);
  const treeView = vscode.window.createTreeView("ascendPractice.today", {
    treeDataProvider: tree,
    dragAndDropController: tree,
    showCollapseAll: true,
    canSelectMany: true,
  });
  const referenceProvider = new ReferenceCodeProvider();
  const runtime = {
    api,
    connections,
    context,
    output,
    status,
    tree,
    treeView,
    referenceProvider,
    capabilities: null,
    activity: new SessionActivityTracker(),
    sessions: new Map(),
    panels: new Map(),
  };
  status.command = "ascendPractice.switchServer";
  updateConnectionStatus({ kind: connections.active() ? "offline" : "unpaired" });
  status.show();
  const syncTimers = new Map();
  runtime.syncTimers = syncTimers;
  runtime.activityTimer = setInterval(() => void tickActiveSession(runtime), 1000);
  const register = (command, handler) =>
    vscode.commands.registerCommand(command, async (...args) => {
      try {
        return await handler(...args);
      } catch (error) {
        output.appendLine(`[error] ${String(error.stack || error.message || error)}`);
        return vscode.window.showErrorMessage(String(error.message || error));
      }
    });

  context.subscriptions.push(
    treeView,
    { dispose: () => clearInterval(runtime.activityTimer) },
    treeView.onDidExpandElement((event) => tree.setFolderExpanded(event.element.folderId, true)),
    treeView.onDidCollapseElement((event) => tree.setFolderExpanded(event.element.folderId, false)),
    treeView.onDidChangeSelection((event) => {
      const selected = event.selection[0];
      if (selected?.id?.startsWith("ascend-library-")) {
        context.workspaceState.update(LIBRARY_SELECTION_KEY, selected.id);
      }
    }),
    vscode.workspace.registerTextDocumentContentProvider("ascend-reference", referenceProvider),
    output,
    status,
    register("ascendPractice.connect", () => pairInBrowser(runtime)),
    register("ascendPractice.connectWithToken", () => connectWithToken(runtime)),
    register("ascendPractice.switchServer", () => switchServer(runtime)),
    register("ascendPractice.manageConnections", () => manageConnections(runtime)),
    register("ascendPractice.refresh", () => tree.refresh({ notify: true })),
    register("ascendPractice.createFolder", (item) => createLibraryFolder(runtime, item)),
    register("ascendPractice.selectCurrentCourse", (item) => selectCurrentCourse(runtime, item)),
    register("ascendPractice.renameFolder", (item) => renameLibraryFolder(runtime, item)),
    register("ascendPractice.deleteFolder", (item) => deleteLibraryFolder(runtime, item)),
    register("ascendPractice.moveToLibraryRoot", (item) => moveToLibraryRoot(runtime, item)),
    register("ascendPractice.moveToFolder", (item) => moveToPersonalFolder(runtime, item)),
    register("ascendPractice.searchProblems", () => searchProblems(runtime)),
    register("ascendPractice.clearProblemSearch", () => tree.setSearchQuery("")),
    register("ascendPractice.sortProblems", () => chooseProblemSort(runtime)),
    register("ascendPractice.undoLibraryMove", () => tree.undoLastMove()),
    register("ascendPractice.moveFolderUp", (item) => reorderLibraryFolder(runtime, item, "up")),
    register("ascendPractice.moveFolderDown", (item) => reorderLibraryFolder(runtime, item, "down")),
    register("ascendPractice.pinFolder", (item) => reorderLibraryFolder(runtime, item, "first")),
    register("ascendPractice.editProblem", (item) => editProblemDetails(runtime, item)),
    register("ascendPractice.revealLocalCode", (item) => revealLocalCode(runtime, item)),
    register("ascendPractice.openLocalFolder", (item) => openLocalProblemFolder(runtime, item)),
    register("ascendPractice.openFolderWorkspace", (item) => openLibraryFolderWorkspace(runtime, item)),
    register("ascendPractice.openProblem", async (item) => {
      const problemId = Number(item?.problemId || (await pickProblemId(tree)));
      if (problemId) await openProblem(runtime, problemId);
    }),
    register("ascendPractice.runSamples", async () => runSamples(await requireCurrentSession(runtime), runtime)),
    register("ascendPractice.openCustomInput", async () => openCustomInput(await requireCurrentSession(runtime))),
    register("ascendPractice.runCustomInput", async () =>
      runCustomInput(await requireCurrentSession(runtime), runtime),
    ),
    register("ascendPractice.sync", async () => {
      const current = await requireCurrentSession(runtime);
      const synced = await syncDraft(api, current, "manual", "VS Code 手动保存", status, context);
      if (!synced) return;
      postSessionStatus(runtime, current, "草稿已同步");
      vscode.window.showInformationMessage("Ascend 草稿已同步");
    }),
    register("ascendPractice.recordResult", async () => {
      await recordResult(api, await requireCurrentSession(runtime), runtime);
      await tree.refresh();
    }),
    register("ascendPractice.submitFormal", async () => {
      await submitFormal(await requireCurrentSession(runtime), runtime);
      await tree.refresh();
    }),
    register("ascendPractice.revealReference", async () =>
      revealReference(await requireCurrentSession(runtime), runtime),
    ),
    register("ascendPractice.newAttemptFromTemplate", async () =>
      newAttemptFromTemplate(await requireCurrentSession(runtime), runtime),
    ),
    register("ascendPractice.openWeb", () =>
      vscode.env.openExternal(vscode.Uri.parse(`${api.baseUrl}/practice/algorithms`)),
    ),
    register("ascendPractice.addCurrentCpp", (uri) => addCppFile(runtime, uri)),
    register("ascendPractice.addCppFolder", (uri) => addCppFolder(runtime, uri)),
    vscode.window.registerUriHandler({
      handleUri: async (uri) => {
        try {
          if (uri.path !== "/open") return;
          const problemId = Number(new URLSearchParams(uri.query).get("problem"));
          if (problemId) await openProblem(runtime, problemId);
        } catch (error) {
          vscode.window.showErrorMessage(String(error.message || error));
        }
      },
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.uri.scheme !== "file" || path.basename(document.uri.fsPath) !== "main.cpp") return;
      const problemDir = path.dirname(document.uri.fsPath);
      clearTimeout(syncTimers.get(problemDir));
      syncTimers.set(
        problemDir,
        setTimeout(async () => {
          try {
            const current = await loadProblemAt(problemDir, runtime);
            if (current) await syncDraft(api, current, "autosave", "VS Code 自动保存", status, context);
          } catch (error) {
            status.text = "$(cloud-offline) Ascend 同步失败";
            output.appendLine(`[sync] ${String(error.message || error)}`);
          }
        }, 1200),
      );
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const current = [...runtime.sessions.values()].find((session) => session.mainPath === event.document.uri.fsPath);
      if (current) runtime.activity.mark(current.sessionKey);
    }),
  );
  await tree.refresh();
  const savedSelection = tree.findPersistentElement(context.workspaceState.get(LIBRARY_SELECTION_KEY, ""));
  if (savedSelection) {
    try {
      await treeView.reveal(savedSelection, { select: true, focus: false, expand: true });
    } catch (error) {
      output.appendLine(`[tree] 恢复上次题目位置失败：${String(error.message || error)}`);
    }
  }
}

async function addCppFile(runtime, resource) {
  const uri = resource?.scheme === "file" ? resource : vscode.window.activeTextEditor?.document.uri;
  if (!uri || uri.scheme !== "file" || !/\.(?:cpp|cc|cxx)$/i.test(uri.fsPath)) {
    throw new Error("请在资源管理器中选择一个 CPP 文件");
  }
  const result = await uploadCppUri(runtime, uri);
  await runtime.tree.refresh();
  vscode.window.showInformationMessage(
    `${result.duplicate ? "已更新" : "已添加"}：${result.title || path.basename(uri.fsPath)}`,
  );
}

async function addCppFolder(runtime, resource) {
  if (!resource || resource.scheme !== "file") throw new Error("请在资源管理器中选择一个文件夹");
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(resource.fsPath, "**/*.{cpp,cc,cxx}"),
    "**/{.git,node_modules,dist,build}/**",
    200,
  );
  if (!files.length) {
    vscode.window.showInformationMessage("这个文件夹中没有 CPP 文件");
    return;
  }
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "正在添加 CPP 到 Ascend", cancellable: false },
    async (progress) => {
      let created = 0;
      let updated = 0;
      let failed = 0;
      const queue = [...files];
      async function worker() {
        while (queue.length) {
          const uri = queue.shift();
          try {
            const imported = await uploadCppUri(runtime, uri);
            if (imported.duplicate) updated += 1;
            else created += 1;
          } catch (error) {
            failed += 1;
            runtime.output.appendLine(`[import] ${uri.fsPath}: ${String(error.message || error)}`);
          }
          progress.report({ increment: 100 / files.length, message: path.basename(uri.fsPath) });
        }
      }
      await Promise.all([worker(), worker(), worker()]);
      return { created, updated, failed };
    },
  );
  await runtime.tree.refresh();
  vscode.window.showInformationMessage(`CPP 导入完成：新增 ${result.created}，更新 ${result.updated}，失败 ${result.failed}`);
}

async function uploadCppUri(runtime, uri) {
  const bytes = await fs.readFile(uri.fsPath);
  if (!bytes.length || bytes.length > 512 * 1024) throw new Error("CPP 文件大小需在 1 B 到 512 KB 之间");
  const workspace = vscode.workspace.getWorkspaceFolder(uri);
  const relativePath = workspace ? path.relative(workspace.uri.fsPath, uri.fsPath) : path.basename(uri.fsPath);
  return runtime.api.importCpp({
    filename: path.basename(uri.fsPath),
    relativePath: relativePath.split(path.sep).join("/"),
    content: bytes.toString("utf8"),
  });
}

async function createLibraryFolder(runtime, item) {
  const parentId = item?.contextValue === "ascendLibraryFolder" ? item.folderId : null;
  const name = await vscode.window.showInputBox({
    prompt: parentId ? `在“${item.label}”中新建子文件夹` : "在“我的目录”中新建文件夹",
    placeHolder: "例如：本周重点",
    ignoreFocusOut: true,
    validateInput: validateFolderName,
  });
  if (!name) return;
  await runtime.api.createLibraryFolder({ name, parentId });
  await runtime.tree.refresh({ notify: true });
  vscode.window.showInformationMessage(`题目文件夹已创建：${name.trim()}`);
}

async function selectCurrentCourse(runtime, item) {
  if (item?.contextValue === "ascendCourse" && item.collectionId) {
    await runtime.tree.setCurrentCourse(item.collectionId);
    vscode.window.showInformationMessage(`当前课程已切换为：${item.label}`);
    return;
  }
  const courses = runtime.tree.preferredCourses();
  if (!courses.length) throw new Error("当前题库还没有可选课程或题单");
  const picked = await vscode.window.showQuickPick(
    courses.map((course) => ({
      label: course.name,
      description: `${courseKindLabel(course.kind)} · ${course.problemCount} 题`,
      detail: `${course.openCount} 题尚未稳定掌握`,
      collectionId: course.id,
    })),
    { placeHolder: "选择“开始学习”中默认展开的课程" },
  );
  if (!picked) return;
  await runtime.tree.setCurrentCourse(picked.collectionId);
}

async function renameLibraryFolder(runtime, item) {
  if (item?.contextValue !== "ascendLibraryFolder") throw new Error("请先选择一个题目文件夹");
  const name = await vscode.window.showInputBox({
    prompt: "重命名题目文件夹",
    value: item.label,
    ignoreFocusOut: true,
    validateInput: validateFolderName,
  });
  if (!name) return;
  await runtime.api.renameLibraryFolder(item.folderId, name);
  await runtime.tree.refresh({ notify: true });
}

async function deleteLibraryFolder(runtime, item) {
  if (item?.contextValue !== "ascendLibraryFolder") throw new Error("请先选择一个题目文件夹");
  const accepted = await vscode.window.showWarningMessage(
    `删除题目文件夹“${item.label}”？`,
    { modal: true },
    "内容移到上一级并删除",
    "删除空文件夹",
  );
  if (!accepted) return;
  await runtime.api.deleteLibraryFolder(item.folderId, accepted === "内容移到上一级并删除");
  await runtime.tree.refresh({ notify: true });
}

async function moveToLibraryRoot(runtime, item) {
  if (item?.contextValue === "ascendLibraryFolder") {
    await runtime.api.moveLibraryItem({ kind: "folder", id: item.folderId, targetFolderId: null });
  } else if (item?.contextValue === "ascendLibraryProblem") {
    await runtime.api.moveLibraryItem({ kind: "problem", id: item.problemId, targetFolderId: null });
  } else {
    throw new Error("请先选择题目或文件夹");
  }
  await runtime.tree.refresh({ notify: true });
}

async function moveToPersonalFolder(runtime, item) {
  const sourceItems = runtime.treeView.selection.includes(item) ? runtime.treeView.selection : [item];
  const entries = compactMoveEntries(
    sourceItems
      .filter((candidate) => candidate?.contextValue === "ascendLibraryFolder" || Number(candidate?.problemId) > 0)
      .map((candidate) =>
        candidate.contextValue === "ascendLibraryFolder"
          ? { kind: "folder", id: candidate.folderId }
          : { kind: "problem", id: candidate.problemId },
      ),
    runtime.tree.libraryIndex,
  );
  if (!entries.length) throw new Error("请先选择题目或个人文件夹");
  const blockedFolders = new Set(entries.filter((entry) => entry.kind === "folder").map((entry) => entry.id));
  for (const folderId of [...blockedFolders]) {
    for (const descendantId of descendantFolderIds(runtime.tree.libraryIndex, folderId)) blockedFolders.add(descendantId);
  }
  const destinations = [
    { label: "$(inbox) 未整理", description: "我的目录根层", targetFolderId: null },
    ...personalFolderPickerItems(runtime.tree.libraryIndex, blockedFolders),
  ];
  const picked = await vscode.window.showQuickPick(destinations, {
    placeHolder: `移动 ${entries.length} 项到个人文件夹`,
    matchOnDescription: true,
  });
  if (!picked) return;
  await runtime.tree.moveEntries(entries, { targetFolderId: picked.targetFolderId, afterProblemId: null });
}

function personalFolderPickerItems(index, blockedFolders = new Set()) {
  const output = [];
  const visit = (parentId, pathLabels) => {
    for (const folder of index.foldersByParent.get(parentId || "") || []) {
      if (blockedFolders.has(folder.id)) continue;
      const nextPath = [...pathLabels, folder.name];
      output.push({
        label: `$(folder) ${folder.name}`,
        description: nextPath.join(" / "),
        targetFolderId: folder.id,
      });
      visit(folder.id, nextPath);
    }
  };
  visit(null, []);
  return output;
}

function descendantFolderIds(index, folderId) {
  const output = [];
  for (const child of index.foldersByParent.get(folderId) || []) {
    output.push(child.id, ...descendantFolderIds(index, child.id));
  }
  return output;
}

async function searchProblems(runtime) {
  const query = await vscode.window.showInputBox({
    prompt: "搜索题目名称、P 编号、平台题号、课程来源、阶段或知识点",
    value: runtime.tree.query,
    ignoreFocusOut: true,
  });
  if (query === undefined) return;
  runtime.tree.setSearchQuery(query);
}

async function chooseProblemSort(runtime) {
  const choices = [
    { label: "手动顺序", description: "沿用文件夹拖拽顺序", mode: "manual" },
    { label: "学习状态", description: "复测、错题和进行中优先", mode: "status" },
    { label: "题目名称", description: "按中文名称排序", mode: "title" },
    { label: "永久题号", description: "按 P001、P002 顺序", mode: "number" },
  ];
  const picked = await vscode.window.showQuickPick(choices, {
    placeHolder: "选择题目树排序方式",
  });
  if (picked) runtime.tree.setSortMode(picked.mode);
}

async function reorderLibraryFolder(runtime, item, direction) {
  if (item?.contextValue !== "ascendLibraryFolder") throw new Error("请先选择一个题目文件夹");
  await runtime.api.moveLibraryItem({ kind: "folder", id: item.folderId, direction });
  await runtime.tree.refresh({ notify: true });
}

async function editProblemDetails(runtime, item) {
  const problem = runtime.tree.data?.problems.find((candidate) => Number(candidate.id) === Number(item?.problemId));
  if (!problem) throw new Error("请先选择一道题目");
  const field = await vscode.window.showQuickPick(
    [
      { label: "题目名称", key: "title" },
      { label: "课程章节", key: "curriculumChapterKey" },
      { label: "技能标签", key: "tags" },
      { label: "难度", key: "difficultyBand" },
      { label: "阶段", key: "phaseKey" },
      { label: "优先级", key: "priorityBand" },
      { label: "训练状态", key: "materialStatus" },
      { label: "下次复测日期", key: "nextReview" },
      { label: "个人备注", key: "notes" },
    ],
    {
      placeHolder: `编辑 ${permanentProblemNumber(problem, null, runtime.tree.libraryIndex.numberWidth)} · ${problem.title}`,
    },
  );
  if (!field) return;
  const value = await promptProblemField(field.key, problem, runtime);
  if (value === undefined) return;
  await runtime.api.updateProblem(problem.id, { [field.key]: value });
  await runtime.tree.refresh({ notify: true });
  vscode.window.showInformationMessage(`题目信息已更新：${problem.title}`);
}

async function promptProblemField(key, problem, runtime) {
  if (key === "curriculumChapterKey") {
    const curriculum = (runtime.tree.data?.courseTree || []).find((course) => course.kind === "curriculum");
    const picked = await vscode.window.showQuickPick(
      (curriculum?.stages || []).map((stage) => ({
        label: stage.key,
        description: `${stage.problemCount || 0} 题`,
        value: stage.chapterKey,
      })).filter((item) => item.value),
      { placeHolder: "选择课程章节" },
    );
    return picked?.value;
  }
  if (key === "difficultyBand") {
    return (
      await vscode.window.showQuickPick(
        [
          { label: "未标注", value: "" },
          { label: "基础", value: "foundation" },
          { label: "标准", value: "standard" },
          { label: "挑战", value: "challenge" },
        ],
        { placeHolder: "选择题目难度" },
      )
    )?.value;
  }
  if (key === "priorityBand") {
    return (
      await vscode.window.showQuickPick(
        [
          { label: "普通", value: "" },
          { label: "P1 · 优先", value: "P1" },
          { label: "P2 · 次优先", value: "P2" },
          { label: "P3 · 后续", value: "P3" },
        ],
        { placeHolder: "选择训练优先级" },
      )
    )?.value;
  }
  if (key === "materialStatus") {
    return (
      await vscode.window.showQuickPick(
        [
          { label: "待训练", value: "todo" },
          { label: "正在训练", value: "doing" },
          { label: "进入复测", value: "review" },
          { label: "已完成", value: "done" },
        ],
        { placeHolder: "选择训练状态" },
      )
    )?.value;
  }
  if (key === "tags") {
    const value = await vscode.window.showInputBox({
      prompt: "技能标签，使用逗号分隔",
      value: problem.tags.join("，"),
      ignoreFocusOut: true,
    });
    return value === undefined
      ? undefined
      : value
          .split(/[，,]/)
          .map((tag) => tag.trim())
          .filter(Boolean);
  }
  if (key === "nextReview") {
    const value = await vscode.window.showInputBox({
      prompt: "下次复测日期；清空可移除日期",
      value: problem.nextReview || "",
      placeHolder: "YYYY-MM-DD",
      ignoreFocusOut: true,
      validateInput: (input) => (!input || /^\d{4}-\d{2}-\d{2}$/.test(input) ? null : "请输入 YYYY-MM-DD"),
    });
    return value === undefined ? undefined : value || null;
  }
  const current = key === "title" ? problem.title : key === "phaseKey" ? problem.phaseKey : problem.notes || "";
  return vscode.window.showInputBox({
    prompt: key === "title" ? "题目名称" : key === "phaseKey" ? "阶段，例如 W1" : "个人备注",
    value: current,
    ignoreFocusOut: true,
  });
}

async function revealLocalCode(runtime, item) {
  const problemDir = await requireLocalProblemPath(runtime, item);
  if (!problemDir) return;
  const mainUri = vscode.Uri.file(path.join(problemDir, "main.cpp"));
  const document = await vscode.workspace.openTextDocument(mainUri);
  await vscode.window.showTextDocument(document, { preview: false });
  await vscode.commands.executeCommand("revealInExplorer", mainUri);
}

async function openLocalProblemFolder(runtime, item) {
  const problemDir = await requireLocalProblemPath(runtime, item);
  if (problemDir) await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(problemDir), true);
}

async function requireLocalProblemPath(runtime, item) {
  const problemId = Number(item?.problemId);
  if (!problemId) throw new Error("请先选择一道题目");
  const paths = problemPathsForRuntime(runtime);
  const problemDir = problemPathValue(paths[problemId]);
  if (problemDir && (await exists(path.join(problemDir, META_FILE)))) return problemDir;
  const choice = await vscode.window.showInformationMessage("这道题需要先创建本地作答目录", "打开题目并创建");
  if (choice === "打开题目并创建") await openProblem(runtime, problemId);
  return problemPathValue(problemPathsForRuntime(runtime)[problemId]);
}

async function openLibraryFolderWorkspace(runtime, item) {
  if (item?.contextValue !== "ascendLibraryFolder") throw new Error("请先选择一个题目文件夹");
  const problemIds = runtime.tree.descendantProblemIds(item.folderId);
  const paths = problemPathsForRuntime(runtime);
  const folders = [];
  for (const problemId of problemIds) {
    const problemDir = problemPathValue(paths[problemId]);
    if (problemDir && (await exists(path.join(problemDir, META_FILE)))) {
      folders.push({ name: runtime.tree.libraryIndex.problems.get(Number(problemId))?.title, path: problemDir });
    }
  }
  if (!folders.length) throw new Error("该文件夹中的题目需要先在 VS Code 打开一次");
  const root = await resolveLocalRoot(runtime.context);
  if (!root) return;
  const workspaceDir = path.join(root, ".ascend-workspaces");
  await fs.mkdir(workspaceDir, { recursive: true });
  const workspacePath = path.join(
    workspaceDir,
    `${safeSegment(String(item.label))}-${item.folderId.slice(0, 8)}.code-workspace`,
  );
  await fs.writeFile(workspacePath, createWorkspaceDocument(folders), "utf8");
  await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(workspacePath), true);
}

function validateFolderName(value) {
  const name = String(value || "").trim();
  if (!name) return "请输入文件夹名称";
  if (name === "." || name === ".." || /[\\/\u0000-\u001f]/.test(name)) return "名称中不能包含斜杠或控制字符";
  if (name.length > 80) return "文件夹名称最多 80 个字符";
  return null;
}

async function pairInBrowser(runtime) {
  const current = runtime.connections.active();
  const baseUrlInput = await vscode.window.showInputBox({
    prompt: "Ascend 服务地址",
    value:
      current?.baseUrl ||
      vscode.workspace.getConfiguration("ascendPractice").get("baseUrl", "https://ascend.zhuorui.me"),
    ignoreFocusOut: true,
  });
  if (!baseUrlInput) return;
  const baseUrl = normalizeBaseUrl(baseUrlInput);
  const deviceName = await vscode.window.showInputBox({
    prompt: "这台设备在 Ascend 中显示的名称",
    value: `${runtime.connections.environment} · VS Code`,
    ignoreFocusOut: true,
  });
  if (!deviceName) return;
  const pairing = await runtime.api.startPairing(baseUrl, deviceName);
  await vscode.env.openExternal(vscode.Uri.parse(pairing.verificationUriComplete));
  vscode.window.showInformationMessage(`浏览器中确认设备配对码 ${pairing.userCode}`);
  const credential = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `等待浏览器授权 · ${pairing.userCode}`,
      cancellable: true,
    },
    async (_progress, cancellation) => {
      const expiresAt = new Date(pairing.expiresAt).getTime();
      const interval = Math.max(2, Number(pairing.intervalSeconds || 3)) * 1_000;
      while (!cancellation.isCancellationRequested && Date.now() < expiresAt) {
        const result = await runtime.api.pollPairing(baseUrl, pairing.deviceCode);
        if (result.status === "approved") return result;
        await delay(interval, cancellation);
      }
      if (cancellation.isCancellationRequested) return null;
      throw new ConnectionError("error", "设备配对码已经过期");
    },
  );
  if (!credential) return;
  const profile = await runtime.connections.save(
    { baseUrl, name: profileNameFor(baseUrl), deviceName: credential.deviceName || deviceName },
    credential.token,
  );
  resetConnectionRuntime(runtime);
  await runtime.tree.refresh({ notify: true });
  vscode.window.showInformationMessage(`Ascend Practice 已连接：${profile.name}`);
}

async function connectWithToken(runtime) {
  const baseUrlInput = await vscode.window.showInputBox({
    prompt: "Ascend 服务地址",
    value: runtime.connections.active()?.baseUrl || runtime.api.baseUrl,
    ignoreFocusOut: true,
  });
  if (!baseUrlInput) return;
  const token = await vscode.window.showInputBox({
    prompt: "粘贴 Ascend 设备令牌",
    password: true,
    ignoreFocusOut: true,
  });
  if (!token) return;
  const baseUrl = normalizeBaseUrl(baseUrlInput);
  const profile = await runtime.connections.save(
    { baseUrl, name: profileNameFor(baseUrl), deviceName: `${runtime.connections.environment} · VS Code` },
    token,
  );
  resetConnectionRuntime(runtime);
  await runtime.tree.refresh({ notify: true });
  vscode.window.showInformationMessage(`Ascend Practice 已保存连接：${profile.name}`);
}

async function switchServer(runtime) {
  const active = runtime.connections.active();
  const actions = [
    { label: "$(add) 连接新服务器", action: "pair", alwaysShow: true },
    { label: "$(key) 使用设备令牌连接", action: "token", alwaysShow: true },
    { label: "$(settings-gear) 管理连接档案", action: "manage", alwaysShow: true },
  ];
  const profiles = runtime.connections.profiles().map((profile) => ({
    label: `${profile.id === active?.id ? "$(check) " : "$(server) "}${profile.name}`,
    description: profile.baseUrl,
    detail: profile.environment,
    profile,
  }));
  const picked = await vscode.window.showQuickPick([...profiles, ...actions], {
    placeHolder: "切换 Ascend 服务器或添加连接",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) return;
  if (picked.action === "pair") return pairInBrowser(runtime);
  if (picked.action === "token") return connectWithToken(runtime);
  if (picked.action === "manage") return manageConnections(runtime);
  resetConnectionRuntime(runtime);
  await runtime.connections.select(picked.profile.id);
  await runtime.tree.refresh({ notify: true });
  vscode.window.showInformationMessage(`已切换到 ${picked.profile.name}`);
}

async function manageConnections(runtime) {
  const profiles = runtime.connections.profiles();
  if (!profiles.length) return pairInBrowser(runtime);
  const picked = await vscode.window.showQuickPick(
    profiles.map((profile) => ({
      label: profile.name,
      description: profile.baseUrl,
      detail: `${profile.environment} · ${profile.deviceName}`,
      profile,
    })),
    { placeHolder: "选择要移除的本地连接档案", matchOnDescription: true, matchOnDetail: true },
  );
  if (!picked) return;
  const accepted = await vscode.window.showWarningMessage(
    `从当前 VS Code 移除连接档案“${picked.profile.name}”？服务器中的设备授权仍可在网页端管理。`,
    { modal: true },
    "移除连接",
  );
  if (!accepted) return;
  resetConnectionRuntime(runtime);
  await runtime.connections.remove(picked.profile.id);
  await runtime.tree.refresh();
  vscode.window.showInformationMessage(`连接档案已移除：${picked.profile.name}`);
}

async function pickProblemId(tree) {
  if (!tree.data) await tree.refresh();
  const items = tree.data?.problems || [];
  const picked = await vscode.window.showQuickPick(
    items.map((problem) => ({
      label: problem.title,
      description: `${problem.phaseKey} · ${problem.priorityBand}`,
      problemId: problem.id,
    })),
    { placeHolder: "选择一道 Ascend 题目" },
  );
  return picked?.problemId;
}

async function openProblem(runtime, problemId) {
  const payload = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "正在准备 Ascend 刷题会话" },
    () => runtime.api.problem(problemId),
  );
  const problem = payload.problem;
  runtime.capabilities ||= await runtime.api.capabilities();
  const scope = scopeIdentity(runtime, problem.id, payload);
  const sessionKey = localProblemKey(scope.scopeKey, problem.id, "cpp17");
  const root = await resolveLocalRoot(runtime.context);
  if (!root) return;
  const slug = safeSegment(
    `${problem.phaseKey || "extra"}-${problem.externalProblemId || problem.id}-${problem.title}`,
  );
  const legacyProblemDir = path.join(root, slug);
  const organizedProblemDir = path.join(root, problem.phaseKey || "Extra", slug);
  const expectedScope = { ...scope, problemId: problem.id };
  const legacyMeta = await readJson(path.join(legacyProblemDir, META_FILE));
  const organizedMeta = await readJson(path.join(organizedProblemDir, META_FILE));
  const legacyMatches = localMetadataBelongsToConnection(legacyMeta, expectedScope, runtime.api.baseUrl);
  const organizedMatches = localMetadataBelongsToConnection(organizedMeta, expectedScope, runtime.api.baseUrl);
  const scopedProblemDir = path.join(
    root,
    problem.phaseKey || "Extra",
    `${slug}-${createHash("sha256").update(scope.scopeKey).digest("hex").slice(0, 8)}`,
  );
  const problemDir = legacyMatches
    ? legacyProblemDir
    : organizedMatches || !Object.keys(organizedMeta).length
      ? organizedProblemDir
      : scopedProblemDir;
  const sampleDir = path.join(problemDir, "samples");
  const mainPath = path.join(problemDir, "main.cpp");
  const customInputPath = path.join(problemDir, "custom.in");
  await fs.mkdir(sampleDir, { recursive: true });
  const templateSourceCode = await resolvePracticeTemplate(
    problem.templateSourceCode || problem.starterCode?.cpp17 || "",
  );
  let initialMode = "local";
  const mainExisted = await exists(mainPath);
  if (!mainExisted) {
    const initial = selectInitialSource(problem.draftSourceCode, templateSourceCode);
    initialMode = initial.mode;
    await fs.writeFile(mainPath, initial.sourceCode, "utf8");
  }
  if (!(await exists(customInputPath))) await fs.writeFile(customInputPath, "", "utf8");
  await fs.writeFile(path.join(problemDir, "problem.md"), problemMarkdown(problem), "utf8");
  for (let index = 0; index < problem.examples.length; index += 1) {
    const number = String(index + 1).padStart(2, "0");
    await fs.writeFile(path.join(sampleDir, `${number}.in`), problem.examples[index].input, "utf8");
    await fs.writeFile(path.join(sampleDir, `${number}.out`), problem.examples[index].output, "utf8");
  }
  const priorMeta = await readJson(path.join(problemDir, META_FILE));
  const metadata = {
    ...priorMeta,
    schemaVersion: 2,
    profileId: scope.profileId,
    serverInstanceId: scope.serverInstanceId,
    workspaceId: scope.workspaceId,
    deviceId: scope.deviceId,
    problemId: problem.id,
    language: "cpp17",
    title: problem.title,
    sourceUrl: problem.sourceUrl,
    baseUrl: runtime.api.baseUrl,
    startedAt: priorMeta.startedAt || new Date().toISOString(),
    samples: problem.examples.length,
    initialMode: priorMeta.initialMode || initialMode,
    maxHintLevel: Number(priorMeta.maxHintLevel || 0),
    sessionId: String(priorMeta.sessionId || ""),
    preConfidence: priorMeta.preConfidence === undefined ? null : Number(priorMeta.preConfidence),
    planText: String(priorMeta.planText || ""),
    activeSeconds: Number(priorMeta.activeSeconds || 0),
    day: String(runtime.tree.data?.today || new Date().toISOString().slice(0, 10)),
    draftRevision: Number(priorMeta.draftRevision ?? (mainExisted ? 0 : problem.draftRevision || 0)),
    draftSha256: String(priorMeta.draftSha256 || problem.draftSha256 || ""),
  };
  const current = {
    sessionKey,
    scopeKey: scope.scopeKey,
    problemDir,
    metadata,
    mainPath,
    customInputPath,
    templateSourceCode,
    referenceSourceCode: problem.referenceSourceCode || problem.referenceCode?.cpp17 || "",
    capabilities: runtime.capabilities,
    problem,
  };
  await writeMetadata(current);
  const problemPaths = runtime.context.globalState.get(PROBLEM_PATHS_KEY, {});
  const scopedPaths = scopedProblemPaths(problemPaths, scope.scopeKey);
  const priorPathRecord = scopedPaths[problem.id];
  await runtime.context.globalState.update(PROBLEM_PATHS_KEY, withScopedProblemPath(
    problemPaths,
    scope.scopeKey,
    problem.id,
    {
      ...(priorPathRecord && typeof priorPathRecord === "object" ? priorPathRecord : {}),
      path: problemDir,
      lastOpenedAt: new Date().toISOString(),
    },
  ));
  runtime.sessions.set(sessionKey, current);
  runtime.activity.start(sessionKey, Number(metadata.activeSeconds || 0));
  try {
    await ensureRemoteSession(current, runtime);
  } catch (error) {
    runtime.output.appendLine(`[session] ${String(error.message || error)}`);
  }
  runtime.tree.emitter.fire();
  openProblemPanel(current, runtime);
  const codeDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(mainPath));
  await vscode.window.showTextDocument(codeDoc, { viewColumn: vscode.ViewColumn.Two, preview: false });
  runtime.status.text = `$(code) Ascend · ${problem.title}`;
  runtime.status.tooltip = problemDir;
}

function openProblemPanel(current, runtime) {
  const existing = runtime.panels.get(current.sessionKey);
  if (existing) {
    setProblemPanelHtml(existing, current, runtime);
    existing.reveal(vscode.ViewColumn.One, true);
    return;
  }
  const katexRoot = vscode.Uri.joinPath(runtime.context.extensionUri, "dist", "katex");
  const panel = vscode.window.createWebviewPanel(
    "ascendPractice.problem",
    `题目 · ${current.metadata.title}`,
    { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [katexRoot] },
  );
  setProblemPanelHtml(panel, current, runtime);
  panel.webview.onDidReceiveMessage(async (message) => {
    try {
      await handleProblemPanelMessage(current, runtime, message);
    } catch (error) {
      runtime.output.appendLine(`[panel] ${String(error.stack || error.message || error)}`);
      vscode.window.showErrorMessage(String(error.message || error));
    }
  });
  panel.onDidDispose(() => runtime.panels.delete(current.sessionKey));
  runtime.panels.set(current.sessionKey, panel);
}

function setProblemPanelHtml(panel, current, runtime) {
  panel.webview.html = problemPanelHtml(current, panel.webview, runtime.context.extensionUri);
}

async function handleProblemPanelMessage(current, runtime, message) {
  if (message.command === "runSamples") await runSamples(current, runtime);
  if (message.command === "openCustomInput") await openCustomInput(current);
  if (message.command === "runCustomInput") await runCustomInput(current, runtime);
  if (message.command === "sync") {
    const synced = await syncDraft(runtime.api, current, "manual", "VS Code 手动保存", runtime.status, runtime.context);
    if (!synced) return;
    postSessionStatus(runtime, current, "草稿已同步");
  }
  if (message.command === "recordResult") {
    await recordResult(runtime.api, current, runtime);
    await runtime.tree.refresh();
  }
  if (message.command === "submitFormal") await submitFormal(current, runtime);
  if (message.command === "revealReference") await revealReference(current, runtime);
  if (message.command === "newAttempt") await newAttemptFromTemplate(current, runtime);
  if (message.command === "copySample") {
    const sample = current.problem.examples[Number(message.index)];
    if (sample) {
      await vscode.env.clipboard.writeText(sample.input);
      postSessionStatus(runtime, current, `样例 ${Number(message.index) + 1} 输入已复制`);
    }
  }
}

function problemPanelHtml(current, webview, extensionUri) {
  const problem = current.problem;
  const nonce = randomBytes(16).toString("hex");
  const katexCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "katex", "katex.min.css"));
  const meta = [
    problem.providerLabel,
    problem.externalProblemId && `#${problem.externalProblemId}`,
    problem.phaseKey,
    problem.priorityBand,
  ]
    .filter(Boolean)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");
  const samples = problem.examples
    .map(
      (sample, index) => `<details ${index === 0 ? "open" : ""}>
        <summary>样例 ${index + 1}<button data-copy="${index}" type="button">复制输入</button></summary>
        <div class="sampleGrid"><section><b>输入</b><pre>${escapeHtml(sample.input)}</pre></section><section><b>输出</b><pre>${escapeHtml(sample.output)}</pre></section></div>
      </details>`,
    )
    .join("");
  const referenceDisabled = current.referenceSourceCode ? "" : "disabled";
  const formalJudgeAvailable = current.capabilities?.features?.formalJudge && problem.evaluationMode === "judge";
  const referenceLabel = current.metadata.referenceViewedAt ? "再次查看参考" : "查看参考 · L4";
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' ${webview.cspSource}; style-src-attr 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${katexCssUri}">
<style nonce="${nonce}">
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);font:13px/1.65 var(--vscode-font-family);padding:0 22px 60px}header{padding:24px 0 18px;border-bottom:1px solid var(--vscode-panel-border)}h1{font-size:25px;line-height:1.25;margin:9px 0}.meta{display:flex;gap:6px;flex-wrap:wrap}.meta span,.tag{border:1px solid var(--vscode-panel-border);border-radius:99px;padding:1px 8px;color:var(--vscode-descriptionForeground)}.toolbar{position:sticky;top:0;z-index:3;display:flex;gap:7px;flex-wrap:wrap;padding:10px 0;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border)}button{border:1px solid var(--vscode-button-border,transparent);border-radius:5px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);padding:6px 10px;cursor:pointer}button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}button:hover{background:var(--vscode-button-hoverBackground)}button:disabled{opacity:.45;cursor:default}.session{display:flex;align-items:center;gap:10px;margin:12px 0;color:var(--vscode-descriptionForeground)}#timer{font-variant-numeric:tabular-nums;font-weight:650;color:var(--vscode-foreground)}main{max-width:900px}h2{font-size:18px;margin:27px 0 8px}h3,h4,h5{font-size:15px;margin:20px 0 7px}p{margin:6px 0}.spacer{height:6px}pre{white-space:pre-wrap;word-break:break-word;background:var(--vscode-textCodeBlock-background);border-radius:6px;padding:11px;overflow:auto}code{font-family:var(--vscode-editor-font-family);background:var(--vscode-textCodeBlock-background);padding:1px 4px;border-radius:3px}.katex-display{margin:12px 0;overflow-x:auto;overflow-y:hidden}.math-error{color:var(--vscode-errorForeground);font-family:var(--vscode-editor-font-family)}details{border:1px solid var(--vscode-panel-border);border-radius:7px;margin:10px 0;padding:8px 10px}summary{font-weight:650;cursor:pointer}summary button{float:right;padding:2px 7px;font-size:11px}.sampleGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:9px}.sampleGrid pre{margin:4px 0}.spec{border-left:3px solid var(--vscode-focusBorder);padding-left:12px}.tags{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0}#status{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:700px){body{padding-inline:14px}.sampleGrid{grid-template-columns:1fr}}
</style></head><body>
<header><div class="meta">${meta}</div><h1>${escapeHtml(problem.title)}</h1><div class="tags">${problem.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div></header>
<nav class="toolbar" aria-label="刷题会话工具栏">
  <button class="primary" data-command="runSamples">▶ 运行样例</button>
  <button data-command="openCustomInput">⌨ 编辑自测</button>
  <button data-command="runCustomInput">▷ 运行自测</button>
  <button data-command="sync">☁ 同步</button>
  <button data-command="recordResult">✓ 完成本次</button>
  ${formalJudgeAvailable ? '<button data-command="submitFormal">⇧ 正式评测</button>' : ""}
  <button data-command="revealReference" ${referenceDisabled}>◉ ${referenceLabel}</button>
  <button data-command="newAttempt">↺ 模板新作答</button>
</nav>
<div class="session"><span id="timer" data-start="${escapeHtml(current.metadata.startedAt)}">00:00</span><span id="status">${escapeHtml(sessionStatus(current))}</span></div>
<main><section class="statement">${renderMarkdown(problem.statementMarkdown)}</section>
${problem.inputSpecification ? `<h2>输入说明</h2><div class="spec">${renderMarkdown(problem.inputSpecification)}</div>` : ""}
${problem.outputSpecification ? `<h2>输出说明</h2><div class="spec">${renderMarkdown(problem.outputSpecification)}</div>` : ""}
${samples ? `<h2>公开样例</h2>${samples}` : "<h2>公开样例</h2><p>当前题目没有可解析的公开样例。</p>"}
</main>
<script nonce="${nonce}">const vscode=acquireVsCodeApi();document.querySelectorAll('[data-command]').forEach((button)=>button.addEventListener('click',()=>vscode.postMessage({command:button.dataset.command})));document.querySelectorAll('[data-copy]').forEach((button)=>button.addEventListener('click',(event)=>{event.preventDefault();vscode.postMessage({command:'copySample',index:Number(button.dataset.copy)})}));const timer=document.getElementById('timer');const start=new Date(timer.dataset.start).getTime();function tick(){const seconds=Math.max(0,Math.floor((Date.now()-start)/1000));timer.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')}tick();setInterval(tick,1000);window.addEventListener('message',(event)=>{if(event.data.type==='status')document.getElementById('status').textContent=event.data.text});</script>
</body></html>`;
}

async function resolveLocalRoot(context) {
  const configured = vscode.workspace.getConfiguration("ascendPractice").get("localRoot", "").trim();
  if (configured) {
    await fs.mkdir(configured, { recursive: true });
    return configured;
  }
  const saved = context.globalState.get("ascendPractice.localRoot", "");
  if (saved) return saved;
  const proceed = await vscode.window.showInformationMessage(
    "请选择刷题工作区。扩展会在这里按阶段创建题目目录、main.cpp、样例和自测文件；原始题库目录继续作为资料源。",
    { modal: true },
    "选择刷题工作区",
  );
  if (!proceed) return "";
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "使用此目录作为刷题工作区",
  });
  if (!selected?.[0]) return "";
  await context.globalState.update("ascendPractice.localRoot", selected[0].fsPath);
  return selected[0].fsPath;
}

async function resolvePracticeTemplate(serverTemplate) {
  const configured = vscode.workspace.getConfiguration("ascendPractice").get("templatePath", "").trim();
  if (!configured) return serverTemplate || defaultCppTemplate();
  try {
    const source = await fs.readFile(configured, "utf8");
    return source.trim() ? source : defaultCppTemplate();
  } catch (error) {
    throw new Error(`读取 C++ 模板失败：${configured}（${error.message}）`);
  }
}

function defaultCppTemplate() {
  return "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}\n";
}

async function requireCurrentSession(runtime) {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.scheme === "file") {
    const current = await loadProblemAt(path.dirname(editor.document.uri.fsPath), runtime);
    if (current) return current;
  }
  if (runtime.sessions.size === 1) return [...runtime.sessions.values()][0];
  throw new Error("请先从 Ascend 活动栏打开一道题的 main.cpp");
}

async function loadProblemAt(problemDir, runtime) {
  let metadata = await readJson(path.join(problemDir, META_FILE));
  if (!metadata.problemId) return null;
  const expected = scopeIdentity(runtime, Number(metadata.problemId), runtime.tree.data);
  if (!localMetadataBelongsToConnection(metadata, { ...expected, problemId: metadata.problemId }, runtime.api.baseUrl)) {
    return null;
  }
  if (Number(metadata.schemaVersion || 0) < 2) {
    metadata = {
      ...metadata,
      schemaVersion: 2,
      profileId: expected.profileId,
      serverInstanceId: expected.serverInstanceId,
      workspaceId: expected.workspaceId,
      deviceId: expected.deviceId,
      language: "cpp17",
      draftRevision: Number(metadata.draftRevision || 0),
      draftSha256: String(metadata.draftSha256 || ""),
    };
    await fs.writeFile(path.join(problemDir, META_FILE), JSON.stringify(metadata, null, 2), "utf8");
  }
  const sessionKey = localProblemKey(expected.scopeKey, metadata.problemId, metadata.language || "cpp17");
  const live = runtime.sessions.get(sessionKey);
  if (live) {
    live.metadata = metadata;
    return live;
  }
  const payload = await runtime.api.problem(Number(metadata.problemId));
  runtime.capabilities ||= await runtime.api.capabilities();
  const problem = payload.problem;
  const current = {
    sessionKey,
    scopeKey: expected.scopeKey,
    problemDir,
    metadata,
    mainPath: path.join(problemDir, "main.cpp"),
    customInputPath: path.join(problemDir, "custom.in"),
    templateSourceCode: problem.templateSourceCode || problem.starterCode?.cpp17 || defaultCppTemplate(),
    referenceSourceCode: problem.referenceSourceCode || problem.referenceCode?.cpp17 || "",
    capabilities: runtime.capabilities,
    problem,
  };
  runtime.sessions.set(sessionKey, current);
  runtime.activity.start(sessionKey, Number(metadata.activeSeconds || 0));
  try {
    await ensureRemoteSession(current, runtime);
  } catch (error) {
    runtime.output.appendLine(`[session] ${String(error.message || error)}`);
  }
  return current;
}

async function syncDraft(api, current, versionKind, label, status, context) {
  if (versionKind === "autosave" && current.metadata.draftConflict) return false;
  await saveMainDocument(current);
  const sourceCode = await fs.readFile(current.mainPath, "utf8");
  const sha256 = createHash("sha256").update(sourceCode).digest("hex");
  if (current.metadata.lastSyncSha256 === sha256 && versionKind === "autosave") return true;
  status.text = "$(sync~spin) Ascend 同步中";
  let saved;
  try {
    saved = await api.saveDraft({
      problemId: current.metadata.problemId,
      language: current.metadata.language || "cpp17",
      sourceCode,
      baseRevision: Number(current.metadata.draftRevision || 0),
      operationId: `draft:vscode:${randomUUID()}`,
      versionKind,
      label,
    });
  } catch (error) {
    const conflict = draftConflictFromError(error);
    if (!conflict) throw error;
    current.metadata.draftConflict = conflict;
    await writeMetadata(current);
    status.text = `$(warning) Ascend · 云端 v${Number(conflict.revision || 0)} 已更新`;
    if (versionKind === "autosave") return false;
    const choice = await vscode.window.showWarningMessage(
      `云端草稿 v${Number(conflict.revision || 0)} 已由${conflict.deviceName || "另一端"}更新。`,
      { modal: true },
      "查看并载入云端",
      "保留本地并保存",
    );
    const decision = draftConflictDecision(choice);
    if (decision === "load-cloud") {
      const payload = await api.problem(current.metadata.problemId);
      const cloudSource = String(payload.problem.draftSourceCode || "");
      await replaceMainSource(current, cloudSource);
      current.metadata.draftRevision = Number(payload.problem.draftRevision || conflict.revision || 0);
      current.metadata.draftSha256 = String(payload.problem.draftSha256 || conflict.sha256 || "");
      current.metadata.lastSyncSha256 = current.metadata.draftSha256;
      current.metadata.lastSyncedAt = payload.problem.draftUpdatedAt || new Date().toISOString();
      current.metadata.draftConflict = null;
      await writeMetadata(current);
      status.text = `$(cloud-download) Ascend · 已载入云端 v${current.metadata.draftRevision}`;
      return false;
    }
    if (decision === "overwrite-cloud") {
      current.metadata.draftRevision = Number(conflict.revision || 0);
      current.metadata.draftConflict = null;
      await writeMetadata(current);
      return syncDraft(api, current, "manual", "VS Code 冲突解决", status, context);
    }
    return false;
  }
  current.metadata.lastSyncSha256 = sha256;
  current.metadata.lastSyncedAt = saved.savedAt || new Date().toISOString();
  current.metadata.draftRevision = Number(saved.revision || current.metadata.draftRevision || 0);
  current.metadata.draftSha256 = String(saved.sha256 || sha256);
  current.metadata.draftConflict = null;
  await writeMetadata(current);
  if (context) {
    const store = context.globalState.get(PROBLEM_PATHS_KEY, {});
    const paths = scopedProblemPaths(store, current.scopeKey);
    const prior = paths[current.metadata.problemId];
    await context.globalState.update(PROBLEM_PATHS_KEY, withScopedProblemPath(
      store,
      current.scopeKey,
      current.metadata.problemId,
      {
        path: problemPathValue(prior) || current.problemDir,
        lastOpenedAt: problemPathTimestamp(prior) || current.metadata.startedAt,
        lastSyncedAt: current.metadata.lastSyncedAt,
      },
    ));
  }
  status.text = `$(cloud-upload) Ascend · ${current.metadata.title}`;
  return true;
}

async function replaceMainSource(current, sourceCode) {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(current.mainPath));
  const lastLine = document.lineAt(Math.max(0, document.lineCount - 1));
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length), sourceCode);
  await vscode.workspace.applyEdit(edit);
  await document.save();
}

async function runSamples(current, runtime) {
  runtime.output.clear();
  runtime.output.show(true);
  runtime.output.appendLine(`Ascend Practice · ${current.metadata.title}`);
  runtime.output.appendLine("公开样例测试");
  const binary = await compileCurrent(current, runtime);
  if (!binary) return;
  const sampleCount = Number(current.metadata.samples || 0);
  if (!sampleCount) {
    runtime.output.appendLine("当前题目没有可运行的公开样例。");
    postSessionStatus(runtime, current, "当前题目没有公开样例");
    return;
  }
  let passed = 0;
  for (let index = 1; index <= sampleCount; index += 1) {
    const number = String(index).padStart(2, "0");
    const input = await fs.readFile(path.join(current.problemDir, "samples", `${number}.in`), "utf8");
    const expected = await fs.readFile(path.join(current.problemDir, "samples", `${number}.out`), "utf8");
    const result = await runProcess(binary, [], input, current.problemDir, 5_000);
    const difference = firstOutputDifference(expected, result.stdout);
    const ok = result.code === 0 && difference === null;
    runtime.output.appendLine(`${ok ? "✓ PASS" : "✗ FAIL"} · 样例 ${number} · ${result.durationMs} ms`);
    if (ok) passed += 1;
    else appendFailure(runtime.output, result, expected, difference);
  }
  current.metadata.lastTestedAt = new Date().toISOString();
  current.metadata.lastSampleSummary = `${passed}/${sampleCount}`;
  await writeMetadata(current);
  const allPassed = passed === sampleCount;
  runtime.status.text = allPassed ? "$(pass-filled) Ascend · 样例通过" : "$(error) Ascend · 样例失败";
  postSessionStatus(runtime, current, `公开样例 ${passed}/${sampleCount} 通过`);
  vscode.window.showInformationMessage(`公开样例：${passed}/${sampleCount} 通过`);
}

async function compileCurrent(current, runtime) {
  await saveMainDocument(current);
  const compiler = vscode.workspace.getConfiguration("ascendPractice").get("compiler", "g++");
  const binary = path.join(current.problemDir, process.platform === "win32" ? "main.exe" : "main.out");
  runtime.status.text = "$(loading~spin) Ascend 编译中";
  const compile = await runProcess(
    compiler,
    [current.mainPath, "-std=c++17", "-O2", "-Wall", "-Wextra", "-o", binary],
    "",
    current.problemDir,
    30_000,
  );
  if (compile.stdout.trim()) runtime.output.appendLine(compile.stdout.trim());
  if (compile.stderr.trim()) runtime.output.appendLine(compile.stderr.trim());
  if (compile.outputLimited) runtime.output.appendLine("编译输出超过 1 MiB，进程已停止，以上内容为截断摘录。");
  if (compile.code === 0) {
    runtime.output.appendLine(`编译完成 · ${compile.durationMs} ms\n`);
    return binary;
  }
  runtime.status.text = "$(error) Ascend · CE";
  postSessionStatus(runtime, current, "编译失败，请查看底部输出");
  vscode.window.showErrorMessage("编译失败，详情已写入 Ascend Practice 输出面板");
  return "";
}

function appendFailure(output, result, expected, difference) {
  if (result.code !== 0) output.appendLine(`  进程退出码：${result.code}`);
  if (result.timedOut) output.appendLine("  运行超过 5 秒，进程已停止");
  if (result.outputLimited) output.appendLine("  运行输出超过 1 MiB，进程已停止，以下内容为截断摘录");
  if (difference) {
    output.appendLine(`  首处差异：第 ${difference.line} 行，第 ${difference.column} 列`);
    output.appendLine(`  期望该行：${difference.expectedLine}`);
    output.appendLine(`  实际该行：${difference.actualLine}`);
  }
  output.appendLine(`  完整期望：\n${expected}`);
  output.appendLine(`  完整实际：\n${result.stdout}`);
  if (result.stderr.trim()) output.appendLine(`  标准错误：\n${result.stderr}`);
}

async function openCustomInput(current) {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(current.customInputPath));
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
}

async function runCustomInput(current, runtime) {
  runtime.output.clear();
  runtime.output.show(true);
  runtime.output.appendLine(`Ascend Practice · ${current.metadata.title}`);
  runtime.output.appendLine("自定义输入测试");
  const binary = await compileCurrent(current, runtime);
  if (!binary) return;
  const input = await fs.readFile(current.customInputPath, "utf8");
  const result = await runProcess(binary, [], input, current.problemDir, 5_000);
  runtime.output.appendLine(`运行完成 · ${result.durationMs} ms · 退出码 ${result.code}`);
  if (result.outputLimited) runtime.output.appendLine("输出超过 1 MiB，进程已停止，以下内容为截断摘录。");
  runtime.output.appendLine(`\n输入：\n${input}`);
  runtime.output.appendLine(`\n输出：\n${result.stdout}`);
  if (result.stderr.trim()) runtime.output.appendLine(`\n标准错误：\n${result.stderr}`);
  runtime.status.text = result.code === 0 ? "$(terminal) Ascend · 自测完成" : "$(error) Ascend · 自测异常";
  postSessionStatus(runtime, current, `自定义输入运行完成，退出码 ${result.code}`);
}

async function revealReference(current, runtime) {
  if (!current.referenceSourceCode) {
    vscode.window.showInformationMessage("当前题目没有可用的参考代码");
    return;
  }
  const accepted = await vscode.window.showWarningMessage(
    "查看参考代码会把本次训练的最高提示级别记为 L4。",
    { modal: true },
    "查看参考代码",
  );
  if (!accepted) return;
  current.metadata.maxHintLevel = 4;
  current.metadata.referenceViewedAt = new Date().toISOString();
  await writeMetadata(current);
  const uri = vscode.Uri.parse(
    `ascend-reference:/problem-${current.metadata.problemId}/${safeSegment(current.metadata.title)}-reference.cpp`,
  );
  runtime.referenceProvider.set(uri, current.referenceSourceCode);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.languages.setTextDocumentLanguage(doc, "cpp");
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
  const panel = runtime.panels.get(current.sessionKey);
  if (panel) setProblemPanelHtml(panel, current, runtime);
  postSessionStatus(runtime, current, "已查看参考代码，本次提示级别 L4");
}

async function newAttemptFromTemplate(current, runtime) {
  const accepted = await vscode.window.showWarningMessage(
    "将当前 main.cpp 备份到 .ascend-history 后，从模板开始新的作答。",
    { modal: true },
    "开始新作答",
  );
  if (!accepted) return;
  await saveMainDocument(current);
  const historyDir = path.join(current.problemDir, ".ascend-history");
  await fs.mkdir(historyDir, { recursive: true });
  const backup = path.join(historyDir, `main-${new Date().toISOString().replaceAll(":", "-")}.cpp`);
  await fs.copyFile(current.mainPath, backup);
  const nextSource = current.templateSourceCode || defaultCppTemplate();
  const openDocument = vscode.workspace.textDocuments.find(
    (document) => document.uri.scheme === "file" && document.uri.fsPath === current.mainPath,
  );
  if (openDocument) {
    const edit = new vscode.WorkspaceEdit();
    const end = openDocument.lineAt(Math.max(0, openDocument.lineCount - 1)).range.end;
    edit.replace(openDocument.uri, new vscode.Range(new vscode.Position(0, 0), end), nextSource);
    await vscode.workspace.applyEdit(edit);
    await openDocument.save();
  } else {
    await fs.writeFile(current.mainPath, nextSource, "utf8");
  }
  current.metadata.startedAt = new Date().toISOString();
  if (current.metadata.sessionId) {
    await runtime.api.recordActivity({
      sessionId: current.metadata.sessionId,
      activeSeconds: runtime.activity.seconds(current.sessionKey),
    });
    await runtime.api.abandonSession({ sessionId: current.metadata.sessionId });
  }
  current.metadata.activeSeconds = 0;
  current.metadata.maxHintLevel = 0;
  current.metadata.referenceViewedAt = null;
  current.metadata.initialMode = "template";
  current.metadata.lastSyncSha256 = "";
  current.metadata.sessionId = "";
  current.metadata.preConfidence = null;
  current.metadata.planText = "";
  current.metadata.lastActivitySyncedSeconds = 0;
  runtime.activity.end(current.sessionKey);
  runtime.activity.start(current.sessionKey, 0);
  await writeMetadata(current);
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(current.mainPath));
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Two, preview: false });
  const panel = runtime.panels.get(current.sessionKey);
  if (panel) setProblemPanelHtml(panel, current, runtime);
  postSessionStatus(runtime, current, "已从模板开始新作答，原代码已备份");
}

async function recordResult(api, current, runtime) {
  const prepared = await prepareSessionEvidence(current, runtime, false);
  if (!prepared) return;
  const verdict = await vscode.window.showQuickPick(["AC", "WA", "CE", "TLE", "MLE", "RE", "OTHER"], {
    placeHolder: "本次训练结果",
  });
  if (!verdict) return;
  const elapsed = Math.max(1, Math.ceil(runtime.activity.seconds(current.sessionKey) / 60));
  const duration = await vscode.window.showInputBox({
    prompt: "有效训练分钟",
    value: String(elapsed),
    validateInput: integerInput,
  });
  if (duration === undefined) return;
  const errorCategory =
    verdict === "AC"
      ? ""
      : (await vscode.window.showInputBox({ prompt: "错误类别，例如：边界、算法选择、实现、复杂度" })) || "";
  const reflection = await vscode.window.showInputBox({ prompt: "本次复盘或纠正规则", value: "" });
  if (reflection === undefined) return;
  const synced = await syncDraft(api, current, "manual", `${verdict} 前保存`, runtime.status, runtime.context);
  if (!synced) return;
  await api.recordActivity({
    sessionId: current.metadata.sessionId,
    activeSeconds: Number(duration) * 60,
    planText: current.metadata.planText || undefined,
    preConfidence: current.metadata.preConfidence,
  });
  await api.finishSession({
    sessionId: current.metadata.sessionId,
    verdict,
    activeSeconds: Number(duration) * 60,
    maxHintLevel: Number(current.metadata.maxHintLevel || 0),
    errorCategory,
    reflection,
  });
  current.metadata.startedAt = new Date().toISOString();
  current.metadata.lastVerdict = verdict;
  current.metadata.maxHintLevel = 0;
  current.metadata.referenceViewedAt = null;
  current.metadata.sessionId = "";
  current.metadata.preConfidence = null;
  current.metadata.planText = "";
  current.metadata.activeSeconds = 0;
  current.metadata.lastActivitySyncedSeconds = 0;
  runtime.activity.end(current.sessionKey);
  runtime.activity.start(current.sessionKey, 0);
  await writeMetadata(current);
  runtime.status.text = `$(check) Ascend · ${verdict}`;
  postSessionStatus(runtime, current, `训练结果 ${verdict} 已回写 Ascend`);
  vscode.window.showInformationMessage(`训练结果 ${verdict} 已回写 Ascend`);
}

async function prepareSessionEvidence(current, runtime, requirePlan) {
  if (current.metadata.preConfidence === null || current.metadata.preConfidence === undefined) {
    const choice = await vscode.window.showQuickPick(
      [
        { label: "0 · 完全没把握", value: 0 },
        { label: "1 · 偏低", value: 1 },
        { label: "2 · 较有把握", value: 2 },
        { label: "3 · 很有把握", value: 3 },
      ],
      { placeHolder: "在查看结果前记录当前作答信心" },
    );
    if (!choice) return false;
    current.metadata.preConfidence = choice.value;
  }
  if (requirePlan && String(current.metadata.planText || "").trim().length < 10) {
    const planText = await vscode.window.showInputBox({
      prompt: "正式提交前记录关键思路、不变量或边界",
      value: String(current.metadata.planText || ""),
      validateInput: (value) => value.trim().length >= 10 ? null : "请至少写 10 个字符",
      ignoreFocusOut: true,
    });
    if (planText === undefined) return false;
    current.metadata.planText = planText.trim();
  }
  await ensureRemoteSession(current, runtime);
  await runtime.api.recordActivity({
    sessionId: current.metadata.sessionId,
    activeSeconds: runtime.activity.seconds(current.sessionKey),
    planText: current.metadata.planText || undefined,
    preConfidence: current.metadata.preConfidence,
  });
  await writeMetadata(current);
  return true;
}

async function ensureRemoteSession(current, runtime) {
  const start = () => runtime.api.startSession({
    sessionId: current.metadata.sessionId,
    problemId: current.metadata.problemId,
    day: current.metadata.day || runtime.tree.data?.today,
    language: current.metadata.language || "cpp17",
    planText: current.metadata.planText || undefined,
    preConfidence: current.metadata.preConfidence,
    reviewKind: current.problem.evidenceStatus === "unseen" ? "initial" : "original_retest",
  });
  if (!current.metadata.sessionId) current.metadata.sessionId = `session:vscode:${randomUUID()}`;
  try {
    await start();
  } catch (error) {
    if (!String(error.message || error).includes("训练会话已经结束")) throw error;
    current.metadata.sessionId = `session:vscode:${randomUUID()}`;
    current.metadata.startedAt = new Date().toISOString();
    current.metadata.activeSeconds = 0;
    current.metadata.lastActivitySyncedSeconds = 0;
    runtime.activity.end(current.sessionKey);
    runtime.activity.start(current.sessionKey, 0);
    await start();
  }
  await writeMetadata(current);
}

async function submitFormal(current, runtime) {
  if (!current.capabilities?.features?.formalJudge || current.problem.evaluationMode !== "judge") {
    throw new Error("当前题目或服务器尚未开放正式评测");
  }
  const prepared = await prepareSessionEvidence(current, runtime, true);
  if (!prepared) return;
  const synced = await syncDraft(runtime.api, current, "manual", "正式评测前保存", runtime.status, runtime.context);
  if (!synced) return;
  await saveMainDocument(current);
  const sourceCode = await fs.readFile(current.mainPath, "utf8");
  const activeSeconds = Math.max(1, runtime.activity.seconds(current.sessionKey));
  await runtime.api.recordActivity({
    sessionId: current.metadata.sessionId,
    activeSeconds,
    planText: current.metadata.planText,
    preConfidence: current.metadata.preConfidence,
  });
  let response = await runtime.api.submit({
    operationId: `submission:vscode:${randomUUID()}`,
    sessionId: current.metadata.sessionId,
    problemId: current.metadata.problemId,
    day: current.metadata.day || runtime.tree.data?.today,
    language: current.metadata.language || "cpp17",
    sourceCode,
    planText: current.metadata.planText,
    preConfidence: current.metadata.preConfidence,
    maxHintLevel: Number(current.metadata.maxHintLevel || 0),
    reviewKind: current.problem.evidenceStatus === "unseen" ? "initial" : "original_retest",
    activeSeconds,
    submissionKind: "formal",
  });
  let submission = response.submission;
  current.metadata.lastSubmissionId = submission.id;
  await writeMetadata(current);
  runtime.output.clear();
  runtime.output.show(true);
  runtime.output.appendLine(`Ascend Practice · ${current.metadata.title} · 正式评测`);
  runtime.output.appendLine(`提交 ID：${submission.id}`);
  submission = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Ascend 正式评测中",
      cancellable: true,
    },
    async (_progress, cancellation) => {
      const deadline = Date.now() + 5 * 60_000;
      while (!["AC", "WA", "TLE", "MLE", "RE", "CE", "JE", "CANCELLED", "RETRYABLE_ERROR"].includes(submission.status)) {
        if (cancellation.isCancellationRequested) throw new Error(`已停止等待评测结果，提交 ID：${submission.id}`);
        if (Date.now() >= deadline) throw new Error(`等待评测结果超时，提交 ID：${submission.id}`);
        await delay(1500);
        response = await runtime.api.submission(submission.id);
        submission = response.submission;
      }
      return submission;
    },
  );
  runtime.output.appendLine(`结果：${submission.status}`);
  if (submission.timeMs !== null) runtime.output.appendLine(`时间：${submission.timeMs} ms`);
  if (submission.memoryKb !== null) runtime.output.appendLine(`内存：${submission.memoryKb} KiB`);
  if (submission.compilerExcerpt) runtime.output.appendLine(`编译信息：\n${submission.compilerExcerpt}`);
  for (const feedback of submission.publicFeedback || []) {
    runtime.output.appendLine(`公开样例 ${Number(feedback.caseIndex) + 1}：${feedback.status}`);
  }
  current.metadata.lastVerdict = submission.status;
  if (["AC", "WA", "TLE", "MLE", "RE", "CE", "JE", "CANCELLED"].includes(submission.status)) {
    current.metadata.sessionId = "";
    current.metadata.preConfidence = null;
    current.metadata.planText = "";
    current.metadata.maxHintLevel = 0;
    current.metadata.startedAt = new Date().toISOString();
    current.metadata.activeSeconds = 0;
    current.metadata.lastActivitySyncedSeconds = 0;
    runtime.activity.end(current.sessionKey);
    runtime.activity.start(current.sessionKey, 0);
  }
  await writeMetadata(current);
  runtime.status.text = submission.status === "AC" ? "$(pass-filled) Ascend · AC" : `$(error) Ascend · ${submission.status}`;
  postSessionStatus(runtime, current, `正式评测 ${submission.status}`);
  vscode.window.showInformationMessage(`Ascend 正式评测：${submission.status}`);
}

function postSessionStatus(runtime, current, text) {
  runtime.panels.get(current.sessionKey)?.webview.postMessage({ type: "status", text });
}

function sessionStatus(current) {
  if (current.metadata.referenceViewedAt) return "参考代码已查看 · 最高提示 L4";
  if (current.metadata.lastSampleSummary) return `上次样例 ${current.metadata.lastSampleSummary} 通过`;
  if (current.metadata.initialMode === "cloud-draft") return "已恢复云端草稿";
  if (current.metadata.initialMode === "template") return "已从 C++ 模板开始";
  return "继续本地 main.cpp";
}

async function writeMetadata(current) {
  await fs.writeFile(path.join(current.problemDir, META_FILE), JSON.stringify(current.metadata, null, 2), "utf8");
}

async function saveMainDocument(current) {
  const document = vscode.workspace.textDocuments.find(
    (candidate) => candidate.uri.scheme === "file" && candidate.uri.fsPath === current.mainPath,
  );
  if (document?.isDirty) await document.save();
}

function problemMarkdown(problem) {
  const examples = problem.examples
    .map(
      (example, index) =>
        `## 样例 ${index + 1}\n\n输入：\n\n\`\`\`text\n${example.input}\n\`\`\`\n\n输出：\n\n\`\`\`text\n${example.output}\n\`\`\``,
    )
    .join("\n\n");
  return `${problem.statementMarkdown}\n\n## 输入说明\n\n${problem.inputSpecification}\n\n## 输出说明\n\n${problem.outputSpecification}\n\n${examples}\n\n---\n来源：${problem.sourceUrl}\n`;
}

function integerInput(value) {
  return /^\d{1,4}$/.test(value) && Number(value) <= 1440 ? null : "请输入 0–1440 的整数";
}

function resetConnectionRuntime(runtime) {
  for (const timer of runtime.syncTimers?.values() || []) clearTimeout(timer);
  runtime.syncTimers?.clear();
  for (const panel of runtime.panels.values()) panel.dispose();
  runtime.panels.clear();
  runtime.sessions.clear();
  runtime.activity.clear();
}

async function tickActiveSession(runtime) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== "file") return;
  const current = [...runtime.sessions.values()].find((session) => session.mainPath === editor.document.uri.fsPath);
  if (!current) return;
  const seconds = runtime.activity.tick(current.sessionKey, vscode.window.state.focused);
  current.metadata.activeSeconds = seconds;
  const prior = Number(current.metadata.lastActivitySyncedSeconds || 0);
  if (!current.metadata.sessionId || seconds - prior < 30) return;
  current.metadata.lastActivitySyncedSeconds = seconds;
  await writeMetadata(current);
  try {
    await runtime.api.recordActivity({
      sessionId: current.metadata.sessionId,
      activeSeconds: seconds,
      planText: current.metadata.planText || undefined,
      preConfidence: current.metadata.preConfidence,
    });
  } catch (error) {
    runtime.output.appendLine(`[activity] ${String(error.message || error)}`);
  }
}

function scopeIdentity(runtime, problemId, payload = runtime.tree?.data) {
  const profile = runtime.connections.active();
  if (!profile) throw new ConnectionError("unpaired", "请先连接 Ascend");
  const serverInstanceId = String(payload?.server?.instanceId || `profile-${profile.id}`);
  const workspaceId = String(payload?.workspace?.id || "workspace");
  return {
    scopeKey: profileScopeKey(profile, payload),
    profileId: profile.id,
    serverInstanceId,
    workspaceId,
    deviceId: String(payload?.device?.id || ""),
    problemId: Number(problemId),
  };
}

function problemPathsForRuntime(runtime) {
  const scope = scopeIdentity(runtime, 1, runtime.tree?.data);
  return scopedProblemPaths(runtime.context.globalState.get(PROBLEM_PATHS_KEY, {}), scope.scopeKey);
}

function localMetadataBelongsToConnection(metadata, expected, activeBaseUrl) {
  if (!metadata || !Object.keys(metadata).length) return false;
  if (Number(metadata.schemaVersion || 0) >= 2) return metadataMatchesScope(metadata, expected);
  try {
    return Number(metadata.problemId) === Number(expected.problemId)
      && normalizeBaseUrl(metadata.baseUrl) === normalizeBaseUrl(activeBaseUrl);
  } catch {
    return false;
  }
}

function problemPathValue(value) {
  if (typeof value === "string") return value;
  return value && typeof value.path === "string" ? value.path : "";
}

function problemPathTimestamp(value) {
  return value && typeof value.lastOpenedAt === "string" ? value.lastOpenedAt : "";
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

function describeEnvironment() {
  const remote = vscode.env.remoteName;
  if (remote === "wsl") return `WSL · ${process.env.WSL_DISTRO_NAME || "Linux"}`;
  if (remote) return `${remote} · ${process.platform}`;
  if (process.platform === "win32") return "Windows 本机";
  if (process.platform === "darwin") return "macOS 本机";
  return "Linux 本机";
}

function delay(milliseconds, cancellation) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    const subscription = cancellation?.onCancellationRequested(() => {
      clearTimeout(timer);
      subscription.dispose();
      resolve();
    });
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
