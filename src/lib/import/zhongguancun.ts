import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { getUploadRoot } from "../db";
import { addTask, deleteTask } from "../repo/planner";
import { createSubject, createChapter, createPoint, updatePoint } from "../repo/knowledge";
import { createAssetFromUpload, linkAsset } from "../repo/library";
import { updateDayEntry } from "../repo/days";

export const ZHONGGUANCUN_IMPORT_SOURCE = "import:zhongguancun";
export const ZHONGGUANCUN_IMPORT_MARKER = "[中关村学院冲刺计划导入]";

type TierKey = "A" | "B" | "C";

export type ParsedTopicGroup = {
  tier: TierKey;
  topics: string[];
};

export type ParsedPlan = {
  written: Array<{ sourceCode: string; title: string; groups: ParsedTopicGroup[] }>;
  machine: ParsedTopicGroup[];
};

export type ResourceEntry = {
  topic: string;
  defaultEntry: string;
  fallback: string;
  stopStandard: string;
};

export type ParsedResources = {
  entries: ResourceEntry[];
};

export type ZhongguancunImportSummary = {
  dryRun: boolean;
  subjects: number;
  chapters: number;
  points: number;
  resourceEntries: number;
  dailyEntries: number;
  removedTasks: number;
  tasks: number;
  skippedTasks: number;
  assets: number;
};

const TASK_SPLIT_MARKER = "[中关村学院任务拆分v2]";

const SUBJECT_META: Record<string, { code: string; name: string; description: string; track: "written" | "machine" }> = {
  M1: {
    code: "M1",
    name: "线性代数",
    description: "中关村学院冲刺计划：线性代数基础、特征值、对角化、二次型、正定与 PCA。",
    track: "written",
  },
  M2: {
    code: "M2",
    name: "概率统计",
    description: "中关村学院冲刺计划：概率、随机变量、分布、统计推断、MLE、马尔可夫与朴素贝叶斯。",
    track: "written",
  },
  M3: {
    code: "M3",
    name: "最优化",
    description: "中关村学院冲刺计划：微积分、梯度、Hessian、凸性、梯度下降、链式法则与约束优化。",
    track: "written",
  },
  M4: {
    code: "M4",
    name: "机器学习",
    description: "中关村学院冲刺计划：模式识别、朴素贝叶斯、逻辑回归、PCA 与神经网络手算。",
    track: "written",
  },
  MATH5: {
    code: "MATH5",
    name: "综合计算与数理素养",
    description: "中关村学院冲刺计划中的 M5：综合建模、量纲/边界检查以及跨模块计算与解释。",
    track: "written",
  },
  ALG: {
    code: "ALG",
    name: "算法机试",
    description: "中关村学院 48 天冲刺计划：ACM I/O、STL、搜索、贪心、DP、图算法及部分分策略。",
    track: "machine",
  },
};

const PLAN_SUBJECT_MAP: Record<string, string> = {
  M1: "M1",
  M2: "M2",
  M3: "M3",
  M4: "M4",
  M5: "MATH5",
};

const WEEK_WRITTEN_SUBJECT: Record<string, string | null> = {
  W1: "M1",
  W2: "M2",
  W3: null,
  W4: "M3",
  W5: "M4",
  W6: "M4",
  W7: null,
};

