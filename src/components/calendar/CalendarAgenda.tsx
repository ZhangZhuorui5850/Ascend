"use client";

import type { CalendarEvent } from "@/lib/planner/types";
import type { DayTask } from "@/lib/repo/planner";
import type { ExamCountdown } from "@/lib/repo/settings";
import {
  buildCalendarAgendaRows,
} from "@/components/calendar/calendar-events";
import styles from "@/styles/planner/calendar.module.css";

export function CalendarAgenda({
  events,
  exams,
  onOpenDay,
  tasks,
}: {
  events: CalendarEvent[];
  exams: ExamCountdown[];
  onOpenDay: (day: string, trigger: HTMLButtonElement) => void;
  tasks: DayTask[];
}) {
  const rows = buildCalendarAgendaRows({ tasks, exams, events });
  const days = rows.map((row) => row.day);
  const today = localDateKey(new Date());
  return (
    <div className={styles.agenda}>
      <nav aria-label="议程日期" className={styles.agendaDateStrip}>
        <button data-today="true" onClick={() => document.getElementById(`agenda-${today}`)?.scrollIntoView({ block: "start" })} type="button">
          今天
        </button>
        {days.slice(0, 14).map((day) => (
          <button key={day} onClick={() => document.getElementById(`agenda-${day}`)?.scrollIntoView({ block: "start" })} type="button">
            {formatShortDate(day)}
          </button>
        ))}
      </nav>
      {rows.map(({ day, events: dayEvents, exams: dayExams, tasks: dayTasks }) => {
        return (
          <button
            className={styles.agendaDay}
            id={`agenda-${day}`}
            key={day}
            onClick={(event) => onOpenDay(day, event.currentTarget)}
            type="button"
          >
            <time>{formatAgendaDate(day)}</time>
            <span>{dayTasks.length ? `${dayTasks.filter((task) => task.done).length}/${dayTasks.length} 个任务完成` : `${dayEvents.length} 个事件`}</span>
            <small>{[...dayEvents, ...dayTasks].slice(0, 3).map((item) => item.title).join(" · ") || dayExams.map((exam) => exam.name).join(" · ")}</small>
            {dayExams.length || dayEvents.length ? <b>{dayEvents.length} 个事件 · {dayExams.length} 个节点</b> : null}
          </button>
        );
      })}
      {days.length === 0 ? <p className={styles.empty}>当前议程为空。</p> : null}
    </div>
  );
}

function formatAgendaDate(day: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" })
    .format(new Date(`${day}T12:00:00`));
}

function formatShortDate(day: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" })
    .format(new Date(`${day}T12:00:00`));
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
