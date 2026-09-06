"use client";

import { Check, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { m } from "motion/react";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import type { PlannerTask } from "@/lib/planner/types";
import { motion } from "@/lib/motion/contracts";
import { useMotionReduced } from "@/components/ui/MotionProvider";
import styles from "@/styles/planner/tasks.module.css";

export function PlannerTaskRow({
  checked,
  meta,
  onCheck,
  onOpen,
  onNavigate,
  onRemove,
  onRestore,
  onToggle,
  selected,
  selectionMode,
  task,
  trash,
}: {
  checked: boolean;
  meta: string;
  onCheck: (checked: boolean) => void;
  onOpen: (trigger: HTMLButtonElement) => void;
  onNavigate: (direction: -1 | 1) => void;
  onRemove: () => void;
  onRestore: () => void;
  onToggle: () => void;
  selected: boolean;
  selectionMode: boolean;
  task: PlannerTask;
  trash: boolean;
}) {
  const reduced = useMotionReduced();
  const contract = reduced ? motion.row.reduced : motion.row;

  function handleKeyboard(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === " ") {
      event.preventDefault();
      if (selectionMode) onCheck(!checked);
      else onToggle();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-planner-task-open]")];
      const currentIndex = buttons.indexOf(event.currentTarget);
      buttons[Math.min(Math.max(currentIndex + direction, 0), buttons.length - 1)]?.focus();
      onNavigate(direction);
    }
  }

  function handleOpen(event: MouseEvent<HTMLButtonElement>): void {
    onOpen(event.currentTarget);
  }

  return (
    <m.article
      className={styles.taskRow}
      data-completed={task.status === "completed"}
      data-selected={selected}
      animate={contract.animate}
      exit={contract.exit}
      initial={contract.enter}
      layout={reduced ? false : "position"}
      transition={reduced ? undefined : motion.row.reorder}
      style={{ "--task-depth": task.depth } as CSSProperties}
    >
      {selected ? (
        <m.span className={styles.selectedBackground} layoutId="planner-selected-task" />
      ) : null}
      {selectionMode ? (
        <input
          aria-label={`选择 ${task.title}`}
          checked={checked}
          className={styles.selectionCheckbox}
          onChange={(event) => onCheck(event.target.checked)}
          type="checkbox"
        />
      ) : (
        <button
          aria-label={task.status === "completed" ? `恢复 ${task.title}` : `完成 ${task.title}`}
          aria-pressed={task.status === "completed"}
          className={styles.completeButton}
          onClick={onToggle}
          type="button"
        >
          {task.status === "completed" ? <Check size={14} /> : null}
        </button>
      )}
      <button
        aria-expanded={selected}
        className={styles.openButton}
        data-planner-task-id={task.id}
        data-planner-task-open
        onClick={handleOpen}
        onKeyDown={handleKeyboard}
        type="button"
      >
        <strong>{task.title}</strong>
        <span>{meta}</span>
      </button>
      <span className={styles.priority} data-priority={task.priority}>P{task.priority}</span>
      {trash ? (
        <button aria-label={`恢复 ${task.title}`} className={styles.rowAction} onClick={onRestore} type="button"><RotateCcw size={16} /></button>
      ) : (
        <details className={styles.rowMore}>
          <summary aria-label={`更多操作：${task.title}`}><MoreHorizontal size={17} /></summary>
          <button onClick={onRemove} type="button"><Trash2 size={15} />移入回收站</button>
        </details>
      )}
    </m.article>
  );
}
