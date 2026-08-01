"use client";

import type { FormEvent } from "react";
import { PlannerDateTimeField, PlannerField, PlannerSelect } from "@/components/ui/PlannerFormFields";
import styles from "@/styles/planner/tasks.module.css";

export function PlannerTaskRecurrence({
  firstDate,
  firstTime,
  onSubmit,
}: {
  firstDate: string;
  firstTime: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className={styles.sectionForm} onSubmit={onSubmit}>
      <PlannerField label="重复规则"><input aria-label="重复规则" defaultValue="FREQ=WEEKLY;COUNT=12" name="rrule" required /></PlannerField>
      <PlannerSelect aria-label="生成方式" name="generationMode">
        <option value="fixed_schedule">固定排期</option>
        <option value="after_completion">完成后生成</option>
      </PlannerSelect>
      <div className={styles.gridFields}>
        <PlannerField label="首次日期"><PlannerDateTimeField aria-label="首次日期" defaultValue={firstDate} name="firstDate" required type="date" /></PlannerField>
        <PlannerField label="首次时间"><PlannerDateTimeField aria-label="首次时间" defaultValue={firstTime} name="firstTime" required type="time" /></PlannerField>
      </div>
      <button type="submit">创建系列</button>
    </form>
  );
}
