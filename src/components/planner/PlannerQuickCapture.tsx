"use client";

import { Plus } from "lucide-react";
import type { FormEvent } from "react";
import { PlannerCollapsible } from "@/components/ui/PlannerCollapsible";
import { PlannerDateTimeField, PlannerField, PlannerSelect } from "@/components/ui/PlannerFormFields";
import type { TaskList } from "@/lib/planner/types";
import styles from "@/styles/planner/tasks.module.css";

export function PlannerQuickCapture({
  dueDate,
  listId,
  lists,
  onDueDateChange,
  onListChange,
  onSubmit,
  onTitleChange,
  pending,
  title,
}: {
  dueDate: string;
  listId: string;
  lists: TaskList[];
  onDueDateChange: (value: string) => void;
  onListChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTitleChange: (value: string) => void;
  pending: boolean;
  title: string;
}) {
  return (
    <div className={styles.captureWrap}>
      <form aria-busy={pending} className={styles.quickCapture} data-capture-pending={pending ? "" : undefined} onSubmit={onSubmit}>
        <input
          aria-label="任务标题"
          autoComplete="off"
          disabled={pending}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="收集一件要做的事…"
          value={title}
        />
        <button aria-label="添加任务" className="primaryButton" disabled={pending} type="submit">
          <Plus size={16} />
          <span>{pending ? "添加中" : "添加"}</span>
        </button>
      </form>
      <div className={styles.captureMore}>
        <PlannerCollapsible label="设置清单与日期" summary={dueDate ? `到期 ${dueDate}` : `${lists.find((list) => list.id === listId)?.name ?? "收集箱"} · 未设日期`}>
          <div className={styles.propertyList}>
            <PlannerField label="清单">
              <PlannerSelect aria-label="任务清单" disabled={pending} onChange={(event) => onListChange(event.target.value)} value={listId}>
                {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
              </PlannerSelect>
            </PlannerField>
            <PlannerField label="到期日期">
              <PlannerDateTimeField aria-label="到期日期" disabled={pending} onChange={(event) => onDueDateChange(event.target.value)} type="date" value={dueDate} />
            </PlannerField>
          </div>
        </PlannerCollapsible>
      </div>
    </div>
  );
}
