"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import zhCnLocale from "@fullcalendar/core/locales/zh-cn";
import type { EventDropArg, EventInput } from "@fullcalendar/core";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarClock, CalendarDays, Check, CheckCircle2, Clock3, List, Milestone, MoveRight, X } from "lucide-react";
import { scheduleTaskAction, toggleTaskAction } from "@/app/actions/planner";
import { useFeedback } from "@/components/FeedbackProvider";
import type { DayTask } from "@/lib/repo/planner";
import type { ExamCountdown } from "@/lib/repo/settings";

type CalendarViewProps = {
  tasks: DayTask[];
  exams: ExamCountdown[];
};

type DayPopoverState = {
  day: string;
  anchor: { top: number; bottom: number; left: number; width: number };
};

type MutationResult = { ok: boolean; error?: string };

export function CalendarView({ tasks, exams }: CalendarViewProps) {
  const { notify } = useFeedback();
  const mobile = useSyncExternalStore(subscribeMobile, readMobile, () => false);
  const [selectedView, setSelectedView] = useState<"calendar" | "list" | null>(null);
  const [dayPopover, setDayPopover] = useState<DayPopoverState | null>(null);
  const [completionOverrides, setCompletionOverrides] = useState<Record<number, boolean>>({});
  const popoverRef = useRef<HTMLDivElement>(null);
  const view = selectedView ?? (mobile ? "list" : "calendar");
  const displayTasks = tasks.map((task) => completionOverrides[task.id] === undefined
    ? task
    : { ...task, done: completionOverrides[task.id] ? 1 : 0 });
  const openTasks = displayTasks.filter((task) => !task.done);
  const inbox = openTasks.filter((task) => !task.scheduled_start).slice(0, 12);
  const scheduledMinutes = openTasks.reduce((sum, task) => sum + (task.scheduled_start ? task.estimated_minutes : 0), 0);
  const events = buildEvents(displayTasks, exams);

  useEffect(() => {
    if (!dayPopover) return;
    function closeOnPointerDown(event: PointerEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) setDayPopover(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDayPopover(null);
    }
    function closeOnScroll(event: Event) {
      if (!popoverRef.current?.contains(event.target as Node)) setDayPopover(null);
    }
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closePopover);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closePopover);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [dayPopover]);

  function closePopover() {
    setDayPopover(null);
  }

  function openDay(day: string, anchorElement: HTMLElement) {
    const rect = anchorElement.getBoundingClientRect();
    setDayPopover({
      day,
      anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
    });
  }

  async function toggleTask(task: DayTask, done: boolean): Promise<MutationResult> {
    const previousDone = Boolean(task.done);
    setTaskCompletion(task.id, done);
    try {
      const result = await toggleTaskAction({ id: task.id, day: task.day, done });
      if (!result.ok) {
        setTaskCompletion(task.id, previousDone);
        notify(result.error || "任务状态更新失败", "error");
      }
      return result;
    } catch {
      setTaskCompletion(task.id, previousDone);
      const result = { ok: false, error: "网络异常，任务状态未保存" };
      notify(result.error, "error");
      return result;
    }
  }

  function setTaskCompletion(id: number, done: boolean) {
    const serverDone = Boolean(tasks.find((task) => task.id === id)?.done);
    setCompletionOverrides((current) => {
      const next = { ...current };
      if (done === serverDone) delete next[id];
      else next[id] = done;
      return next;
    });
  }

  async function moveTask(info: EventDropArg) {
    if (info.event.extendedProps.kind !== "task" || !info.event.start) return;
    const result = await scheduleTaskAction({
      id: Number(info.event.extendedProps.taskId),
      previousDay: String(info.event.extendedProps.previousDay),
      day: localDateKey(info.event.start),
      scheduledStart: info.event.allDay ? null : localTimeKey(info.event.start),
    });
    if (!result.ok) {
      info.revert();
      notify(result.error || "任务改期失败", "error");
      return;
    }
    notify("任务时间已更新", "success");
  }

  async function resizeTask(info: EventResizeDoneArg) {
    if (info.event.extendedProps.kind !== "task" || !info.event.start || !info.event.end) return;
    const estimatedMinutes = Math.max(5, Math.round((info.event.end.getTime() - info.event.start.getTime()) / 60000));
    const result = await scheduleTaskAction({
      id: Number(info.event.extendedProps.taskId),
      previousDay: String(info.event.extendedProps.previousDay),
      day: localDateKey(info.event.start),
      scheduledStart: localTimeKey(info.event.start),
      estimatedMinutes,
    });
    if (!result.ok) {
      info.revert();
      notify(result.error || "任务时长更新失败", "error");
      return;
    }
    notify(`时间预算已调整为 ${estimatedMinutes} 分钟`, "success");
  }

  return (
    <div className="calendarWorkspace">
      <section className="calendarOverview" aria-label="日历概览">
        <div><CalendarClock size={17} /><span>已排时间</span><strong>{scheduledMinutes}<small> min</small></strong></div>
        <div><MoveRight size={17} /><span>待排任务</span><strong>{inbox.length}</strong></div>
        <div><Milestone size={17} /><span>考试节点</span><strong>{exams.length}</strong></div>
        <div><CheckCircle2 size={17} /><span>已完成</span><strong>{displayTasks.filter((task) => task.done).length}</strong></div>
      </section>

      <div className="calendarLayout">
        <section className="calendarShell card">
          <div className="calendarViewSwitch" aria-label="日历视图">
            <div><span className="sectionKicker">SCHEDULE</span><strong>计划画布</strong></div>
            <span className="calendarLegend"><i className="p1" />关键任务<i className="p2" />常规任务<i className="milestone" />考试</span>
            <button className={view === "calendar" ? "active" : ""} onClick={() => setSelectedView("calendar")} type="button"><CalendarDays size={15} />日历</button>
            <button className={view === "list" ? "active" : ""} onClick={() => setSelectedView("list")} type="button"><List size={15} />列表</button>
          </div>
          {view === "calendar" ? <FullCalendar
            allDayText="全天"
            businessHours={{ daysOfWeek: [1, 2, 3, 4, 5, 6, 0], startTime: "07:00", endTime: "23:00" }}
            dateClick={(info) => openDay(info.dateStr.slice(0, 10), info.dayEl)}
            editable
            eventClick={(info) => {
              const day = info.event.start ? localDateKey(info.event.start) : info.event.startStr.slice(0, 10);
              openDay(day, info.el);
            }}
            eventDrop={(info) => void moveTask(info)}
            eventDurationEditable
            eventResize={(info) => void resizeTask(info)}
            events={events}
            firstDay={1}
            headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
            height="auto"
            initialView="dayGridMonth"
            locale={zhCnLocale}
            nowIndicator
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            scrollTime="07:30:00"
            slotDuration="00:30:00"
          /> : <CalendarAgenda exams={exams} tasks={displayTasks} onOpen={openDay} />}
          {dayPopover ? createPortal(<DaySchedulePopover
            exams={exams.filter((exam) => exam.date === dayPopover.day)}
            onClose={closePopover}
            onToggle={toggleTask}
            popover={dayPopover}
            ref={popoverRef}
            tasks={displayTasks.filter((task) => task.day === dayPopover.day)}
          />, document.body) : null}
        </section>

        <aside className="calendarInbox card">
          <div className="sectionTitle">
            <div><span className="sectionKicker">TASK INBOX</span><h2>待排任务</h2></div>
            <span className="sectionHint">{inbox.length} 项</span>
          </div>
          <p className="calendarInboxIntro">给任务分配开始时间，它会进入周时间轴。月历拖动可快速改期。</p>
          <div className="calendarInboxList">
            {inbox.map((task) => <ScheduleRow key={task.id} task={task} />)}
            {!inbox.length ? <div className="calendarInboxEmpty"><CheckCircle2 size={24} /><strong>任务均已安排</strong><span>时间轴已经清晰。</span></div> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function DaySchedulePopover({ popover, tasks, exams, onToggle, onClose, ref }: {
  popover: DayPopoverState;
  tasks: DayTask[];
  exams: ExamCountdown[];
  onToggle: (task: DayTask, done: boolean) => Promise<MutationResult>;
  onClose: () => void;
  ref: React.Ref<HTMLDivElement>;
}) {
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<number>>(() => new Set());
  const doneCount = tasks.filter((task) => task.done).length;
  const totalMinutes = tasks.filter((task) => !task.done).reduce((sum, task) => sum + task.estimated_minutes, 0);
  const position = getPopoverPosition(popover.anchor);
  const style = {
    left: position.left,
    top: position.top,
    "--calendar-popover-arrow-x": `${position.arrowX}px`,
  } as CSSProperties;

  async function toggle(task: DayTask) {
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

  return <div className={`calendarDayPopoverPositioner ${position.above ? "above" : "below"}`} style={style}>
    <section aria-labelledby="calendar-day-popover-title" className="calendarDayPopover" ref={ref} role="dialog">
      <header className="calendarDayPopoverHeader">
        <div>
          <span>{formatPopoverWeekday(popover.day)}</span>
          <h2 id="calendar-day-popover-title">{formatPopoverDate(popover.day)}</h2>
        </div>
        <button aria-label="关闭日程卡片" onClick={onClose} type="button"><X size={16} /></button>
      </header>

      <div className="calendarDayProgress">
        <div><span>当日待办</span><strong>{doneCount}/{tasks.length}</strong></div>
        <div aria-label={`已完成 ${doneCount}/${tasks.length}`} className="calendarDayProgressTrack" role="img">
          <span style={{ width: `${tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0}%` }} />
        </div>
        <small>{tasks.length ? `${tasks.length - doneCount} 项待完成 · 预计 ${totalMinutes} 分钟` : "这一天留有完整的空白时间"}</small>
      </div>

      <div className="calendarDayTaskList">
        {tasks.map((task) => <CalendarDayTaskRow
          key={task.id}
          onToggle={() => void toggle(task)}
          pending={pendingTaskIds.has(task.id)}
          task={task}
        />)}
        {exams.map((exam, index) => <article className="calendarDayMilestone" key={`${exam.name}-${index}`}>
          <Milestone size={15} />
          <div><strong>{exam.name}</strong><small>{exam.targetScore ? `考试节点 · 目标 ${exam.targetScore}` : "考试节点"}</small></div>
        </article>)}
        {!tasks.length && !exams.length ? <div className="calendarDayEmpty"><CalendarDays size={23} /><strong>当天没有待办</strong><span>保留一段自由安排的时间。</span></div> : null}
      </div>

      <Link className="calendarDayDetailLink" href={`/day/${popover.day}`} onClick={onClose}>
        进入当日详情
        <ArrowRight size={14} />
      </Link>
    </section>
  </div>;
}

function CalendarDayTaskRow({ task, onToggle, pending }: {
  task: DayTask;
  onToggle: () => void;
  pending: boolean;
}) {
  const done = Boolean(task.done);

  return <article className={`calendarDayTask priority${task.priority} ${done ? "done" : ""}`}>
    <button
      aria-checked={done}
      aria-label={done ? `将“${task.title}”标记为待完成` : `完成“${task.title}”`}
      className="calendarDayTaskCheck"
      disabled={pending}
      onClick={onToggle}
      role="checkbox"
      type="button"
    >{done ? <Check size={12} /> : null}</button>
    <div>
      <strong>{task.title}</strong>
      <small>{task.subject_code ? `${task.subject_code} · ` : ""}{task.scheduled_start ? `${task.scheduled_start} · ` : "待排时间 · "}{task.estimated_minutes} 分钟</small>
    </div>
    <span>P{task.priority}</span>
  </article>;
}

function ScheduleRow({ task }: { task: DayTask }) {
  const { notify } = useFeedback();
  const [day, setDay] = useState(task.day);
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);

  async function schedule() {
    if (busy) return;
    setBusy(true);
    const result = await scheduleTaskAction({ id: task.id, previousDay: task.day, day, scheduledStart: time });
    setBusy(false);
    if (!result.ok) {
      notify(result.error || "安排任务失败", "error");
      return;
    }
    notify("任务已进入时间轴", "success");
  }

  return <article className={`calendarInboxTask priority${task.priority}`}>
    <header><span>P{task.priority}</span>{task.subject_code ? <b>{task.subject_code}</b> : null}<small>{task.estimated_minutes} min</small></header>
    <strong>{task.title}</strong>
    <div><input aria-label="任务日期" onChange={(event) => setDay(event.target.value)} type="date" value={day} /><input aria-label="任务开始时间" onChange={(event) => setTime(event.target.value)} type="time" value={time} /><button disabled={busy} onClick={() => void schedule()} type="button"><Clock3 size={13} />排入</button></div>
  </article>;
}

function CalendarAgenda({ tasks, exams, onOpen }: {
  tasks: DayTask[];
  exams: ExamCountdown[];
  onOpen: (day: string, anchorElement: HTMLElement) => void;
}) {
  const days = [...new Set([...tasks.map((item) => item.day), ...exams.map((item) => item.date)])].sort((a, b) => b.localeCompare(a));
  return <div className="calendarAgenda">
    {days.map((day) => {
      const dayTasks = tasks.filter((task) => task.day === day);
      const dayExams = exams.filter((exam) => exam.date === day);
      return <button key={day} onClick={(event) => onOpen(day, event.currentTarget)} type="button">
        <time>{formatAgendaDate(day)}</time>
        <span>{dayTasks.length ? `${dayTasks.filter((task) => task.done).length}/${dayTasks.length} 个任务完成` : "当天任务为空"}</span>
        <small>{dayTasks.slice(0, 2).map((task) => task.title).join(" · ") || dayExams.map((exam) => exam.name).join(" · ")}</small>
        {dayExams.length ? <b>{dayExams.length} 个节点</b> : null}
      </button>;
    })}
  </div>;
}

function buildEvents(tasks: DayTask[], exams: ExamCountdown[]): EventInput[] {
  const taskEvents: EventInput[] = tasks.map((task) => {
    const start = task.scheduled_start ? `${task.day}T${task.scheduled_start}:00` : task.day;
    const end = task.scheduled_start ? addMinutes(start, task.estimated_minutes) : undefined;
    return {
      id: `task-${task.id}`,
      title: `${task.subject_code ? `${task.subject_code} · ` : ""}${task.title}`,
      start,
      end,
      allDay: !task.scheduled_start,
      editable: !task.done,
      classNames: [`eventTask`, `eventPriority${task.priority}`, task.done ? "eventTaskDone" : ""].filter(Boolean),
      extendedProps: { kind: "task", taskId: task.id, previousDay: task.day },
    };
  });
  const examEvents: EventInput[] = exams.map((exam, index) => ({
    id: `exam-${index}`,
    title: `考试 · ${exam.name}${exam.targetScore ? ` · 目标 ${exam.targetScore}` : ""}`,
    date: exam.date,
    allDay: true,
    editable: false,
    classNames: ["eventMilestone"],
    extendedProps: { kind: "exam" },
  }));
  return [...taskEvents, ...examEvents];
}

function addMinutes(start: string, minutes: number): string {
  const date = new Date(start);
  date.setMinutes(date.getMinutes() + minutes);
  return `${localDateKey(date)}T${localTimeKey(date)}:00`;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTimeKey(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatAgendaDate(day: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${day}T12:00:00`));
}

function formatPopoverDate(day: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date(`${day}T12:00:00`));
}

function formatPopoverWeekday(day: string): string {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", weekday: "long" }).format(new Date(`${day}T12:00:00`));
}

function getPopoverPosition(anchor: DayPopoverState["anchor"]) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 12;
  const gap = 10;
  const width = Math.min(340, viewportWidth - margin * 2);
  const anchorCenter = anchor.left + anchor.width / 2;
  const left = Math.max(margin, Math.min(anchorCenter - width / 2, viewportWidth - width - margin));
  const spaceBelow = viewportHeight - anchor.bottom;
  const above = spaceBelow < 430 && anchor.top > spaceBelow;
  return {
    above,
    left,
    top: above ? anchor.top - gap : anchor.bottom + gap,
    arrowX: Math.max(18, Math.min(anchorCenter - left, width - 18)),
  };
}

function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 760px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function readMobile() {
  return window.matchMedia("(max-width: 760px)").matches;
}
