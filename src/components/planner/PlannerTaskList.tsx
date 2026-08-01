"use client";

import { AnimatePresence } from "motion/react";
import type { PlannerTask } from "@/lib/planner/types";
import { PlannerTaskRow } from "@/components/planner/PlannerTaskRow";
import styles from "@/styles/planner/tasks.module.css";

export function PlannerTaskList({
  checked,
  onCheck,
  onOpen,
  onNavigate,
  onRemove,
  onRestore,
  onToggle,
  selectedId,
  selectionMode,
  taskMeta,
  tasks,
  trash,
}: {
  checked: Set<string>;
  onCheck: (taskId: string, checked: boolean) => void;
  onOpen: (taskId: string, trigger: HTMLButtonElement) => void;
  onNavigate: (taskId: string, direction: -1 | 1) => void;
  onRemove: (task: PlannerTask) => void;
  onRestore: (task: PlannerTask) => void;
  onToggle: (task: PlannerTask) => void;
  selectedId: string | null;
  selectionMode: boolean;
  taskMeta: (task: PlannerTask) => string;
  tasks: PlannerTask[];
  trash: boolean;
}) {
  return (
    <div className={styles.list}>
      <AnimatePresence initial={false} mode="popLayout">
        {tasks.map((task) => (
          <PlannerTaskRow
            checked={checked.has(task.id)}
            key={task.id}
            meta={taskMeta(task)}
            onCheck={(value) => onCheck(task.id, value)}
            onOpen={(trigger) => onOpen(task.id, trigger)}
            onNavigate={(direction) => onNavigate(task.id, direction)}
            onRemove={() => onRemove(task)}
            onRestore={() => onRestore(task)}
            onToggle={() => onToggle(task)}
            selected={selectedId === task.id}
            selectionMode={selectionMode}
            task={task}
            trash={trash}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
