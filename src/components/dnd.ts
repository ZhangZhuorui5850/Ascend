import type { DragEvent } from "react";

/** 全局唯一的拖拽负载：知识点或章节，由 SubjectWorkbench 顶层 state 持有 */
export type DragPayload =
  | { kind: "point"; id: string; chapterId: string | null; title: string }
  | { kind: "chapter"; id: string; title: string; subtreeIds: string[]; height: number };

export type ChapterDrag = Extract<DragPayload, { kind: "chapter" }>;

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
