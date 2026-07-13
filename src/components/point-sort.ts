import type { PointRow } from "@/lib/repo/knowledge";

export type PointSortMode = "manual" | "time" | "importance";

export const POINT_SORT_MODES: Array<{ value: PointSortMode; label: string }> = [
  { value: "manual", label: "手动" },
  { value: "time", label: "时间" },
  { value: "importance", label: "重要性" },
];

const TIER_RANK: Record<string, number> = { r: 0, y: 1, g: 2 };

/** 展示层排序：manual 直接沿用服务端 sort_order 顺序；其余模式拷贝后稳定排序。 */
export function sortPointsForView(points: PointRow[], mode: PointSortMode): PointRow[] {
  if (mode === "manual") return points;
  const copy = [...points];
  if (mode === "time") {
    copy.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  } else {
    copy.sort((a, b) => (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9));
  }
  return copy;
}
