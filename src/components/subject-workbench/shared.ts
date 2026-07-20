import type { DragPayload } from "@/components/dnd";
import type { Tier } from "@/lib/types";

/** action 统一结果的上报回调：成功刷新路由，失败 notify 错误 */
export type Report = (result: { ok: boolean; error?: string }) => void;

/** 移动知识点的目标：挂到章节直属层，或成为某个知识点的子点 */
export type PointMoveTarget = { chapterId?: string | null; parentPointId?: string | null };

export const TIER_OPTIONS: Array<{ value: Tier; label: string }> = [
  { value: "r", label: "精通" },
  { value: "y", label: "掌握" },
  { value: "g", label: "了解" },
];

/** 章节树共享的操作句柄：折叠、拖拽、聚焦，列表/导图两个视图共用 */
export type TreeControls = {
  collapsedMap: Record<string, boolean>;
  toggleCollapsed: (id: string, defaultCollapsed: boolean) => void;
  drag: DragPayload | null;
  setDrag: (payload: DragPayload | null) => void;
  nestChapter: (childId: string, parentId: string | null) => Promise<void>;
  moveChapterTo: (id: string, parentId: string | null, index: number) => Promise<void>;
  movePointTo: (pointId: string, target: PointMoveTarget, index: number) => Promise<void>;
  treeBusy: boolean;
  focusChapter: (id: string | null) => void;
  focusPointId: string | null;
};
