"use client";

import { CalendarClock } from "lucide-react";
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
    <section aria-label="时间安排" className={styles.detailSection}>
      <header className={styles.detailSectionHeader}>
        <span><CalendarClock aria-hidden size={16} /></span>
        <div>
          <h3>时间安排</h3>
          <p>到期要求与实际执行计划</p>
        </div>
      </header>
      <div className={`${styles.propertyList} ${styles.propertyCard}`}>
        <PlannerPropertyRow label="到期日期"><PlannerDateTimeField defaultValue={task.due_date ?? ""} name="dueDate" type="date" /></PlannerPropertyRow>
        <PlannerPropertyRow label="计划日期"><PlannerDateTimeField defaultValue={scheduled.date} name="scheduledDate" type="date" /></PlannerPropertyRow>
        <PlannerPropertyRow label="开始时间"><PlannerDateTimeField defaultValue={scheduled.time} name="scheduledStart" type="time" /></PlannerPropertyRow>
      </div>
    </section>
  );
}
