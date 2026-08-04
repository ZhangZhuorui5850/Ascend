export type Mission = {
  id: string;
  index: string;
  title: string;
  subject: string;
  duration: number;
  energy: "deep" | "steady" | "light";
  progress: number;
  completed: boolean;
};

export type OrbitNode = {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  size: number;
  tone: "violet" | "orange" | "mint" | "blue";
};

export const initialMissions: Mission[] = [
  { id: "mission-1", index: "01", title: "重建动态规划状态转移", subject: "算法 · 核心训练", duration: 45, energy: "deep", progress: 68, completed: false },
  { id: "mission-2", index: "02", title: "无提示重做：最长上升子序列", subject: "错题回炉", duration: 30, energy: "steady", progress: 24, completed: false },
  { id: "mission-3", index: "03", title: "整理概率论条件分布笔记", subject: "数学 · 知识沉淀", duration: 25, energy: "light", progress: 0, completed: false },
  { id: "mission-4", index: "04", title: "复习 12 张间隔卡片", subject: "记忆巩固", duration: 18, energy: "light", progress: 100, completed: true },
];

export const orbitNodes: OrbitNode[] = [
  { id: "algorithms", label: "算法", detail: "72% 掌握", x: 50, y: 12, size: 74, tone: "violet" },
  { id: "math", label: "数学", detail: "9 个待复习", x: 84, y: 38, size: 62, tone: "orange" },
  { id: "systems", label: "系统", detail: "连续 4 天", x: 73, y: 78, size: 68, tone: "mint" },
  { id: "english", label: "英语", detail: "轻量维护", x: 20, y: 74, size: 56, tone: "blue" },
  { id: "review", label: "回炉", detail: "3 个薄弱点", x: 15, y: 31, size: 64, tone: "orange" },
];

export const rhythm = [32, 51, 44, 76, 58, 91, 68, 84, 63, 96, 72, 88];

export const reviewSignals = [
  { label: "状态定义", subject: "动态规划", urgency: "今天", strength: 34 },
  { label: "边界条件", subject: "概率论", urgency: "明天", strength: 56 },
  { label: "复杂度推导", subject: "算法分析", urgency: "3 天后", strength: 78 },
];
