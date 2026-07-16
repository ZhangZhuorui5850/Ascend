/** 导图视图的纯几何工具：连接线路径与缩放档位 */

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 1.6;
export const ZOOM_STEP = 0.1;

export function clampZoom(value: number): number {
  const stepped = Math.round(value / ZOOM_STEP) * ZOOM_STEP;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(stepped.toFixed(2))));
}

/** 父卡片右侧中点 → 子卡片左侧中点的三次贝塞尔，控制点取水平中线 */
export function linkPath(x1: number, y1: number, x2: number, y2: number): string {
  const mid = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}
