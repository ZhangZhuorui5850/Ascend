"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, {
  type DateClickArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import zhCnLocale from "@fullcalendar/core/locales/zh-cn";
import type {
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import type { RefObject } from "react";
import { CalendarEventContent } from "@/components/calendar/CalendarEventContent";
import styles from "@/styles/planner/calendar.module.css";

export function CalendarCanvas({
  calendarRef,
  events,
  onDateClick,
  onDatesSet,
  onEventClick,
  onEventDrop,
  onEventResize,
  timeZone,
}: {
  calendarRef: RefObject<FullCalendar | null>;
  events: EventInput[];
  onDateClick: (info: DateClickArg) => void;
  onDatesSet: (info: DatesSetArg) => void;
  onEventClick: (info: EventClickArg) => void;
  onEventDrop: (info: EventDropArg) => void;
  onEventResize: (info: EventResizeDoneArg) => void;
  timeZone: string;
}) {
  return (
    <div className={styles.calendarCanvas}>
      <FullCalendar
        allDayText="全天"
        businessHours={{ daysOfWeek: [1, 2, 3, 4, 5, 6, 0], startTime: "07:00", endTime: "23:00" }}
        dateClick={onDateClick}
        datesSet={onDatesSet}
        dayMaxEvents={2}
        editable
        eventClick={onEventClick}
        eventContent={(info) => <CalendarEventContent {...info} />}
        eventDrop={onEventDrop}
        eventDurationEditable
        eventResize={onEventResize}
        events={events}
        firstDay={1}
        headerToolbar={false}
        height="auto"
        initialView="dayGridMonth"
        locale={zhCnLocale}
        nowIndicator
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin]}
        ref={calendarRef}
        scrollTime="07:30:00"
        slotDuration="00:30:00"
        timeZone={timeZone}
      />
    </div>
  );
}
