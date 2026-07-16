"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import zhCnLocale from "@fullcalendar/core/locales/zh-cn";
import type { EventDropArg, EventInput } from "@fullcalendar/core";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { CalendarClock, CalendarDays, CheckCircle2, Clock3, List, Milestone, MoveRight } from "lucide-react";
import { scheduleTaskAction } from "@/app/actions/planner";
import { useFeedback } from "@/components/FeedbackProvider";
import type { DayTask } from "@/lib/repo/planner";
import type { ExamCountdown } from "@/lib/repo/settings";
import type { CalendarSummary } from "@/lib/types";

type CalendarViewProps = {
  summaries: CalendarSummary[];
  tasks: DayTask[];
  exams: ExamCountdown[];
};

export function CalendarView({ summaries, tasks, exams }: CalendarViewProps) {
  const router = useRouter();
  const { notify } = useFeedback();
  const mobile = useSyncExternalStore(subscribeMobile, readMobile, () => false);
  const [selectedView, setSelectedView] = useState<"calendar" | "list" | null>(null);
  const view = selectedView ?? (mobile ? "list" : "calendar");
  const openTasks = tasks.filter((task) => !task.done);
  const inbox = openTasks.filter((task) => !task.scheduled_start).slice(0, 12);
  const scheduledMinutes = openTasks.reduce((sum, task) => sum + (task.scheduled_start ? task.estimated_minutes : 0), 0);
  const events = buildEvents(summaries, tasks, exams);

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
    router.refresh();
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
    router.refresh();
  }

  return (
    <div className="calendarWorkspace">
      <section className="calendarOverview" aria-label="日历概览">
        <div><CalendarClock size={17} /><span>已排时间</span><strong>{scheduledMinutes}<small> min</small></strong></div>
        <div><MoveRight size={17} /><span>待排任务</span><strong>{inbox.length}</strong></div>
        <div><Milestone size={17} /><span>考试节点</span><strong>{exams.length}</strong></div>
        <div><CheckCircle2 size={17} /><span>已完成</span><strong>{tasks.filter((task) => task.done).length}</strong></div>
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
            dateClick={(info) => router.push(`/day/${info.dateStr.slice(0, 10)}`, { transitionTypes: ["nav-forward"] })}
            editable
            eventClick={(info) => {
              const day = info.event.start ? localDateKey(info.event.start) : info.event.startStr.slice(0, 10);
              router.push(`/day/${day}`, { transitionTypes: ["nav-forward"] });
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
          /> : <CalendarAgenda summaries={summaries} tasks={tasks} onOpen={(day) => router.push(`/day/${day}`, { transitionTypes: ["nav-forward"] })} />}
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

function ScheduleRow({ task }: { task: DayTask }) {
  const router = useRouter();
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
    router.refresh();
  }

  return <article className={`calendarInboxTask priority${task.priority}`}>
    <header><span>P{task.priority}</span>{task.subject_code ? <b>{task.subject_code}</b> : null}<small>{task.estimated_minutes} min</small></header>
    <strong>{task.title}</strong>
    <div><input aria-label="任务日期" onChange={(event) => setDay(event.target.value)} type="date" value={day} /><input aria-label="任务开始时间" onChange={(event) => setTime(event.target.value)} type="time" value={time} /><button disabled={busy} onClick={() => void schedule()} type="button"><Clock3 size={13} />排入</button></div>
  </article>;
}

function CalendarAgenda({ summaries, tasks, onOpen }: { summaries: CalendarSummary[]; tasks: DayTask[]; onOpen: (day: string) => void }) {
  const summaryByDay = new Map(summaries.map((item) => [item.date, item]));
  const days = [...new Set([...summaries.map((item) => item.date), ...tasks.map((item) => item.day)])].sort((a, b) => b.localeCompare(a));
  return <div className="calendarAgenda">
    {days.map((day) => {
      const summary = summaryByDay.get(day);
      const dayTasks = tasks.filter((task) => task.day === day);
      return <button key={day} onClick={() => onOpen(day)} type="button">
        <time>{formatAgendaDate(day)}</time>
        <span>{dayTasks.length ? `${dayTasks.filter((task) => task.done).length}/${dayTasks.length} 个任务完成` : "当天任务为空"}</span>
        <small>{summary?.studyMinutes || 0} 分钟学习 · {summary?.reviewCount || 0} 复习 · {summary?.mistakeCount || 0} 错题</small>
        {summary?.hasSummary ? <b>已复盘</b> : null}
      </button>;
    })}
  </div>;
}

function buildEvents(summaries: CalendarSummary[], tasks: DayTask[], exams: ExamCountdown[]): EventInput[] {
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
  const activityEvents: EventInput[] = summaries.filter((day) => day.studyMinutes > 0).map((day) => ({
    id: `activity-${day.date}`,
    title: `已学习 ${day.studyMinutes}m`,
    date: day.date,
    allDay: true,
    editable: false,
    display: "background",
    classNames: ["eventActivity"],
    extendedProps: { kind: "activity" },
  }));
  return [...taskEvents, ...examEvents, ...activityEvents];
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

function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 760px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function readMobile() {
  return window.matchMedia("(max-width: 760px)").matches;
}
