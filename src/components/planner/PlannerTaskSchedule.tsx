"use client";

import type { PlannerTask } from "@/lib/planner/types";
import { PlannerDateTimeField, PlannerPropertyRow } from "@/components/ui/PlannerFormFields";
import styles from "@/styles/planner/tasks.module.css";

export function PlannerTaskSchedule({
  scheduled,
  task,
}: {
  scheduled: { date: string; time: string };
  task: PlannerTask;
}) {
  return (
    <div className={styles.propertyList}>
      <PlannerPropertyRow label="到期"><PlannerDateTimeField defaultValue={task.due_date ?? ""} name="dueDate" type="date" /></PlannerPropertyRow>
      <PlannerPropertyRow label="计划"><PlannerDateTimeField defaultValue={scheduled.date} name="scheduledDate" type="date" /></PlannerPropertyRow>
      <PlannerPropertyRow label="开始时间"><PlannerDateTimeField defaultValue={scheduled.time} name="scheduledStart" type="time" /></PlannerPropertyRow>
    </div>
  );
}
