import type { CalendarEvent, PlannerTask, TaskList } from "@/lib/planner/types";
import type { DayData } from "@/lib/repo/days";
import type { HomeSnapshot, LearningAnalytics, WeeklyCapacity } from "@/lib/repo/stats";

const now = "2026-08-01T08:00:00.000Z";
const task = (input: Partial<PlannerTask> & Pick<PlannerTask, "id" | "title">): PlannerTask => {
  const { id, title, ...overrides } = input;
  return {
    id,
    workspace_id: "mock-workspace",
    list_id: "list-today",
    parent_task_id: null,
    depth: 0,
    title,
    notes: "",
    subject_code: null,
    status: "open",
    priority: 2,
    due_date: "2026-08-01",
    due_at: null,
    due_timezone: "Asia/Shanghai",
    scheduled_start_at: null,
    scheduled_end_at: null,
    scheduled_timezone: "Asia/Shanghai",
    scheduled_all_day: 0,
    estimated_minutes: 45,
    series_id: null,
    occurrence_key: null,
    sort_order: 0,
    deleted_at: null,
    completed_at: null,
    canceled_at: null,
    version: 1,
    legacy_day_task_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
};
const event = (input: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "title">): CalendarEvent => {
  const { id, title, ...overrides } = input;
  return {
    id,
    workspace_id: "mock-workspace",
    calendar_id: "calendar-study",
    title,
    description: "",
    location: "",
    url: "",
    subject_code: null,
    kind: "focus",
    busy_status: "busy",
    start_at: null,
    end_at: null,
    timezone: "Asia/Shanghai",
    start_date: null,
    end_date_exclusive: null,
    all_day: 0,
    recurrence_rule: null,
    recurrence_until: null,
    recurring_event_id: null,
    original_start_at: null,
    exception_kind: null,
    migration_key: null,
    deleted_at: null,
    version: 1,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
};

export const lists = [
  {
    id: "list-today",
    workspace_id: "mock-workspace",
    name: "今日推进",
    color_token: "amber",
    icon: "target",
    sort_order: 0,
    is_inbox: 1,
    archived_at: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "list-retest",
    workspace_id: "mock-workspace",
    name: "复测队列",
    color_token: "cyan",
    icon: "repeat",
    sort_order: 1,
    is_inbox: 0,
    archived_at: null,
    created_at: now,
    updated_at: now,
  },
] satisfies TaskList[];

export const tasks = [
  task({
    id: "task-proof",
    title: "闭卷复述：TCP 拥塞控制",
    subject_code: "CS408",
    priority: 1,
    estimated_minutes: 35,
    scheduled_start_at: "2026-08-01T01:00:00.000Z",
    scheduled_end_at: "2026-08-01T01:35:00.000Z",
  }),
  task({
    id: "task-tree",
    title: "二叉树变式题 3 道",
    subject_code: "ALGO",
    estimated_minutes: 55,
    scheduled_start_at: "2026-08-01T02:00:00.000Z",
    scheduled_end_at: "2026-08-01T02:55:00.000Z",
  }),
  task({
    id: "task-review",
    title: "重做错题：页式存储地址转换",
    subject_code: "OS",
    priority: 1,
    estimated_minutes: 25,
    list_id: "list-retest",
  }),
  task({ id: "task-notes", title: "整理本周模考失分归因", subject_code: "MATH", priority: 3, estimated_minutes: 30 }),
] satisfies PlannerTask[];

export const events = [
  event({
    id: "event-class",
    title: "计算机网络专题课",
    subject_code: "CS408",
    kind: "class",
    start_at: "2026-08-01T05:00:00.000Z",
    end_at: "2026-08-01T06:30:00.000Z",
  }),
  event({
    id: "event-mock",
    title: "周模考",
    subject_code: "MATH",
    kind: "exam",
    start_at: "2026-08-02T01:00:00.000Z",
    end_at: "2026-08-02T03:30:00.000Z",
  }),
  event({
    id: "event-deadline",
    title: "报名材料截止",
    kind: "milestone",
    all_day: 1,
    start_date: "2026-08-05",
    end_date_exclusive: "2026-08-06",
    timezone: null,
  }),
] satisfies CalendarEvent[];

export const home = {
  today: { assets: 3, studyMinutes: 92, reviews: 6, mistakes: 2, mockExams: 0 },
  dueReviews: 8,
  dueMistakes: 3,
  openTasks: 4,
  doneTasks: 2,
  streak: 12,
} satisfies HomeSnapshot;
export const capacity = {
  start: "2026-07-27",
  end: "2026-08-02",
  targetMinutes: 900,
  studiedMinutes: 420,
  plannedMinutes: 315,
  overdueOpenMinutes: 45,
  remainingToTarget: 480,
  unallocatedMinutes: 165,
  overloadMinutes: 0,
  completionPercent: 47,
  days: [
    { day: "2026-07-27", studiedMinutes: 65, plannedMinutes: 0, suggestedMinutes: 0 },
    { day: "2026-07-28", studiedMinutes: 80, plannedMinutes: 0, suggestedMinutes: 0 },
    { day: "2026-07-29", studiedMinutes: 42, plannedMinutes: 0, suggestedMinutes: 0 },
    { day: "2026-07-30", studiedMinutes: 96, plannedMinutes: 0, suggestedMinutes: 0 },
    { day: "2026-07-31", studiedMinutes: 45, plannedMinutes: 0, suggestedMinutes: 0 },
    { day: "2026-08-01", studiedMinutes: 92, plannedMinutes: 180, suggestedMinutes: 60 },
    { day: "2026-08-02", studiedMinutes: 0, plannedMinutes: 135, suggestedMinutes: 105 },
  ],
} satisfies WeeklyCapacity;
export const analytics = {
  dailyMinutes: capacity.days.map(({ day, studiedMinutes }) => ({ day, minutes: studiedMinutes })),
  scoreDist: [1, 2, 5, 4] as [number, number, number, number],
  weakPoints: [
    {
      id: "weak-1",
      subjectCode: "CS408",
      title: "TCP 拥塞窗口",
      tierName: "易错",
      mastery: 38,
      nextReview: "2026-08-01",
      openMistakes: 2,
      recentFailures: 2,
      priorityScore: 136,
      reasons: ["连续两次回忆失败", "存在未毕业错题"],
    },
    {
      id: "weak-2",
      subjectCode: "MATH",
      title: "多元函数极值",
      tierName: "不稳",
      mastery: 52,
      nextReview: "2026-08-01",
      openMistakes: 1,
      recentFailures: 1,
      priorityScore: 98,
      reasons: ["信心高于结果"],
    },
  ],
} satisfies Pick<LearningAnalytics, "dailyMinutes" | "scoreDist" | "weakPoints">;

export const dayData = {
  entry: {
    date: "2026-08-01",
    plan: "先清到期回忆，再进入算法题。",
    diary: "",
    summary: "昨天切换任务过多，今天只保留两次上下文切换。",
    blockers: "午后注意力容易下滑",
    tomorrow: "完成二叉树专题小测",
    updated_at: now,
  },
  tasks,
  notes: [{ id: 1, day: "2026-08-01", content: "把拥塞控制四阶段画成一张图。", created_at: now }],
  dueReviews: [
    {
      id: "review-1",
      title: "TCP 快重传与快恢复",
      subject_code: "CS408",
      tier_name: "易错",
      status: "学习中",
      mastery: 38,
      next_review: "2026-08-01",
      prompt: "三次重复 ACK 后窗口如何变化？",
      answer: "ssthresh 减半，拥塞窗口进入快恢复。",
    },
  ],
  dueReviewsTotal: 8,
  dueMistakes: [
    {
      id: 7,
      title: "页式存储地址转换",
      cause: "页号与页内偏移位数混淆",
      knowledge_point_id: "kp-os-page",
      knowledge_title: "虚拟内存",
      next_review: "2026-08-01",
    },
  ],
  dueMistakesTotal: 3,
  assets: [
    {
      id: 9,
      original_name: "网络层错题整理.pdf",
      mime_type: "application/pdf",
      size: 842000,
      folder_path: "/CS408/网络",
    },
  ],
  sessions: [
    {
      id: 4,
      title: "晨间闭卷回忆",
      subject_code: "CS408",
      duration_minutes: 42,
      output: "能完整写出慢启动和拥塞避免。",
    },
  ],
  reviews: [
    {
      id: 12,
      knowledge_title: "B+ 树",
      subject_code: "CS408",
      score: 2,
      note: "分裂规则仍需确认",
      event_type: "point_review",
      attempt_mode: "paper",
      pre_confidence: 3,
    },
  ],
  mistakes: [{ id: 7, title: "页式存储地址转换", cause: "位数混淆", next_review: "2026-08-01", graduated: 0 }],
} satisfies Omit<DayData, "tasks"> & { tasks: PlannerTask[] };
