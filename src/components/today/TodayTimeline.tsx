"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import { CalendarDays, Check, Clock3 } from "lucide-react";
import { toggleDayTaskAction } from "@/app/actions/day-tasks";
import { useFeedback } from "@/components/FeedbackProvider";
import type {
  TodayEventItem,
  TodayTaskItem,
  TodayTimelineItem,
} from "@/lib/application/today/read-model";
import styles from "@/app/Today.module.css";

export function TodayTimeline({
  day,
  scheduledItems,
  unscheduledTasks,
}: {
  day: string;
  scheduledItems: TodayTimelineItem[];
  unscheduledTasks: TodayTaskItem[];
}) {
  const { notify } = useFeedback();
  const [items, setItems] = useState(() => [...scheduledItems, ...unscheduledTasks]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const scheduledKeys = new Set(scheduledItems.map(itemKey));
  const currentScheduled = items.filter((item) => scheduledKeys.has(itemKey(item)));
  const currentUnscheduled = items.filter(
    (item): item is TodayTaskItem => item.kind === "task" && !scheduledKeys.has(itemKey(item)),
  );

  function setCompletion(task: TodayTaskItem, done: boolean) {
    if (pendingIds.has(task.id) || task.done === done) return;
    setItems((current) => current.map((item) => item.id === task.id && item.kind === "task"
      ? { ...item, done }
      : item));
    setPendingIds((current) => new Set(current).add(task.id));
    startTransition(async () => {
      try {
        const result = await toggleDayTaskAction({
          id: task.id,
          expectedVersion: task.version,
          clientMutationId: crypto.randomUUID(),
          day,
          done,
        });
        if (!result.ok || !result.task) {
          setItems((current) => current.map((item) => item.id === task.id && item.kind === "task"
            ? { ...item, done: task.done }
            : item));
          notify(result.error || "任务状态未保存", result.conflict ? "conflict" : "error");
          return;
        }
        const savedVersion = result.task.version;
        setItems((current) => current.map((item) => item.id === task.id && item.kind === "task"
          ? { ...item, done: Boolean(result.task!.done), version: savedVersion }
          : item));
        if (done) {
          notify(`已完成「${task.title}」`, "success", {
            actionLabel: "撤销",
            undo: () => setCompletion({ ...task, version: savedVersion, done: true }, false),
          });
        }
      } catch (error) {
        console.error("今日任务状态更新失败", error);
        setItems((current) => current.map((item) => item.id === task.id && item.kind === "task"
          ? { ...item, done: task.done }
          : item));
        notify("网络异常，任务状态未保存", "error");
      } finally {
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
      }
    });
  }

  if (!items.length) {
    return (
      <div className={styles.timelineEmpty}>
        <span>今天还没有安排。</span>
        <Link href="/tasks" transitionTypes={["nav-switch"]}>去计划中看看</Link>
      </div>
    );
  }

  return (
    <div aria-live="polite" className={styles.timeline}>
      {currentScheduled.map((item) => (
        <TimelineRow item={item} key={`${item.kind}:${item.id}`} onCompletion={setCompletion} pending={pendingIds.has(item.id)} />
      ))}
      {currentUnscheduled.length ? (
        <div className={styles.unscheduledGroup}>
          <p>未排时</p>
          {currentUnscheduled.map((item) => (
            <TimelineRow item={item} key={item.id} onCompletion={setCompletion} pending={pendingIds.has(item.id)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TimelineRow({
  item,
  onCompletion,
  pending,
}: {
  item: TodayTimelineItem;
  onCompletion: (task: TodayTaskItem, done: boolean) => void;
  pending: boolean;
}) {
  return (
    <div
      className={styles.timelineRow}
      data-done={item.kind === "task" ? item.done : undefined}
      id={item.kind === "task" ? `today-task-${item.id}` : undefined}
    >
      <div className={styles.timelineTime}>
        {item.allDay ? "全天" : item.startTime ?? "到期"}
      </div>
      <div aria-hidden className={styles.timelineRail} data-kind={item.kind} />
      <div className={styles.timelineContent}>
        <strong>{item.title}</strong>
        <span>
          {item.kind === "task"
            ? `${item.subjectCode ? `${item.subjectCode} · ` : ""}预计 ${item.estimatedMinutes} 分钟`
            : [eventLabel(item.eventKind), item.subjectCode].filter(Boolean).join(" · ")}
        </span>
      </div>
      {item.kind === "task" ? (
        <button
          aria-checked={item.done}
          aria-label={item.done ? `重新打开任务：${item.title}` : `完成任务：${item.title}`}
          className={styles.taskCheck}
          disabled={pending}
          onClick={() => onCompletion(item, !item.done)}
          role="checkbox"
          type="button"
        >
          {item.done ? <Check aria-hidden size={17} /> : <Clock3 aria-hidden size={16} />}
        </button>
      ) : (
        <span aria-label="日历事件" className={styles.eventMark}><CalendarDays aria-hidden size={17} /></span>
      )}
    </div>
  );
}

function eventLabel(kind: TodayEventItem["eventKind"]): string {
  const labels: Record<string, string> = {
    class: "课程",
    event: "日程",
    exam: "考试",
    focus: "专注",
    meeting: "会议",
    milestone: "里程碑",
  };
  return labels[kind] ?? "日程";
}

function itemKey(item: TodayTimelineItem): string {
  return `${item.kind}:${item.id}`;
}
