export type ViewType = "table" | "calendar" | "timeline" | "board" | "gallery" | "list";
export type ViewSource = "assets" | "daily_entries" | "study_sessions" | "mistakes" | "knowledge_points" | "plan_items" | "subjects";
export type FilterOperator = "equals" | "not_equals" | "contains" | "not_empty";

export type ViewFilter = {
  field: string;
  operator: FilterOperator;
  value?: string;
};

export type SavedView = {
  slug: string;
  name: string;
  description: string;
  type: ViewType;
  source: ViewSource;
  dateField?: string;
  groupBy?: string;
  visibleFields: string[];
  filters: ViewFilter[];
};

export type DataRow = Record<string, unknown>;

export const DEFAULT_VIEWS: SavedView[] = [
  {
    slug: "today-inbox",
    name: "今日收件箱",
    description: "今天拖入、粘贴、记录的所有材料。",
    type: "list",
    source: "assets",
    dateField: "day",
    visibleFields: ["day", "original_name", "mime_type", "size"],
    filters: [],
  },
  {
    slug: "week-calendar",
    name: "本周日历",
    description: "一周内学习、资料、复习、错题和总结状态。",
    type: "calendar",
    source: "daily_entries",
    dateField: "date",
    visibleFields: ["date", "plan", "summary"],
    filters: [],
  },
  {
    slug: "ten-week-timeline",
    name: "十周阶段时间线",
    description: "按阶段看 W1-W10 的备考推进。",
    type: "timeline",
    source: "plan_items",
    dateField: "start_date",
    visibleFields: ["title", "start_date", "end_date", "status"],
    filters: [],
  },
  {
    slug: "all-assets",
    name: "全部资料",
    description: "所有复制入库的文件，适合筛选、排序和批量整理。",
    type: "table",
    source: "assets",
    dateField: "day",
    visibleFields: ["day", "original_name", "mime_type", "size", "created_at"],
    filters: [],
  },
  {
    slug: "triage-board",
    name: "待整理资料",
    description: "按整理状态管理资料，先把待整理清掉。",
    type: "board",
    source: "assets",
    groupBy: "status",
    visibleFields: ["original_name", "day", "mime_type", "status"],
    filters: [{ field: "status", operator: "equals", value: "待整理" }],
  },
  {
    slug: "image-gallery",
    name: "图片截图库",
    description: "截图、照片、白板图等图片资料。",
    type: "gallery",
    source: "assets",
    visibleFields: ["original_name", "day", "mime_type"],
    filters: [{ field: "mime_type", operator: "contains", value: "image" }],
  },
  {
    slug: "mistake-review-calendar",
    name: "错题复习队列",
    description: "按 next_review 看错题什么时候该回炉。",
    type: "calendar",
    source: "mistakes",
    dateField: "next_review",
    visibleFields: ["title", "cause", "next_review"],
    filters: [{ field: "graduated", operator: "equals", value: "0" }],
  },
  {
    slug: "subject-matrix",
    name: "M1-M7 科目矩阵",
    description: "按科目看知识点数量、资料沉淀和错题压力。",
    type: "table",
    source: "subjects",
    visibleFields: ["code", "name", "description"],
    filters: [],
  },
];

export function getDefaultViewBySlug(slug: string): SavedView | undefined {
  return DEFAULT_VIEWS.find((view) => view.slug === slug);
}

export function applyViewFilters<T extends DataRow>(rows: T[], filters: ViewFilter[]): T[] {
  return rows.filter((row) =>
    filters.every((filter) => {
      const value = String(row[filter.field] ?? "");
      const expected = String(filter.value ?? "");
      if (filter.operator === "equals") return value === expected;
      if (filter.operator === "not_equals") return value !== expected;
      if (filter.operator === "contains") return value.toLowerCase().includes(expected.toLowerCase());
      if (filter.operator === "not_empty") return value.trim().length > 0;
      return true;
    }),
  );
}
