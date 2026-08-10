"use client";

import { Popover } from "@base-ui/react/popover";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Milestone,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { CalendarTask } from "@/lib/repo/planner-calendar-tasks";
import type { ExamCountdown } from "@/lib/repo/settings";

export type CalendarDayPopoverState = {
  day: string;
  anchorElement: HTMLElement;
};

type OptimisticCalendarTask = CalendarTask & { pending?: boolean };
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
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState("");
  const doneCount = tasks.filter((task) => task.done).length;
  const totalMinutes = tasks.filter((task) => !task.done)
    .reduce((sum, task) => sum + task.estimated_minutes, 0);

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
    <Popover.Root onOpenChange={(open) => { if (!open) onClose(); }} open>
      <Popover.Portal>
        <Popover.Positioner
          align="center"
          anchor={popover.anchorElement}
          className="calendarDayPopoverPositioner"
          collisionPadding={12}
          positionMethod="fixed"
          side="bottom"
          sideOffset={8}
        >
          <Popover.Popup
            aria-labelledby="calendar-day-popover-title"
            className="calendarDayPopover"
            finalFocus={() => popover.anchorElement}
          >
            <header className="calendarDayPopoverHeader">
              <div>
                <span>{formatPopoverWeekday(popover.day)}</span>
                <Popover.Title id="calendar-day-popover-title">{formatPopoverDate(popover.day)}</Popover.Title>
              </div>
              <Popover.Close aria-label="关闭日程卡片">关闭</Popover.Close>
            </header>
            <Popover.Description className="calendarDayProgress" render={<div />}>
              <div><span>当日待办</span><strong>{doneCount}/{tasks.length}</strong></div>
              <div aria-label={`已完成 ${doneCount}/${tasks.length}`} className="calendarDayProgressTrack" role="img">
                <span style={{ transform: `scaleX(${tasks.length ? doneCount / tasks.length : 0})` }} />
              </div>
              <small>{tasks.length ? `${tasks.length - doneCount} 项待完成 · 预计 ${totalMinutes} 分钟` : "这一天留有完整的空白时间"}</small>
            </Popover.Description>
            <div className="calendarDayTaskList">
              {tasks.map((task) => (
                <article className={`calendarDayTask priority${task.priority} ${task.done ? "done" : ""}`} key={task.id}>
                  <button
                    aria-checked={Boolean(task.done)}
                    aria-label={task.done ? `将“${task.title}”标记为待完成` : `完成“${task.title}”`}
                    className="calendarDayTaskCheck"
                    disabled={pendingTaskIds.has(task.id) || Boolean(task.pending)}
                    onClick={() => void toggle(task)}
                    role="checkbox"
                    type="button"
                  >{task.done ? <Check size={12} /> : null}</button>
                  <div>
                    <strong>{task.title}</strong>
                    <small>{task.subject_code ? `${task.subject_code} · ` : ""}{task.scheduled_start ? `${task.scheduled_start} · ` : "待排时间 · "}{task.estimated_minutes} 分钟</small>
                  </div>
                  <span>P{task.priority}</span>
                  <button
                    aria-label={`删除“${task.title}”`}
                    className="calendarDayTaskRemove"
                    disabled={pendingTaskIds.has(task.id) || Boolean(task.pending)}
                    onClick={() => void remove(task)}
                    type="button"
                  ><Trash2 size={13} /></button>
                </article>
              ))}
              {exams.map((exam, index) => (
                <article className="calendarDayMilestone" key={`${exam.name}-${index}`}>
                  <Milestone size={15} />
                  <div><strong>{exam.name}</strong><small>{exam.targetScore ? `考试节点 · 目标 ${exam.targetScore}` : "考试节点"}</small></div>
                </article>
              ))}
              {tasks.length === 0 && exams.length === 0 ? (
                <div className="calendarDayEmpty"><CalendarDays size={23} /><strong>当天没有待办</strong><span>保留一段自由安排的时间。</span></div>
              ) : null}
            </div>
            <div className="calendarDayComposer">
              <input
                aria-label="添加当天任务"
                maxLength={200}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") submitDraft(); }}
                placeholder="添加当天任务，回车确认"
                value={draft}
              />
              <button aria-label="添加任务" disabled={!draft.trim()} onClick={submitDraft} type="button"><Plus size={15} /></button>
            </div>
            <Link className="calendarDayDetailLink" href={`/day/${popover.day}`} onClick={onClose}>
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
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" })
    .format(new Date(`${day}T12:00:00`));
}

function formatPopoverWeekday(day: string): string {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", weekday: "long" })
    .format(new Date(`${day}T12:00:00`));
}
