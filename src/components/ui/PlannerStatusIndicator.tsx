"use client";

import { AlertTriangle, CheckCircle2, LoaderCircle, RotateCcw, WifiOff } from "lucide-react";
import styles from "@/styles/planner/primitives.module.css";

export type PlannerMutationStatus =
  | "idle"
  | "optimistic"
  | "pending"
  | "saved"
  | "conflict"
  | "error"
  | "restored";

const LABELS: Record<PlannerMutationStatus, string> = {
  idle: "就绪",
  optimistic: "正在保存",
  pending: "正在保存",
  saved: "已保存",
  conflict: "发现版本冲突",
  error: "保存失败",
  restored: "已恢复原状态",
};

export function PlannerStatusIndicator({
  label,
  status,
}: {
  label?: string;
  status: PlannerMutationStatus;
}) {
  const assertive = status === "error" || status === "conflict";
  const Icon = status === "saved"
    ? CheckCircle2
    : status === "restored"
      ? RotateCcw
      : status === "error"
        ? WifiOff
        : status === "conflict"
          ? AlertTriangle
          : LoaderCircle;

  return (
    <span
      aria-live={assertive ? "assertive" : "polite"}
      className={styles.statusIndicator}
      data-status={status}
      role={assertive ? "alert" : "status"}
    >
      <Icon aria-hidden size={14} />
      {label ?? LABELS[status]}
    </span>
  );
}
