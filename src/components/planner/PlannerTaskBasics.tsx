"use client";

import type { RefObject } from "react";
import { PlannerField, PlannerPropertyRow, PlannerSelect } from "@/components/ui/PlannerFormFields";
import type { PlannerTask, TaskList } from "@/lib/planner/types";
import styles from "@/styles/planner/tasks.module.css";

export function PlannerTaskBasics({
  lists,
  task,
  titleInputRef,
}: {
  lists: TaskList[];
  task: PlannerTask;
  titleInputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className={styles.primaryForm}>
      <PlannerField className={styles.taskTitleField} label="标题">
        <input data-planner-field-variant="underline" defaultValue={task.title} name="title" ref={titleInputRef} required />
      </PlannerField>
      <div className={styles.propertyList}>
        <PlannerPropertyRow label="清单">
          <PlannerSelect defaultValue={task.list_id} name="listId">
            {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
          </PlannerSelect>
        </PlannerPropertyRow>
        <PlannerPropertyRow label="状态">
          <PlannerSelect defaultValue={task.status} name="status">
            <option value="open">进行中</option>
            <option value="waiting">等待</option>
            <option value="completed">已完成</option>
            <option value="canceled">已取消</option>
          </PlannerSelect>
        </PlannerPropertyRow>
        <PlannerPropertyRow label="优先级">
          <PlannerSelect defaultValue={task.priority} name="priority">
            <option value="1">P1</option>
            <option value="2">P2</option>
            <option value="3">P3</option>
          </PlannerSelect>
        </PlannerPropertyRow>
        <PlannerPropertyRow label="预计">
          <input defaultValue={task.estimated_minutes} max="1440" min="5" name="estimatedMinutes" type="number" />
        </PlannerPropertyRow>
      </div>
    </div>
  );
}
