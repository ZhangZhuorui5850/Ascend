import type { DragEvent } from "react";

/** 全局唯一的拖拽负载：知识点或章节，由 SubjectWorkbench 顶层 state 持有。两者都携带整棵子树信息（防拖进自身、预判限深）。 */
export type DragPayload =
  | {
      kind: "point";
      id: string;
      chapterId: string | null;
      parentPointId: string | null;
      title: string;
      subtreeIds: string[];
      height: number;
    }
  | { kind: "chapter"; id: string; title: string; subtreeIds: string[]; height: number };

export type ChapterDrag = Extract<DragPayload, { kind: "chapter" }>;
export type PointDrag = Extract<DragPayload, { kind: "point" }>;

/** 三态命中判定需要的最小拖拽信息（章节树/知识点树通用） */
export type TreeDrag = { id: string; subtreeIds: string[]; height: number };

export type DropEdge = "before" | "after" | "inside";

/** 光标纵向占比 → 插入位置。half：中线分前后；nest：上 1/4 前、下 1/4 后、中间 inside */
export function edgeForOffset(offsetY: number, height: number, zones: "half" | "nest"): DropEdge {
  if (height <= 0) return "after";
  const ratio = Math.min(Math.max(offsetY / height, 0), 1);
  if (zones === "half") return ratio < 0.5 ? "before" : "after";
  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return "inside";
}

export function edgeFromEvent(event: DragEvent<HTMLElement>, zones: "half" | "nest"): DropEdge {
  const rect = event.currentTarget.getBoundingClientRect();
  return edgeForOffset(event.clientY - rect.top, rect.height, zones);
}

/**
 * 树节点拖到同类节点上的三态命中判定，章节树/知识点树、列表/导图视图通用。
 * null = 非法目标（拖到自己/自己的子树，或任何放法都会超出层级上限）。
 */
export function treeDropEdgeForOffset(
  offsetY: number,
  height: number,
  dragged: TreeDrag,
  target: { id: string; depth: number },
  maxDepth: number,
): DropEdge | null {
  if (dragged.id === target.id || dragged.subtreeIds.includes(target.id)) return null;
  const fitsInside = target.depth + dragged.height <= maxDepth;
  const fitsBeside = target.depth - 1 + dragged.height <= maxDepth;
  let edge: DropEdge | null = edgeForOffset(offsetY, height, fitsInside ? "nest" : "half");
  if (edge !== "inside" && !fitsBeside) edge = fitsInside ? "inside" : null;
  return edge;
}

export function treeDropEdgeFromEvent(
  event: DragEvent<HTMLElement>,
  dragged: TreeDrag,
  target: { id: string; depth: number },
  maxDepth: number,
): DropEdge | null {
  const rect = event.currentTarget.getBoundingClientRect();
  return treeDropEdgeForOffset(event.clientY - rect.top, rect.height, dragged, target, maxDepth);
}

/** dragstart 时生成 Notion 风格拖拽卡片：挂到 body 屏幕外，setDragImage 截图后下一帧移除 */
export function attachDragCard(event: DragEvent<HTMLElement>, title: string, meta?: string) {
  const card = document.createElement("div");
  card.className = "dragCard";
  const label = document.createElement("span");
  label.textContent = title;
  card.appendChild(label);
  if (meta) {
    const metaEl = document.createElement("small");
    metaEl.textContent = meta;
    card.appendChild(metaEl);
  }
  document.body.appendChild(card);
  event.dataTransfer.setDragImage(card, 12, 14);
  window.setTimeout(() => card.remove(), 0);
}
