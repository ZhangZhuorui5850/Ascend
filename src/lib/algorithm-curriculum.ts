export type AlgorithmCurriculumChapter = {
  key: string;
  order: number;
  title: string;
  weekLabel: string;
  description: string;
};

export type AlgorithmCurriculumProblem = {
  externalProblemId: string;
  sourceUrl: string;
  tags: string[];
  phaseKey: string;
};

export const ALGORITHM_CURRICULUM_TITLE = "中关村学院机试学习路线";
export const ALGORITHM_CURRICULUM_COURSE_KEY = "zgca-exam-learning-route";

export const ALGORITHM_CURRICULUM: AlgorithmCurriculumChapter[] = [
  chapter("cpp-stl", 1, "基础语法与 STL", "W1", "输入输出、数值边界、字符串、常用容器与排序"),
  chapter("simulation-enumeration", 2, "模拟与枚举", "W2", "流程实现、枚举空间、状态表示与基础数学"),
  chapter("sequence-search", 3, "前缀和、双指针与二分", "W2", "序列预处理、单调性、边界和二分答案"),
  chapter("recursion-divide", 4, "递归与分治", "W3", "递归定义、终止条件、子问题拆分与合并"),
  chapter("graph-search", 5, "DFS、BFS 与回溯", "W3", "状态、选择、撤销、访问标记与最短步数"),
  chapter("dynamic-programming", 6, "动态规划与背包", "W4–W5", "状态、转移、初始化、遍历顺序与常见背包模型"),
  chapter("greedy", 7, "贪心", "W4", "排序贪心、区间策略与正确性理由"),
  chapter("graph-shortest-path", 8, "图论与最短路", "W5", "图的存储、Dijkstra、松弛与负环识别"),
  chapter("exam-practice", 9, "历年机试综合", "W6–W7", "限时训练、部分分策略、订正与迁移练习"),
];

const CHAPTERS_BY_KEY = new Map(ALGORITHM_CURRICULUM.map((item) => [item.key, item]));

export function getAlgorithmCurriculumChapter(problem: AlgorithmCurriculumProblem): AlgorithmCurriculumChapter {
  const tags = problem.tags.map(normalizeSignal);
  const phase = problem.phaseKey.toLocaleUpperCase("zh-CN");
  const has = (...signals: string[]) =>
    signals.some((signal) => tags.some((tag) => tag.includes(normalizeSignal(signal))));

  if (has("图论", "Dijkstra", "最短路", "负环", "最大环均值", "混合有向边")) {
    return requireChapter("graph-shortest-path");
  }
  if (has("动态规划", "背包", "LIS", "LCS", "记忆化搜索", "分数规划", "组合优化", "匹配")) {
    return requireChapter("dynamic-programming");
  }
  if (has("DFS", "BFS", "回溯", "状态搜索", "连通块", "路径还原", "最短步数", "搜索剪枝", "迷宫")) {
    return requireChapter("graph-search");
  }
  if ((phase === "W4" || phase === "W5") && has("贪心", "区间覆盖", "区间调度")) {
    return requireChapter("greedy");
  }
  if (has("前缀和", "差分", "双指针", "二分", "二分答案")) {
    return requireChapter("sequence-search");
  }
  if (has("递归", "分治", "快速选择", "归并排序", "表达式求值", "全排列", "因数分解", "整数划分", "递推")) {
    return requireChapter("recursion-divide");
  }
  if ((phase === "W1" || phase === "W2") && has("模拟", "枚举", "位运算", "状态翻转", "状态递推", "循环", "数学")) {
    return requireChapter("simulation-enumeration");
  }
  if (has("贪心", "区间覆盖", "区间调度")) return requireChapter("greedy");
  if (has("模拟", "枚举", "位运算", "状态翻转", "状态递推", "循环", "数学")) {
    return requireChapter("simulation-enumeration");
  }
  if (
    has(
      "字符串",
      "排序",
      "结构体",
      "map",
      "set",
      "queue",
      "stack",
      "priority_queue",
      "高精度",
      "浮点",
      "精度",
      "64位整数",
    )
  ) {
    return requireChapter("cpp-stl");
  }

  const phaseFallback: Record<string, string> = {
    W1: "cpp-stl",
    W2: "simulation-enumeration",
    W3: "recursion-divide",
    W4: "dynamic-programming",
    W5: "graph-shortest-path",
    EXTRA: "exam-practice",
  };
  return requireChapter(phaseFallback[phase] ?? "cpp-stl");
}

export function getAlgorithmCurriculumChapters(problem: AlgorithmCurriculumProblem): AlgorithmCurriculumChapter[] {
  const primary = getAlgorithmCurriculumChapter(problem);
  if (!isExamProblem(problem) || primary.key === "exam-practice") return [primary];
  return [primary, requireChapter("exam-practice")];
}

export function algorithmCurriculumStageKey(chapter: AlgorithmCurriculumChapter): string {
  return `${chapter.order}. ${chapter.title}`;
}

function chapter(
  key: string,
  order: number,
  title: string,
  weekLabel: string,
  description: string,
): AlgorithmCurriculumChapter {
  return { key, order, title, weekLabel, description };
}

function isExamProblem(problem: AlgorithmCurriculumProblem): boolean {
  return problem.externalProblemId.includes("/official/") || problem.sourceUrl.includes("/official/");
}

function normalizeSignal(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s_\-/]+/g, "");
}

function requireChapter(key: string): AlgorithmCurriculumChapter {
  const result = CHAPTERS_BY_KEY.get(key);
  if (!result) throw new Error(`算法课程章节 ${key} 缺少定义`);
  return result;
}
