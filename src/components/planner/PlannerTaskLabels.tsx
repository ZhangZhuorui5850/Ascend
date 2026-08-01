"use client";

import type { FormEvent } from "react";
import type { PlannerLabel } from "@/lib/planner/types";
import styles from "@/styles/planner/tasks.module.css";

export function PlannerTaskLabels({
  activeLabelIds,
  labels,
  onSubmit,
}: {
  activeLabelIds: string[];
  labels: PlannerLabel[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className={styles.sectionForm} onSubmit={onSubmit}>
      <div className={styles.labelOptions}>
        {labels.map((label) => (
          <label key={label.id}>
            <input
              defaultChecked={activeLabelIds.includes(label.id)}
              name="labelId"
              type="checkbox"
              value={label.id}
            />
            #{label.name}
          </label>
        ))}
      </div>
      <button type="submit">保存标签</button>
    </form>
  );
}
