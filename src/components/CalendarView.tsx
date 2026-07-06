"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useRouter } from "next/navigation";
import type { CalendarSummary } from "@/lib/types";

export function CalendarView({ summaries }: { summaries: CalendarSummary[] }) {
  const router = useRouter();
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
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
        height="auto"
        events={events}
        dateClick={(info) => router.push(`/day/${info.dateStr}`)}
        eventClick={(info) => router.push(`/day/${info.event.startStr.slice(0, 10)}`)}
      />
    </div>
  );
}