const WEEKS = [
  {
    key: "W1",
    start: "2026-08-01",
    end: "2026-08-07",
    written: "M1 线代收尾：特征值、对角化、A^n、实对称与正定",
    machine: "STL 诊断；字符串、排序、map/set、格式化、溢出",
    acceptance: "完成诊断；A^n＋正定各 1 题；机试独立 AC 5–6 题",
    daily: [],
  },
  {
    key: "W2",
    start: "2026-08-08",
    end: "2026-08-14",
    written: "M2 概率核心：条件概率、分布、联合/条件、期望方差、MLE",
    machine: "模拟、枚举、前缀和、双指针、二分",
    acceptance: "概率周测；机试独立 AC 8–10 题",
    daily: ["序列式容器＋sort", "map/set", "stack/queue", "priority_queue", "字符串综合", "格式化、溢出与周测"],
  },
  {
    key: "W3",
    start: "2026-08-15",
    end: "2026-08-21",
    written: "M2 强化＋M3 起步：贝叶斯、马尔可夫、偏导、梯度、链式法则",
    machine: "递归、DFS、BFS、迷宫与连通块",
    acceptance: "马尔可夫专项 2 题；搜索独立 AC 6–8 题",
    daily: ["递归（一）", "递归（二）", "DFS（一）", "DFS 模板与迷宫", "BFS", "BFS 最短步数"],
  },
  {
    key: "W4",
    start: "2026-08-22",
    end: "2026-08-28",
    written: "M3 最优化：Hessian、凸性、梯度下降、拉格朗日",
    machine: "贪心、基础 DP、数字三角形、LIS",
    acceptance: "梯度/优化周测；DP 独立 AC 6–8 题",
    daily: ["贪心", "贪心正确性", "DP（一）", "DP（二）", "DP 四要素＋LIS", "DP 综合题"],
  },
  {
    key: "W5",
    start: "2026-08-29",
    end: "2026-09-04",
    written: "M4 模式识别：朴素贝叶斯、逻辑回归、PCA",
    machine: "0/1 背包、优先队列、图表示、Dijkstra",
    acceptance: "PCA 闭卷手算；算法独立 AC 5–7 题",
    daily: ["0/1 背包", "完全/分组背包辨析", "优先队列应用", "图概念＋邻接表", "Dijkstra", "Dijkstra 独立重写"],
  },
  {
    key: "W6",
    start: "2026-09-05",
    end: "2026-09-11",
    written: "神经网络前向/反向；五项专项第一次回炉",
    machine: "Bellman-Ford、Floyd、拓扑、并查集；历年第一题限时",
    acceptance: "第 1 套笔试模拟；历年第一题完成；第 1 次 3h 机试模拟",
    daily: ["Bellman-Ford/负环", "Floyd", "拓扑排序", "并查集", "历年第一题限时", "第 1 次 3h 模拟"],
  },
  {
    key: "W7",
    start: "2026-09-12",
    end: "2026-09-17",
    written: "五模块综合与薄弱点修复；五项专项第二次回炉；公式、证明、推导全量默写",
    machine: "四套真题限时与部分分；C 层识别；第 2 次 3h 模拟；模板和环境检查",
    acceptance: "第 2 套笔试模拟＋第 2 次 3h 模拟＋最终失分清单与考场策略",
    daily: ["线段树/ODT 识别＋核心模板", "分数规划/多维背包识别", "网络流/费用流识别＋部分分方案", "第 2 次 3h 模拟", "模拟订正", "最终模板、环境与 I/O 检查"],
  },
] as const;

const COMPRESSED_W1: Record<string, { written: string; machine: string; acceptance: string }> = {
  "2026-08-04": {
    written: "特征值、特征向量与对角化诊断",
    machine: "完成 I/O、STL、字符串/模拟、搜索四项能力诊断",
    acceptance: "记录不会、会但写错、超时三类问题",
  },
  "2026-08-05": {
    written: "相似对角化求 A^n：例题 1 道＋闭卷题 1 道",
    machine: "vector、sort、map/set；独立 AC 2 题",
    acceptance: "能说明对角化条件，并独立完成计数与排序",
  },
  "2026-08-06": {
    written: "实对称矩阵、正交对角化与正定性",
    machine: "字符串、stack/queue；独立 AC 2 题",
    acceptance: "正定题闭卷 1 道，容器题不复制旧代码",
  },
  "2026-08-07": {
    written: "A^n 与正定各重做 1 题，整理线代失分清单",
    machine: "priority_queue、格式化、整数溢出；独立 AC 1–2 题＋周测",
    acceptance: "W1 累计独立 AC 5–6 题，列出 W2 需要回补的唯一薄弱点",
  },
};

function cleanTopic(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[；。]+$/, "")
    .trim();
}

function listItems(block: string): string[] {
  return block
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:[-*]|\d+[.)])\s+(.+?)\s*$/)?.[1])
    .filter((item): item is string => Boolean(item))
    .map(cleanTopic)
    .filter(Boolean);
}

function parseGroups(block: string): ParsedTopicGroup[] {
  const matches = [...block.matchAll(/^\*\*([ABC])\s+[^*]+\*\*\s*$/gm)];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? block.length;
    return { tier: match[1] as TierKey, topics: listItems(block.slice(start, end)) };
  }).filter((group) => group.topics.length > 0);
}

