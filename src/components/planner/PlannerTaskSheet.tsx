"use client";

import { useRef, type RefObject } from "react";
import { PlannerTaskInspector } from "@/components/planner/PlannerTaskInspector";
import { PlannerDrawer } from "@/components/ui/PlannerDrawer";
import type { PlannerMutationStatus } from "@/components/ui/PlannerStatusIndicator";
import type {
  PlannerLabel,
  PlannerReminder,
  PlannerTask,
  TaskList,
} from "@/lib/planner/types";
import type { PlannerTaskView } from "@/lib/repo/planner-tasks";
import type { FormEvent } from "react";
import styles from "@/styles/planner/tasks.module.css";

type InspectorProps = {
  activeLabelIds: string[];
  dirty: boolean;
  labels: PlannerLabel[];
  lists: TaskList[];
  mutationStatus: PlannerMutationStatus;
  onAddReminder: (event: FormEvent<HTMLFormElement>) => void;
  onAddSubtask: (event: FormEvent<HTMLFormElement>) => void;
  onCancelReminder: (reminder: PlannerReminder) => void;
  onCreateSeries: (event: FormEvent<HTMLFormElement>) => void;
  onDirtyChange: () => void;
  onEnablePush: () => void;
  onSaveLabels: (event: FormEvent<HTMLFormElement>) => void;
  onSaveTask: (event: FormEvent<HTMLFormElement>) => void;
  reminders: PlannerReminder[];
  scheduled: { date: string; time: string };
  task: PlannerTask | null;
  view: PlannerTaskView;
};

export function PlannerTaskSheet({
  inspector,
  onOpenChange,
  open,
  triggerRef,
  viewport,
}: {
  inspector: InspectorProps;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  viewport: "tablet" | "mobile";
}) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <PlannerDrawer
      description="编辑任务字段、标签、提醒、重复规则和子任务"
      initialFocus={titleInputRef}
      onOpenChange={onOpenChange}
      open={open}
      surface={viewport === "mobile" ? "sheet" : "drawer"}
      title={inspector.task?.title ?? "任务详情"}
      triggerRef={triggerRef}
    >
      <div className={styles.sheetContent}>
        <PlannerTaskInspector {...inspector} titleInputRef={titleInputRef} />
      </div>
    </PlannerDrawer>
  );
}
