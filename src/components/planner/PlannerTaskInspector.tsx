"use client";

import { ArchiveRestore, CalendarClock } from "lucide-react";
import type { FormEvent, RefObject } from "react";
import { PlannerTaskBasics } from "@/components/planner/PlannerTaskBasics";
import { PlannerTaskLabels } from "@/components/planner/PlannerTaskLabels";
import { PlannerTaskRecurrence } from "@/components/planner/PlannerTaskRecurrence";
import { PlannerTaskReminders } from "@/components/planner/PlannerTaskReminders";
import { PlannerTaskSchedule } from "@/components/planner/PlannerTaskSchedule";
import { PlannerTaskSubtasks } from "@/components/planner/PlannerTaskSubtasks";
import { PlannerCollapsible } from "@/components/ui/PlannerCollapsible";
import { PlannerField } from "@/components/ui/PlannerFormFields";
import {
  PlannerStatusIndicator,
  type PlannerMutationStatus,
} from "@/components/ui/PlannerStatusIndicator";
import type {
  PlannerLabel,
  PlannerReminder,
  PlannerTask,
  TaskList,
} from "@/lib/planner/types";
import type { PlannerTaskView } from "@/lib/repo/planner-tasks";
import styles from "@/styles/planner/tasks.module.css";

export function PlannerTaskInspector({
  activeLabelIds,
  dirty,
  labels,
  lists,
  mutationStatus,
  onAddReminder,
  onAddSubtask,
  onCancelReminder,
  onCreateSeries,
  onDirtyChange,
  onEnablePush,
  onSaveLabels,
  onSaveTask,
  reminders,
  scheduled,
  task,
  titleInputRef,
  view,
}: {
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
  titleInputRef?: RefObject<HTMLInputElement | null>;
  view: PlannerTaskView;
}) {
  if (!task) {
    return <p className={styles.empty}>选择一条任务查看详情。</p>;
  }

  const taskReminders = reminders.filter(
    (reminder) => reminder.entity_type === "task" && reminder.entity_id === task.id,
  );
  const activeLabels = labels.filter((label) => activeLabelIds.includes(label.id));

  return (
    <div className={styles.inspectorContent}>
      <header className={styles.inspectorHeader}>
        <div className={styles.inspectorTitle}>
          <h2>任务详情</h2>
          <small>v{task.version}</small>
        </div>
        <PlannerStatusIndicator status={mutationStatus} />
      </header>
      <div className={styles.inspectorBody}>
        <form className={styles.primaryForm} key={`${task.id}:${task.version}`} onChange={onDirtyChange} onSubmit={onSaveTask}>
          <PlannerTaskBasics lists={lists} task={task} titleInputRef={titleInputRef} />
          <PlannerTaskSchedule scheduled={scheduled} task={task} />
          {activeLabels.length ? (
            <div className={styles.summaryLabels}>
              {activeLabels.map((label) => <span className={styles.label} key={label.id}>#{label.name}</span>)}
            </div>
          ) : null}
          <PlannerCollapsible label="备注" summary={task.notes.trim() ? "已有内容" : "空白"}>
            <PlannerField label="备注"><textarea defaultValue={task.notes} name="notes" rows={5} /></PlannerField>
          </PlannerCollapsible>
          {dirty ? <button className="primaryButton" type="submit">保存任务</button> : null}
        </form>
        {labels.length ? (
          <PlannerCollapsible label="标签" summary={activeLabels.length ? `${activeLabels.length} 个标签` : "未添加"}>
            <PlannerTaskLabels activeLabelIds={activeLabelIds} labels={labels} onSubmit={onSaveLabels} />
          </PlannerCollapsible>
        ) : null}
        <PlannerCollapsible label="提醒" summary={taskReminders.length ? `${taskReminders.length} 条提醒` : "未设置"}>
          <PlannerTaskReminders
            onAdd={onAddReminder}
            onCancel={onCancelReminder}
            onEnablePush={onEnablePush}
            reminders={taskReminders}
          />
        </PlannerCollapsible>
        <PlannerCollapsible label="重复" summary={task.series_id ? "系列任务" : "单次任务"}>
          <PlannerTaskRecurrence
            firstDate={scheduled.date || task.due_date || localDateKey()}
            firstTime={scheduled.time || "09:00"}
            onSubmit={onCreateSeries}
          />
        </PlannerCollapsible>
        {task.depth < 3 && view !== "trash" ? (
          <PlannerCollapsible label="子任务" summary={`当前层级 ${task.depth}/3`}>
            <PlannerTaskSubtasks onSubmit={onAddSubtask} />
          </PlannerCollapsible>
        ) : null}
        <PlannerCollapsible label="系统信息" summary={`版本 ${task.version}`}>
          <div className={styles.factRow}>
            <span><CalendarClock size={14} />{task.scheduled_start_at ? "已排期" : "待排期"}</span>
            <span><ArchiveRestore size={14} />{task.deleted_at ? "回收站" : "活动任务"}</span>
          </div>
        </PlannerCollapsible>
      </div>
      <footer className={styles.inspectorFooter}>
        <PlannerStatusIndicator status={mutationStatus} />
        <small>所有时间使用当前学习空间时区</small>
      </footer>
    </div>
  );
}

function localDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
