"use client";

import { CalendarClock, CheckCircle2, Milestone } from "lucide-react";
import type { EventContentArg } from "@fullcalendar/core";
import styles from "@/styles/planner/calendar.module.css";

export function CalendarEventContent({ event, timeText }: EventContentArg) {
  const entityType = String(event.extendedProps.entityType ?? "event");
  const Icon = entityType === "milestone"
    ? Milestone
    : entityType === "task" && event.classNames.includes("eventTaskDone")
      ? CheckCircle2
      : CalendarClock;
  return (
    <span
      className={styles.eventContent}
      data-busy={event.classNames.includes("eventFree") ? "free" : "busy"}
      data-entity={entityType}
    >
      <Icon aria-hidden size={11} />
      {timeText ? <span className={styles.eventTime}>{timeText}</span> : null}
      <span className={styles.eventTitle}>{event.title}</span>
    </span>
  );
}
