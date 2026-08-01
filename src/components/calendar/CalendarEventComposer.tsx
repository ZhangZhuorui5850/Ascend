"use client";

import { Plus } from "lucide-react";
import { useState, type FormEvent, type RefObject } from "react";
import { PlannerCollapsible } from "@/components/ui/PlannerCollapsible";
import { PlannerDateTimeField, PlannerField, PlannerPropertyRow, PlannerSelect } from "@/components/ui/PlannerFormFields";
import type {
  PlannerBusyStatus,
  PlannerCalendar,
  PlannerEventKind,
} from "@/lib/planner/types";
import styles from "@/styles/planner/calendar.module.css";

export type NewCalendarEventDraft = {
  calendarId: string;
  title: string;
  description: string;
  location: string;
  kind: PlannerEventKind;
  busyStatus: PlannerBusyStatus;
  recurrenceRule: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
};

export function CalendarEventComposer({
  calendars,
  onCreate,
  timeZone,
  titleInputRef,
}: {
  calendars: PlannerCalendar[];
  onCreate: (input: NewCalendarEventDraft) => void;
  timeZone: string;
  titleInputRef?: RefObject<HTMLInputElement | null>;
}) {
  const today = dateKeyForZone(new Date(), timeZone);
  const [title, setTitle] = useState("");
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [kind, setKind] = useState<PlannerEventKind>("event");
  const [busyStatus, setBusyStatus] = useState<PlannerBusyStatus>("busy");
  const [recurrenceRule, setRecurrenceRule] = useState("");

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || !calendarId) return;
    onCreate({
      calendarId,
      title: cleanTitle,
      description: "",
      location: location.trim(),
      kind,
      busyStatus,
      recurrenceRule,
      allDay,
      startDate,
      endDate: allDay && endDate <= startDate ? shiftLocalDate(startDate, 1) : endDate,
      startTime,
      endTime,
    });
    setTitle("");
    setLocation("");
  }

  return (
    <form className={styles.composer} onSubmit={submit}>
      <PlannerField label="标题">
        <input onChange={(event) => setTitle(event.target.value)} ref={titleInputRef} required value={title} />
      </PlannerField>
      <div className={styles.propertyList}>
      <PlannerPropertyRow label="日历">
        <PlannerSelect onChange={(event) => setCalendarId(event.target.value)} value={calendarId}>
          {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
        </PlannerSelect>
      </PlannerPropertyRow>
      <label className={styles.allDay}>
        <input checked={allDay} onChange={(event) => setAllDay(event.target.checked)} type="checkbox" />
        全天事件
      </label>
        <PlannerPropertyRow label="开始日期"><PlannerDateTimeField onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></PlannerPropertyRow>
        <PlannerPropertyRow label={allDay ? "结束日期（不含）" : "结束日期"}><PlannerDateTimeField onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></PlannerPropertyRow>
        {!allDay ? (
          <>
            <PlannerPropertyRow label="开始时间"><PlannerDateTimeField onChange={(event) => setStartTime(event.target.value)} type="time" value={startTime} /></PlannerPropertyRow>
            <PlannerPropertyRow label="结束时间"><PlannerDateTimeField onChange={(event) => setEndTime(event.target.value)} type="time" value={endTime} /></PlannerPropertyRow>
          </>
        ) : null}
      </div>
      <PlannerCollapsible label="更多字段" summary={location || recurrenceRule ? "已有地点或重复规则" : "地点、类型、忙闲和重复"}>
        <div className={styles.composer}>
          <PlannerField label="地点"><input onChange={(event) => setLocation(event.target.value)} value={location} /></PlannerField>
          <div className={styles.propertyList}>
            <PlannerPropertyRow label="类型"><PlannerSelect onChange={(event) => setKind(event.target.value as PlannerEventKind)} value={kind}>
              <option value="event">事件</option>
              <option value="class">课程</option>
              <option value="exam">考试</option>
              <option value="meeting">会议</option>
              <option value="focus">专注</option>
              <option value="milestone">里程碑</option>
            </PlannerSelect></PlannerPropertyRow>
            <PlannerPropertyRow label="忙闲"><PlannerSelect onChange={(event) => setBusyStatus(event.target.value as PlannerBusyStatus)} value={busyStatus}>
              <option value="busy">忙碌</option>
              <option value="free">空闲</option>
            </PlannerSelect></PlannerPropertyRow>
          </div>
          <PlannerField label="重复规则"><input onChange={(event) => setRecurrenceRule(event.target.value)} placeholder="FREQ=WEEKLY;COUNT=12" value={recurrenceRule} /></PlannerField>
        </div>
      </PlannerCollapsible>
      <button className="primaryButton" type="submit"><Plus size={15} />添加事件</button>
    </form>
  );
}

function shiftLocalDate(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dateKeyForZone(date: Date, timeZone: string): string {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}
