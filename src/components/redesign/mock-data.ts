/**
 * 重设计预览（/redesign）的内联 mock 数据。
 * 刻意不接后端：形状对齐 docs/feature-inventory.md 附录的实体契约，
 * 决定切换时替换为 repo / Server Action 数据源即可。
 */

export type TrailTask = {
  id: string;
  title: string;
  subjectCode?: string;
  priority: 1 | 2 | 3;
  estimatedMinutes: number;
  scheduledStart?: string;
  done: boolean;
  notes?: string;
};

export type TrailReview = {
  id: string;
  title: string;
  tier: "r" | "y" | "g";
  tierName: string;
  subjectCode: string;
  overdueDays: number;
};

export const homeNow = {
  state: "due" as const,
  dueReviews: 12,
  dueMistakes: 3,
  scheduledToday: 14,
  remainingCapacity: 14,
  dailyLimit: 20,
  yesterdayPlan: "明早先把积分应用错题清掉，再推进一轮级数。",
  nearestExam: { name: "数学分析期末", days: 11 },
};

export const homeNextTasks: TrailTask[] = [
  { id: "t1", title: "积分应用 · 错题回炉 5 题", subjectCode: "MATH", priority: 1, estimatedMinutes: 40, scheduledStart: "09:00", done: false },
  { id: "t2", title: "级数判敛 · 默写判别法谱系", subjectCode: "MATH", priority: 1, estimatedMinutes: 25, scheduledStart: "10:30", done: false },
  { id: "t3", title: "英语阅读 2023 Text 3 精读", subjectCode: "ENG", priority: 2, estimatedMinutes: 35, done: false },
  { id: "t4", title: "政治马原 · 矛盾论框架复述", subjectCode: "POL", priority: 3, estimatedMinutes: 20, done: false },
];

export const homeRidge = {
  weekStart: "07-27",
  weekEnd: "08-02",
  targetMinutes: 900,
  studiedMinutes: 385,
  plannedMinutes: 330,
  days: [
    { day: "周一", minutes: 95 },
    { day: "周二", minutes: 70 },
    { day: "周三", minutes: 0 },
    { day: "周四", minutes: 110 },
    { day: "周五", minutes: 60 },
    { day: "周六", minutes: 50 },
    { day: "周日", minutes: 0 },
  ],
};

export const homePeaks = [
  { code: "MATH", name: "数学分析", mastered: 86, total: 142, due: 9, mistakes: 3 },
  { code: "ENG", name: "英语一", mastered: 41, total: 98, due: 3, mistakes: 0 },
  { code: "POL", name: "政治", mastered: 12, total: 76, due: 0, mistakes: 1 },
  { code: "CS", name: "数据结构", mastered: 55, total: 88, due: 2, mistakes: 2 },
];

export const homeWeakPoints = [
  { id: "w1", title: "含参变量积分的收敛判别", subjectCode: "MATH", tierName: "重点", reason: "近期回忆失败" },
  { id: "w2", title: "级数重排与黎曼定理", subjectCode: "MATH", tierName: "核心", reason: "仍有开放错题" },
  { id: "w3", title: "长难句嵌套结构切分", subjectCode: "ENG", tierName: "重点", reason: "系统建议巩固" },
];

export const dayAgenda: Array<
  | { kind: "task"; task: TrailTask }
  | { kind: "review"; review: TrailReview }
> = [
  { kind: "task", task: homeNextTasks[0] },
  { kind: "review", review: { id: "r1", title: "含参变量积分的收敛判别", tier: "r", tierName: "核心", subjectCode: "MATH", overdueDays: 2 } },
  { kind: "review", review: { id: "r2", title: "泰勒展开余项估计", tier: "y", tierName: "重点", subjectCode: "MATH", overdueDays: 0 } },
  { kind: "task", task: homeNextTasks[1] },
  { kind: "review", review: { id: "r3", title: "定语从句与同位语从句辨析", tier: "g", tierName: "一般", subjectCode: "ENG", overdueDays: 1 } },
  { kind: "task", task: homeNextTasks[2] },
  { kind: "task", task: homeNextTasks[3] },
];

export const dayStats = {
  doneTasks: 1,
  totalTasks: 4,
  studyMinutes: 75,
  reviewsDone: 4,
  queueLeft: 11,
};

export const tasksLists = [
  { id: "inbox", name: "收集箱", count: 3 },
  { id: "math", name: "数学分析", count: 5 },
  { id: "eng", name: "英语", count: 2 },
  { id: "life", name: "生活", count: 1 },
];

export const tasksWorkspace: TrailTask[] = [
  { id: "p1", title: "积分应用 · 错题回炉 5 题", subjectCode: "MATH", priority: 1, estimatedMinutes: 40, scheduledStart: "09:00", done: false, notes: "从错题本第 3、7、11、14、19 题开始，先遮答案重做。" },
  { id: "p2", title: "级数判敛 · 默写判别法谱系", subjectCode: "MATH", priority: 1, estimatedMinutes: 25, scheduledStart: "10:30", done: false },
  { id: "p3", title: "英语阅读 2023 Text 3 精读", subjectCode: "ENG", priority: 2, estimatedMinutes: 35, done: false },
  { id: "p4", title: "整理上周模考分项表", priority: 2, estimatedMinutes: 15, done: false },
  { id: "p5", title: "政治马原 · 矛盾论框架复述", subjectCode: "POL", priority: 3, estimatedMinutes: 20, done: true },
  { id: "p6", title: "给平板贴类纸膜", priority: 3, estimatedMinutes: 10, done: false },
];
