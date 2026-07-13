import type { PointStatus } from "../types";

export type { PointStatus };

export function clampMastery(value: number): number {
  if (!Number.isFinite(value)) throw new Error("掌握度必须是数字");
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** 复习打分与手动编辑共用的状态派生；错题回炉（applyMistakeOutcome）故意不走这里。 */
export function deriveStatus(mastery: number): PointStatus {
  return mastery >= 80 ? "已掌握" : mastery > 0 ? "学习中" : "未学";
}
