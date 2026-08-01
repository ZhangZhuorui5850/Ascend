"use client";

import { Plus } from "lucide-react";
import type { FormEvent } from "react";
import styles from "@/styles/planner/tasks.module.css";

export function PlannerTaskSubtasks({
  onSubmit,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className={styles.sectionForm} onSubmit={onSubmit}>
      <input aria-label="子任务标题" name="subtask" placeholder="添加子任务" />
      <button type="submit"><Plus size={15} />添加子任务</button>
    </form>
  );
}
