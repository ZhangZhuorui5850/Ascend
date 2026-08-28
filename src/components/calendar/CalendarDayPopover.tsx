"use client";

import { Popover } from "@base-ui/react/popover";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, Milestone, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarTask } from "@/lib/repo/planner-calendar-tasks";
import type { ExamCountdown } from "@/lib/repo/settings";
import styles from "@/styles/planner/calendar.module.css";

export type CalendarDayPopoverState = {
  day: string;
  anchorElement: HTMLElement;
  anchorRect: {
    bottom: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
    x: number;
    y: number;
  };
};

type OptimisticCalendarTask = CalendarTask & { clientKey?: string; pending?: boolean };
type MutationResult = { ok: boolean; error?: string };

export function CalendarDayPopover({
  exams,
  onAdd,
  onClose,
  onRemove,
  onToggle,
  popover,
  tasks,
}: {
  exams: ExamCountdown[];
  onAdd: (title: string) => void;
  onClose: () => void;
  onRemove: (task: CalendarTask) => Promise<MutationResult>;
  onToggle: (task: CalendarTask, done: boolean) => Promise<MutationResult>;
  popover: CalendarDayPopoverState;
  tasks: OptimisticCalendarTask[];
}) {
  const [open, setOpen] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState("");
  const hasOpenedRef = useRef(false);
  const previousTaskCountRef = useRef(tasks.length);
  const taskListRef = useRef<HTMLDivElement>(null);
  const virtualAnchor = useMemo(
    () => ({
      getBoundingClientRect: () => popover.anchorRect,
    }),
    [popover.anchorRect],
  );
  const doneCount = tasks.filter((task) => task.done).length;
  const totalMinutes = tasks.filter((task) => !task.done).reduce((sum, task) => sum + task.estimated_minutes, 0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      hasOpenedRef.current = true;
      setOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const previousCount = previousTaskCountRef.current;
    previousTaskCountRef.current = tasks.length;
    if (tasks.length <= previousCount) return;
    const frame = window.requestAnimationFrame(() => {
      const list = taskListRef.current;
      if (!list || list.scrollHeight <= list.clientHeight) return;
      const reduceMotion =
        document.documentElement.dataset.motion === "reduce" ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      list.scrollTo({
        behavior: reduceMotion ? "auto" : "smooth",
        top: list.scrollHeight,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tasks.length]);

  async function toggle(task: CalendarTask): Promise<void> {
    if (pendingTaskIds.has(task.id)) return;
    const done = !Boolean(task.done);
    setPendingTaskIds((current) => new Set(current).add(task.id));
    await onToggle(task, done);
    setPendingTaskIds((current) => {
      const next = new Set(current);
      next.delete(task.id);
      return next;
    });
  }

  async function remove(task: OptimisticCalendarTask): Promise<void> {
    if (pendingTaskIds.has(task.id) || task.pending) return;
    setPendingTaskIds((current) => new Set(current).add(task.id));
    await onRemove(task);
    setPendingTaskIds((current) => {
      const next = new Set(current);
      next.delete(task.id);
      return next;
    });
  }

  function submitDraft(): void {
    const title = draft.trim();
    if (!title) return;
    onAdd(title);
    setDraft("");
  }

  return (
    <Popover.Root
      onOpenChange={setOpen}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen && hasOpenedRef.current) onClose();
      }}
      open={open}
    >
      <Popover.Portal>
        <Popover.Positioner
          align="center"
          anchor={virtualAnchor}
          className={styles.dayPopoverPositioner}
          collisionPadding={12}
          positionMethod="fixed"
          side="bottom"
          sideOffset={8}
        >
          <Popover.Popup
            aria-labelledby="calendar-day-popover-title"
            className={styles.dayPopover}
            finalFocus={() => (popover.anchorElement.isConnected ? popover.anchorElement : false)}
          >
            <header className={styles.dayPopoverHeader}>
              <div>
                <span>{formatPopoverWeekday(popover.day)}</span>
                <Popover.Title id="calendar-day-popover-title">{formatPopoverDate(popover.day)}</Popover.Title>
              </div>
              <Popover.Close aria-label="关闭日程卡片" className={styles.dayPopoverClose}>
                <X aria-hidden="true" size={17} strokeWidth={1.8} />
              </Popover.Close>
            </header>
            <Popover.Description className={styles.dayProgress} render={<div />}>
              <div>
                <span>当日待办</span>
                <strong>
                  {doneCount}/{tasks.length}
                </strong>
              </div>
              <div aria-label={`已完成 ${doneCount}/${tasks.length}`} className={styles.dayProgressTrack} role="img">
                <span style={{ transform: `scaleX(${tasks.length ? doneCount / tasks.length : 0})` }} />
              </div>
              <small>
                {tasks.length
                  ? `${tasks.length - doneCount} 项待完成 · 预计 ${totalMinutes} 分钟`
                  : "这一天留有完整的空白时间"}
              </small>
            </Popover.Description>
            <div aria-busy={tasks.some((task) => task.pending)} className={styles.dayTaskList} ref={taskListRef}>
              {tasks.map((task) => (
                <article
                  className={styles.dayTask}
                  data-done={Boolean(task.done)}
                  data-entering={Boolean(task.clientKey)}
                  data-pending={Boolean(task.pending)}
                  data-priority={task.priority}
                  key={task.clientKey ?? task.id}
                >
                  <button
                    aria-checked={Boolean(task.done)}
                    aria-label={task.done ? `将“${task.title}”标记为待完成` : `完成“${task.title}”`}
                    className={styles.dayTaskCheck}
                    disabled={pendingTaskIds.has(task.id) || Boolean(task.pending)}
                    onClick={() => void toggle(task)}
                    role="checkbox"
                    type="button"
                  >
                    <span aria-hidden="true" className={styles.dayTaskCheckBox}>
                      {task.done ? <Check size={14} strokeWidth={2.4} /> : null}
                    </span>
                  </button>
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {task.subject_code ? `${task.subject_code} · ` : ""}
                      {task.scheduled_start ? `${task.scheduled_start} · ` : "待排时间 · "}
                      {task.estimated_minutes} 分钟
                    </small>
                  </div>
                  <span>{task.pending ? "保存中" : `P${task.priority}`}</span>
                  <button
                    aria-label={`删除“${task.title}”`}
                    className={styles.dayTaskRemove}
                    disabled={pendingTaskIds.has(task.id) || Boolean(task.pending)}
                    onClick={() => void remove(task)}
                    type="button"
                  >
                    <Trash2 size={13} />
                  </button>
                </article>
              ))}
              {exams.map((exam, index) => (
                <article className={styles.dayMilestone} key={`${exam.name}-${index}`}>
                  <Milestone size={15} />
                  <div>
                    <strong>{exam.name}</strong>
                    <small>{exam.targetScore ? `考试节点 · 目标 ${exam.targetScore}` : "考试节点"}</small>
                  </div>
                </article>
              ))}
              {tasks.length === 0 && exams.length === 0 ? (
                <div className={styles.dayEmpty}>
                  <CalendarDays size={23} />
                  <strong>当天没有待办</strong>
                  <span>保留一段自由安排的时间。</span>
                </div>
              ) : null}
            </div>
            <form
              className={styles.dayComposer}
              onSubmit={(event) => {
                event.preventDefault();
                submitDraft();
              }}
            >
              <input
                aria-label="添加当天任务"
                maxLength={200}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="添加当天任务，回车确认"
                value={draft}
              />
              <button aria-label="添加任务" disabled={!draft.trim()} type="submit">
                <Plus size={17} />
              </button>
            </form>
            <span aria-live="polite" className="srOnly">
              {tasks.some((task) => task.pending) ? "任务正在保存" : ""}
            </span>
            <Link className={styles.dayDetailLink} href={`/day/${popover.day}`}>
              进入当日详情
              <ArrowRight size={14} />
            </Link>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function formatPopoverDate(day: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date(`${day}T12:00:00`));
}

function formatPopoverWeekday(day: string): string {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", weekday: "long" }).format(new Date(`${day}T12:00:00`));
}