export function parseZhongguancunPlan(markdown: string): ParsedPlan {
  const writtenBlock = markdown.match(/^## 三、笔试全面覆盖地图[\s\S]*?^## 四、机试全面覆盖地图/m)?.[0] ?? "";
  const subjectMatches = [...writtenBlock.matchAll(/^### (M\d)\s+(.+)$/gm)];
  const written = subjectMatches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = subjectMatches[index + 1]?.index ?? writtenBlock.length;
    const body = writtenBlock.slice(start, end);
    const groups = parseGroups(body);
    if (!groups.length) {
      const topics = listItems(body);
      if (topics.length) groups.push({ tier: "A", topics });
    }
    return { sourceCode: match[1], title: match[2].trim(), groups };
  }).filter((subject) => subject.groups.length > 0);

  const specialBlock = markdown.match(/^### 五项必须拿稳的专项[\s\S]*?^## 四、机试全面覆盖地图/m)?.[0] ?? "";
  const specialTopics = listItems(specialBlock);
  const m5 = written.find((subject) => subject.sourceCode === "M5");
  if (m5 && specialTopics.length) m5.groups.push({ tier: "B", topics: specialTopics });

  const machineBlock = markdown.match(/^## 四、机试全面覆盖地图[\s\S]*?^## 五、七周执行计划/m)?.[0] ?? "";
  const machineHeadings = [...machineBlock.matchAll(/^### ([ABC])\s+[^\n]+$/gm)];
  const machine = machineHeadings.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = machineHeadings[index + 1]?.index ?? machineBlock.length;
    return { tier: match[1] as TierKey, topics: listItems(machineBlock.slice(start, end)) };
  }).filter((group) => group.topics.length > 0);

  return { written, machine };
}

function tableCells(line: string): string[] | null {
  if (!line.trim().startsWith("|")) return null;
  const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
  if (cells.length !== 4 || cells.every((cell) => /^-+$/.test(cell))) return null;
  return cells;
}

export function parseZhongguancunResources(markdown: string): ParsedResources {
  const block = markdown.match(/^## 五、各专题唯一入口[\s\S]*?^## 六、一次学习的固定流程/m)?.[0] ?? "";
  const entries: ResourceEntry[] = [];
  for (const line of block.split(/\r?\n/)) {
    const cells = tableCells(line);
    if (!cells || cells[0] === "专题") continue;
    entries.push({ topic: cleanTopic(cells[0]), defaultEntry: cells[1], fallback: cells[2], stopStandard: cells[3] });
  }
  return { entries };
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function dateDiff(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

function weekFor(date: string) {
  return WEEKS.find((week) => date >= week.start && date <= week.end) ?? null;
}

function dailyPlan(date: string): {
  week: string;
  written: string;
  machine: string;
  acceptance: string;
  hasTask: boolean;
  isReviewDay: boolean;
  researchBlock: boolean;
} {
  const week = weekFor(date);
  if (!week) {
    return {
      week: "维护期",
      written: "重学习期已结束，按错题和薄弱点维护",
      machine: "工作日 45–60min；周末轮换模拟、订正与模板复写",
      acceptance: "不新增课程；只根据能力数据调整一个薄弱点",
      hasTask: true,
      isReviewDay: false,
      researchBlock: false,
    };
  }
  if (date < "2026-08-04") {
    return {
      week: week.key,
      written: "名义起点；尚未正式开始，不熬夜补回 8/1–8/3",
      machine: "等待 8/4–8/7 四天压缩启动诊断",
      acceptance: "不补课，保留启动校准说明",
      hasTask: false,
      isReviewDay: false,
      researchBlock: false,
    };
  }
  const compressed = COMPRESSED_W1[date];
  if (compressed) return { week: "W1", ...compressed, hasTask: true, isReviewDay: false, researchBlock: false };
  const dayIndex = dateDiff(week.start, date);
  const isReviewDay = dayIndex >= 6;
  const researchBlock = week.key >= "W4" && (isReviewDay || date === "2026-09-17");
  const machine = isReviewDay ? "复盘/机动日：笔试周测、机试限时题、集中订正与下周排序" : week.daily[dayIndex];
  return { week: week.key, written: week.written, machine, acceptance: week.acceptance, hasTask: true, isReviewDay, researchBlock };
}

function buildDailyText(date: string): string {
  const plan = dailyPlan(date);
  const lines = [
    ZHONGGUANCUN_IMPORT_MARKER,
    TASK_SPLIT_MARKER,
    `来源：中关村学院冲刺备考计划（2026.8.1 起） · ${plan.week}`,
    `笔试：${plan.written}`,
    `机试：${plan.machine}`,
    `当日验收：${plan.acceptance}`,
  ];
  if (date >= "2026-08-04" && date <= "2026-09-17") {
    if (plan.isReviewDay) {
      lines.push("复盘日任务拆分：笔试周测 60min；机试限时题 90min；集中订正 45min；下周优先级更新 30min。");
    } else {
      lines.push("标准学习块拆分：笔试概念与例题 90min；笔试独立做题 75min；机试学习与编码 120min；回忆与错题 30min（合计 315min）。");
    }
  }
  if (plan.researchBlock) lines.push("额外任务：若招生办确认包含该环节，安排 60–90min 科研/AI 原型或面试准备，不挤占独立做题与订正。");
  return lines.join("\n");
}

type PlannedTask = {
  suffix: string;
  title: string;
  estimatedMinutes: number;
  subjectCode?: string;
  activityType: "study" | "practice" | "recall" | "review" | "mock";
  priority: 1 | 2 | 3;
  completionCriteria: string;
};

function plannedTasks(date: string): PlannedTask[] {
  const plan = dailyPlan(date);
  if (!plan.hasTask) return [];
  if (plan.isReviewDay) {
    const tasks: PlannedTask[] = [
      {
        suffix: "written-test",
        title: `笔试周测 · ${plan.week}`,
        estimatedMinutes: 60,
        subjectCode: WEEK_WRITTEN_SUBJECT[plan.week] ?? undefined,
        activityType: "mock",
        priority: 1,
        completionCriteria: `完成笔试周测，并按“不会、算错、条件错误、时间不够、表达不完整”分类记录。${plan.acceptance}`,
      },
      {
        suffix: "coding-test",
        title: `机试限时题 · ${plan.week}`,
        estimatedMinutes: 90,
        subjectCode: "ALG",
        activityType: "mock",
        priority: 1,
        completionCriteria: `完成机试限时训练，记录独立 AC、超时、边界错误和部分分方案。${plan.acceptance}`,
      },
      {
        suffix: "correction",
        title: `集中订正 · ${plan.week}`,
        estimatedMinutes: 45,
        activityType: "review",
        priority: 2,
        completionCriteria: "只记录会改变下一次行为的错误原因、突破口和复现日期。",
      },
      {
        suffix: "next-priority",
        title: `下周优先级更新 · ${plan.week}`,
        estimatedMinutes: 30,
        activityType: "review",
        priority: 2,
        completionCriteria: "只选一个下周唯一薄弱点，写清调整动作，不用新增课程或题单。",
      },
    ];
    if (plan.researchBlock) {
      tasks.push({
        suffix: "research",
        title: `科研/AI/面试准备 · ${plan.week}`,
        estimatedMinutes: 60,
        activityType: "study",
        priority: 3,
        completionCriteria: "若招生办确认包含该环节，完成一个 AI 应用功能、项目表达练习或研究兴趣梳理。",
      });
    }
    return tasks;
  }

  const subjectCode = WEEK_WRITTEN_SUBJECT[plan.week] ?? undefined;
  const tasks: PlannedTask[] = [
    {
      suffix: "written-concepts",
      title: `笔试概念与例题 · ${plan.written}`,
      estimatedMinutes: 90,
      subjectCode,
      activityType: "study",
      priority: 1,
      completionCriteria: `主动推导本日笔试主线，完成例题并写出使用条件。${plan.acceptance}`,
    },
    {
      suffix: "written-practice",
      title: `笔试独立做题 · ${plan.written}`,
      estimatedMinutes: 75,
      subjectCode,
      activityType: "practice",
      priority: 1,
      completionCriteria: "闭卷完成计算、证明或综合题；看过完整答案的题不计独立完成。",
    },
    {
      suffix: "coding",
      title: `机试学习与编码 · ${plan.machine}`,
      estimatedMinutes: 120,
      subjectCode: "ALG",
      activityType: "practice",
      priority: 1,
      completionCriteria: `先做最小诊断，再独立编码；记录复杂度、AC/未通过和主要错误。${plan.acceptance}`,
    },
    {
      suffix: "recall",
      title: `回忆与错题 · ${plan.week}`,
      estimatedMinutes: 30,
      activityType: "recall",
      priority: 2,
      completionCriteria: "默写公式或代码模板，记录一个可复现错误，并安排 D+1、D+3 或 D+7 重做。",
    },
  ];
  if (plan.researchBlock) {
    tasks.push({
      suffix: "research",
      title: `科研/AI/面试准备 · ${plan.week}`,
      estimatedMinutes: 60,
      activityType: "study",
      priority: 3,
      completionCriteria: "若招生办确认包含该环节，完成一个 AI 应用功能、项目表达练习或研究兴趣梳理。",
    });
  }
  return tasks;
}

function importedAssetId(db: Database.Database, scope: WorkspaceScope, fileName: string, folderPath: string): number | null {
  const row = db.prepare(`
    SELECT id FROM assets
    WHERE workspace_id = ? AND original_name = ? AND folder_path = ? AND note LIKE ?
    ORDER BY id DESC LIMIT 1
  `).get(scope.workspaceId, fileName, folderPath, `${ZHONGGUANCUN_IMPORT_MARKER}%`) as { id: number } | undefined;
  return row?.id ?? null;
}

function ensureSubject(db: Database.Database, scope: WorkspaceScope, code: string): boolean {
  const meta = SUBJECT_META[code];
  if (!meta) throw new Error(`未定义的导入科目：${code}`);
  const exists = db.prepare("SELECT 1 FROM subjects WHERE workspace_id = ? AND code = ?").get(scope.workspaceId, code);
  if (exists) return false;
  createSubject(db, scope, meta);
  return true;
}

function removeLegacyAggregateTasks(db: Database.Database, scope: WorkspaceScope): number {
  const rows = db.prepare(`
    SELECT id, day, done FROM day_tasks
    WHERE workspace_id = ?
      AND source_type = ?
      AND source_id LIKE 'daily:%'
      AND source_id NOT LIKE 'daily:%:%'
  `).all(scope.workspaceId, ZHONGGUANCUN_IMPORT_SOURCE) as Array<{ id: number; day: string; done: number }>;
  const completed = rows.filter((row) => row.done === 1);
  if (completed.length) {
    throw new Error(`发现 ${completed.length} 条已完成的旧合并任务，已停止重建以避免丢失完成证据：${completed.map((row) => row.day).join(", ")}`);
  }
  for (const row of rows) deleteTask(db, scope, row.id);
  return rows.length;
}

function ensureChapter(db: Database.Database, scope: WorkspaceScope, subjectCode: string, title: string): { id: string; created: boolean } {
  const existing = db.prepare(`
    SELECT id FROM subject_chapters WHERE workspace_id = ? AND subject_code = ? AND title = ? AND parent_id IS NULL
  `).get(scope.workspaceId, subjectCode, title) as { id: string } | undefined;
  if (existing) return { id: existing.id, created: false };
  return { id: createChapter(db, scope, { subjectCode, title }).id, created: true };
}

function ensurePoint(
  db: Database.Database,
  scope: WorkspaceScope,
  chapterId: string,
  title: string,
  tier: TierKey,
  answer?: string,
): { id: string; created: boolean } {
  const existing = db.prepare(`
    SELECT id FROM knowledge_points
    WHERE workspace_id = ? AND chapter_id = ? AND parent_point_id IS NULL AND title = ?
  `).get(scope.workspaceId, chapterId, title) as { id: string } | undefined;
  const point = existing
    ? { id: existing.id, created: false }
    : { id: createPoint(db, scope, { chapterId, title, tier: tier === "A" ? "r" : tier === "B" ? "y" : "g", exam: tier !== "C" }).id, created: true };
  updatePoint(db, scope, {
    id: point.id,
    tier: tier === "A" ? "r" : tier === "B" ? "y" : "g",
    exam: tier !== "C",
    answer,
  });
  return point;
}

async function ensureSourceAsset(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { fileName: string; content: string; folderPath: string; note: string; day: string },
): Promise<{ id: number; created: boolean }> {
  const existing = importedAssetId(db, scope, input.fileName, input.folderPath);
  if (existing) return { id: existing, created: false };
  const file = new File([input.content], input.fileName, { type: "text/markdown" });
  const created = await createAssetFromUpload(db, scope, {
    file,
    day: input.day,
    folderPath: input.folderPath,
    category: "knowledge",
    note: `${ZHONGGUANCUN_IMPORT_MARKER} ${input.note}`,
    uploadRoot: getUploadRoot(),
  });
  return { id: created.id, created: true };
}

export async function importZhongguancun(input: {
  db: Database.Database;
  scope: WorkspaceScope;
  planMarkdown: string;
  resourcesMarkdown: string;
  planFileName: string;
  resourcesFileName: string;
  importDay: string;
  dryRun?: boolean;
}): Promise<ZhongguancunImportSummary> {
  const plan = parseZhongguancunPlan(input.planMarkdown);
  const resources = parseZhongguancunResources(input.resourcesMarkdown);
  const summary: ZhongguancunImportSummary = {
    dryRun: Boolean(input.dryRun),
    subjects: 0,
    chapters: 0,
    points: 0,
    resourceEntries: resources.entries.length,
    dailyEntries: 0,
    removedTasks: 0,
    tasks: 0,
    skippedTasks: 0,
    assets: 0,
  };

  if (input.dryRun) {
    summary.subjects = plan.written.length + 1;
    summary.chapters = plan.written.reduce((count, subject) => count + subject.groups.length, 0) + plan.machine.length + 1;
    summary.points = plan.written.reduce((count, subject) => count + subject.groups.reduce((inner, group) => inner + group.topics.length, 0), 0)
      + plan.machine.reduce((count, group) => count + group.topics.length, 0)
      + resources.entries.length;
    summary.dailyEntries = dateDiff("2026-08-01", "2026-09-17") + 1;
    summary.tasks = Array.from({ length: dateDiff("2026-08-01", "2026-09-17") + 1 }, (_, index) => addDays("2026-08-01", index))
      .reduce((count, date) => count + plannedTasks(date).length, 0);
    summary.removedTasks = (input.db.prepare(`
      SELECT COUNT(*) AS count FROM day_tasks
      WHERE workspace_id = ? AND source_type = ?
        AND source_id LIKE 'daily:%' AND source_id NOT LIKE 'daily:%:%'
    `).get(input.scope.workspaceId, ZHONGGUANCUN_IMPORT_SOURCE) as { count: number }).count;
    summary.assets = 2;
    return summary;
  }

  summary.removedTasks = removeLegacyAggregateTasks(input.db, input.scope);

  for (const code of [...new Set([...plan.written.map((subject) => PLAN_SUBJECT_MAP[subject.sourceCode]), "ALG"])]) {
    if (ensureSubject(input.db, input.scope, code)) summary.subjects += 1;
  }

  for (const subject of plan.written) {
    const subjectCode = PLAN_SUBJECT_MAP[subject.sourceCode];
    for (const group of subject.groups) {
      const chapter = ensureChapter(input.db, input.scope, subjectCode, `冲刺计划 · ${group.tier} ${group.tier === "A" ? "核心层" : group.tier === "B" ? "强化层" : "扩展层"}`);
      if (chapter.created) summary.chapters += 1;
      for (const topic of group.topics) {
        const point = ensurePoint(input.db, input.scope, chapter.id, topic, group.tier);
        if (point.created) summary.points += 1;
      }
    }
  }

  for (const group of plan.machine) {
    const chapter = ensureChapter(input.db, input.scope, "ALG", `冲刺计划 · ${group.tier} ${group.tier === "A" ? "核心层" : group.tier === "B" ? "强化层" : "扩展层"}`);
    if (chapter.created) summary.chapters += 1;
    for (const topic of group.topics) {
      const point = ensurePoint(input.db, input.scope, chapter.id, topic, group.tier);
      if (point.created) summary.points += 1;
    }
  }

  const resourceChapter = ensureChapter(input.db, input.scope, "ALG", "资源入口 · 唯一入口");
  if (resourceChapter.created) summary.chapters += 1;
  for (const resource of resources.entries) {
    const point = ensurePoint(
      input.db,
      input.scope,
      resourceChapter.id,
      `专题入口：${resource.topic}`,
      "A",
      `默认首次入口：${resource.defaultEntry}\n卡住时的回退：${resource.fallback}\n学到即停的标准：${resource.stopStandard}`,
    );
    if (point.created) summary.points += 1;
  }

  const planAsset = await ensureSourceAsset(input.db, input.scope, {
    fileName: input.planFileName,
    content: input.planMarkdown,
    folderPath: "中关村学院/备考计划",
    day: input.importDay,
    note: "原始备考计划；考试信息以正式通知为准。",
  });
  const resourceAsset = await ensureSourceAsset(input.db, input.scope, {
    fileName: input.resourcesFileName,
    content: input.resourcesMarkdown,
    folderPath: "中关村学院/机试资源",
    day: input.importDay,
    note: "原始机试资源与专题入口；资源角色和链接均按原文保留。",
  });
  const linkedSubjects = [...new Set([...Object.values(PLAN_SUBJECT_MAP), "ALG"])];
  for (const code of linkedSubjects) linkAsset(input.db, input.scope, { assetId: planAsset.id, subjectCode: code });
  linkAsset(input.db, input.scope, { assetId: resourceAsset.id, subjectCode: "ALG" });
  summary.assets += Number(planAsset.created) + Number(resourceAsset.created);

  for (let date = "2026-08-01"; date <= "2026-09-17"; date = addDays(date, 1)) {
    const current = input.db.prepare(`
      SELECT plan FROM daily_entries WHERE workspace_id = ? AND date = ?
    `).get(input.scope.workspaceId, date) as { plan: string } | undefined;
    const importedPlan = buildDailyText(date);
    const isImportedPlan = current?.plan?.includes(ZHONGGUANCUN_IMPORT_MARKER) ?? false;
    const isGeneratedPlan = isImportedPlan && current?.plan?.trim().startsWith(ZHONGGUANCUN_IMPORT_MARKER) && !current.plan.includes("\n---\n");
    if (!isImportedPlan || (isGeneratedPlan && !current?.plan?.includes(TASK_SPLIT_MARKER))) {
      const nextPlan = current?.plan?.trim() ? `${current.plan.trim()}\n\n---\n${importedPlan}` : importedPlan;
      updateDayEntry(input.db, input.scope, date, { plan: isGeneratedPlan ? importedPlan : nextPlan });
      summary.dailyEntries += 1;
    }

    for (const task of plannedTasks(date)) {
      const sourceId = `daily:${date}:${task.suffix}`;
      const existingTask = input.db.prepare(`
        SELECT id FROM day_tasks WHERE workspace_id = ? AND source_type = ? AND source_id = ? LIMIT 1
      `).get(input.scope.workspaceId, ZHONGGUANCUN_IMPORT_SOURCE, sourceId);
      if (existingTask) {
        summary.skippedTasks += 1;
        continue;
      }
      addTask(input.db, input.scope, {
        day: date,
        title: task.title.slice(0, 120),
        subjectCode: task.subjectCode,
        priority: task.priority,
        estimatedMinutes: task.estimatedMinutes,
        activityType: task.activityType,
        notes: `${ZHONGGUANCUN_IMPORT_MARKER} ${TASK_SPLIT_MARKER} 完成后记录独立 AC、错题原因或模拟失分。`,
        completionCriteria: task.completionCriteria,
        sourceType: ZHONGGUANCUN_IMPORT_SOURCE,
        sourceId,
        verificationMethod: "当日验收记录、独立 AC 或限时模拟结果",
      });
      summary.tasks += 1;
    }
  }

  const maintenance = input.db.prepare(`
    SELECT plan FROM daily_entries WHERE workspace_id = ? AND date = '2026-09-18'
  `).get(input.scope.workspaceId) as { plan: string } | undefined;
  if (!maintenance?.plan?.includes(TASK_SPLIT_MARKER)) {
    updateDayEntry(input.db, input.scope, "2026-09-18", {
      plan: `${ZHONGGUANCUN_IMPORT_MARKER}\n${TASK_SPLIT_MARKER}\n来源：中关村学院冲刺备考计划 · 维护期\n工作日每天 45–60min：错题回炉、模板复写或一个薄弱专题；周末轮换模拟、订正与面试/AI 原型。\n规则：不新增课程，依据能力数据调整一个薄弱点。`,
    });
  }
  return summary;
}
