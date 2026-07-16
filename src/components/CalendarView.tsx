"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { CalendarDays, List } from "lucide-react";
import type { CalendarSummary } from "@/lib/types";

export function CalendarView({ summaries }: { summaries: CalendarSummary[] }) {
  const router = useRouter();
  const mobile = useSyncExternalStore(subscribeMobile, readMobile, () => false);
  const [selectedView, setSelectedView] = useState<"calendar" | "list" | null>(null);
  const view = selectedView ?? (mobile ? "list" : "calendar");
  const events = summaries.flatMap((day) => {
    const eventsForDay = [];
    if (day.studyMinutes) eventsForDay.push({ title: `学习 ${day.studyMinutes}m`, date: day.date, className: "eventStudy" });
    if (day.assetCount) eventsForDay.push({ title: `资料 ${day.assetCount}`, date: day.date, className: "eventAsset" });
    if (day.reviewCount) eventsForDay.push({ title: `复习 ${day.reviewCount}`, date: day.date, className: "eventReview" });
    if (day.mistakeCount) eventsForDay.push({ title: `错题 ${day.mistakeCount}`, date: day.date, className: "eventMistake" });
    if (day.hasSummary) eventsForDay.push({ title: "已总结", date: day.date, className: "eventDone" });
    return eventsForDay;
  });

  return (
    <div className="calendarShell">
      <div className="calendarViewSwitch" aria-label="日历视图">
        <button className={view === "calendar" ? "active" : ""} onClick={() => setSelectedView("calendar")} type="button"><CalendarDays size={15} />月历</button>
        <button className={view === "list" ? "active" : ""} onClick={() => setSelectedView("list")} type="button"><List size={15} />列表</button>
      </div>
      {view === "calendar" ? <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
        height="auto"
        events={events}
        dateClick={(info) => router.push(`/day/${info.dateStr}`)}
        eventClick={(info) => router.push(`/day/${info.event.startStr.slice(0, 10)}`)}
      /> : (
        <div className="calendarAgenda">
          {[...summaries].sort((a, b) => b.date.localeCompare(a.date)).map((day) => (
            <button key={day.date} onClick={() => router.push(`/day/${day.date}`)} type="button">
              <time>{day.date}</time>
              <span>{day.studyMinutes ? `${day.studyMinutes} 分钟学习` : "暂无学习时长"}</span>
              <small>{day.reviewCount} 复习 · {day.mistakeCount} 错题 · {day.assetCount} 资料</small>
              {day.hasSummary ? <b>已总结</b> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 760px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function readMobile() {
  return window.matchMedia("(max-width: 760px)").matches;
}
