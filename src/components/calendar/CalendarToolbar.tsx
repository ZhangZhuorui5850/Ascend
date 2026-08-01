"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  Plus,
} from "lucide-react";
import styles from "@/styles/planner/calendar.module.css";

export type CalendarDisplayView = "month" | "week" | "day" | "agenda";
export type CalendarContext = "inbox" | "composer" | "event";

export function CalendarToolbar({
  activeContext,
  activeView,
  onContext,
  onNavigate,
  onView,
}: {
  activeContext: CalendarContext;
  activeView: CalendarDisplayView;
  onContext: (context: Exclude<CalendarContext, "event">, trigger: HTMLButtonElement) => void;
  onNavigate: (action: "prev" | "next" | "today") => void;
  onView: (view: CalendarDisplayView) => void;
}) {
  return (
    <header className={styles.toolbar}>
      <div className={styles.toolbarTitle}>
        <small>SCHEDULE</small>
        <strong>计划画布</strong>
      </div>
      <div className={styles.toolbarGroup} data-calendar-navigation>
        <button aria-label="上一时间段" onClick={() => onNavigate("prev")} type="button"><ChevronLeft size={16} /></button>
        <button aria-label="回到今天" onClick={() => onNavigate("today")} type="button">今天</button>
        <button aria-label="下一时间段" onClick={() => onNavigate("next")} type="button"><ChevronRight size={16} /></button>
      </div>
      <div className={styles.toolbarGroup} data-calendar-desktop-views>
        <button aria-label="月视图" data-active={activeView === "month"} onClick={() => onView("month")} type="button"><CalendarDays size={15} /><span>月</span></button>
        <button aria-label="周视图" data-active={activeView === "week"} onClick={() => onView("week")} type="button"><Clock3 size={15} /><span>周</span></button>
        <button aria-label="日视图" data-active={activeView === "day"} onClick={() => onView("day")} type="button"><Clock3 size={15} /><span>日</span></button>
      </div>
      <div className={styles.toolbarActions}>
        <button aria-label="议程视图" data-active={activeView === "agenda"} onClick={() => onView("agenda")} type="button"><List size={15} /><span>议程</span></button>
        <button aria-label="打开待排任务" data-active={activeContext === "inbox"} onClick={(event) => onContext("inbox", event.currentTarget)} type="button"><Clock3 size={15} /><span>待排</span></button>
        <button aria-label="新建事件" className="primaryButton" data-active={activeContext === "composer"} onClick={(event) => onContext("composer", event.currentTarget)} type="button"><Plus size={15} /><span>新建</span></button>
      </div>
    </header>
  );
}
