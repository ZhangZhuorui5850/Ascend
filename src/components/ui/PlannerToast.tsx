"use client";

import { Toast } from "@base-ui/react/toast";
import { AlertTriangle, CheckCircle2, Info, RotateCcw, X, XCircle } from "lucide-react";
import styles from "@/styles/planner/primitives.module.css";

export type PlannerToastKind = "success" | "error" | "info" | "conflict";
export type PlannerToastData = {
  kind: PlannerToastKind;
  undo?: () => void;
  actionLabel?: string;
};

export function PlannerToastViewport() {
  const manager = Toast.useToastManager<PlannerToastData>();

  return (
    <Toast.Portal>
      <Toast.Viewport className={styles.toastViewport}>
        {manager.toasts.map((toast) => {
          const kind = toast.data?.kind ?? "info";
          const Icon = kind === "success"
            ? CheckCircle2
            : kind === "error"
              ? XCircle
              : kind === "conflict"
                ? AlertTriangle
                : Info;
          return (
            <Toast.Root
              className={styles.toast}
              data-kind={kind}
              key={toast.id}
              swipeDirection={["right", "down"]}
              toast={toast}
            >
              <Toast.Content className={styles.toastContent}>
                <Icon aria-hidden size={18} />
                <div>
                  {toast.title ? <Toast.Title className={styles.toastTitle} /> : null}
                  <Toast.Description className={styles.toastDescription} />
                </div>
                {toast.data?.undo ? (
                  <Toast.Action
                    className={styles.toastAction}
                    onClick={() => {
                      toast.data?.undo?.();
                      manager.close(toast.id);
                    }}
                  >
                    <RotateCcw aria-hidden size={14} />
                    {toast.data.actionLabel ?? "撤销"}
                  </Toast.Action>
                ) : null}
                <Toast.Close aria-label="关闭提示" className={styles.iconButton}>
                  <X size={15} />
                </Toast.Close>
              </Toast.Content>
            </Toast.Root>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
