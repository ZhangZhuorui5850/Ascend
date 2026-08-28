"use client";

import { CheckCircle2, ChevronDown, ChevronUp, Clock3 } from "lucide-react";
import { useState } from "react";
import { PlannerDateTimeField } from "@/components/ui/PlannerFormFields";
import { useFeedback } from "@/components/FeedbackProvider";
import type { CalendarTask } from "@/lib/repo/planner-calendar-tasks";
import styles from "@/styles/planner/calendar.module.css";

type MutationResult = { ok: boolean; error?: string };

export function CalendarTaskInbox({
  tasks,
  timeZone,
  onSchedule,
}: {
  tasks: CalendarTask[];
  timeZone: string;
  onSchedule: (task: CalendarTask, day: string, time: string) => Promise<MutationResult>;
}) {
  return (
    <div className={styles.taskInbox}>
      <p className={styles.taskInboxIntro}>
        给任务分配开始时间，它会进入周时间轴。拖拽和这里的日期时间输入使用同一 Action。
      </p>
      <div className={styles.taskInboxList}>
        {tasks.map((task) => (
          <CalendarTaskInboxRow key={task.id} onSchedule={onSchedule} task={task} timeZone={timeZone} />
        ))}
        {tasks.length === 0 ? (
          <div className={styles.empty}>
            <span>
              <CheckCircle2 size={24} />
              任务均已安排
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CalendarTaskInboxRow({
  task,
  timeZone,
  onSchedule,
}: {
  task: CalendarTask;
  timeZone: string;
  onSchedule: (task: CalendarTask, day: string, time: string) => Promise<MutationResult>;
}) {
  const { notify } = useFeedback();
  const [day, setDay] = useState(task.day || dateKeyForZone(new Date(), timeZone));
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  async function schedule(): Promise<void> {
    if (busy) return;
    setBusy(true);
    const result = await onSchedule(task, day, time);
    setBusy(false);
    if (result.ok) {
      notify("任务已进入时间轴");
      return;
    }
    notify(result.error || "安排任务失败", "error");
  }

  return (
    <article className={styles.taskInboxRow}>
      <header>
        <span>P{task.priority}</span>
        {task.subject_code ? <b>{task.subject_code}</b> : null}
        <small>{task.estimated_minutes} 分钟</small>
      </header>
      <strong>{task.title}</strong>
      <button
        aria-expanded={editing}
        className={styles.scheduleToggle}
        onClick={() => setEditing((value) => !value)}
        type="button"
      >
        <span>{editing ? "收起" : "安排"}</span>
        {editing ? <ChevronUp aria-hidden="true" size={14} /> : <ChevronDown aria-hidden="true" size={14} />}
      </button>
      {editing ? (
        <div className={styles.scheduleControls}>
          <PlannerDateTimeField
            aria-label={`${task.title} 日期`}
            onChange={(event) => setDay(event.target.value)}
            type="date"
            value={day}
          />
          <PlannerDateTimeField
            aria-label={`${task.title} 开始时间`}
            onChange={(event) => setTime(event.target.value)}
            type="time"
            value={time}
          />
          <button aria-label={`排入 ${task.title}`} disabled={busy} onClick={() => void schedule()} type="button">
            <Clock3 size={14} />
          </button>
        </div>
      ) : null}
    </article>
  );
}

function dateKeyForZone(date: Date, timeZone: string): string {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}
