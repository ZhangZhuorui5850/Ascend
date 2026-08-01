"use client";

import { CalendarClock, Trash2 } from "lucide-react";
import type { FormEvent, RefObject } from "react";
import { PlannerCollapsible } from "@/components/ui/PlannerCollapsible";
import { PlannerDateTimeField, PlannerField, PlannerPropertyRow, PlannerSelect } from "@/components/ui/PlannerFormFields";
import {
  PlannerStatusIndicator,
  type PlannerMutationStatus,
} from "@/components/ui/PlannerStatusIndicator";
import type {
  CalendarEvent,
  PlannerBusyStatus,
  PlannerCalendar,
  PlannerEventKind,
  PlannerReminder,
} from "@/lib/planner/types";
import {
  plannerReminderChannelLabel,
  plannerReminderStatusLabel,
} from "@/lib/planner/presentation";
import styles from "@/styles/planner/calendar.module.css";

export type CalendarEventMetadata = {
  title: string;
  description: string;
  location: string;
  calendarId: string;
  kind: PlannerEventKind;
  busyStatus: PlannerBusyStatus;
  recurrenceRule: string | null;
};

export type CalendarEventReschedule = {
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
};

export function CalendarEventInspector({
  calendars,
  event,
  mutationStatus,
  onAddReminder,
  onCancelReminder,
  onDelete,
  onReschedule,
  onSave,
  reminders,
  timeZone,
  titleInputRef,
}: {
  calendars: PlannerCalendar[];
  event: CalendarEvent;
  mutationStatus: PlannerMutationStatus;
  onAddReminder: (input: { offsetMinutes: number; channel: "in_app" | "web_push" }) => void;
  onCancelReminder: (reminder: PlannerReminder) => void;
  onDelete: () => void;
  onReschedule: (input: CalendarEventReschedule) => void;
  onSave: (input: CalendarEventMetadata) => void;
  reminders: PlannerReminder[];
  timeZone: string;
  titleInputRef?: RefObject<HTMLInputElement | null>;
}) {
  const parts = eventDateTimeParts(event, timeZone);

  function submit(formEvent: FormEvent<HTMLFormElement>): void {
    formEvent.preventDefault();
    const data = new FormData(formEvent.currentTarget);
    onSave({
      title: String(data.get("title") ?? "").trim(),
      description: String(data.get("description") ?? ""),
      location: String(data.get("location") ?? ""),
      calendarId: String(data.get("calendarId") ?? event.calendar_id),
      kind: String(data.get("kind")) as PlannerEventKind,
      busyStatus: String(data.get("busyStatus")) as PlannerBusyStatus,
      recurrenceRule: String(data.get("recurrenceRule") ?? "").trim() || null,
    });
  }

  function reschedule(formEvent: FormEvent<HTMLFormElement>): void {
    formEvent.preventDefault();
    const data = new FormData(formEvent.currentTarget);
    onReschedule({
      allDay: data.get("allDay") === "on",
      startDate: String(data.get("startDate") ?? parts.startDate),
      endDate: String(data.get("endDate") ?? parts.endDate),
      startTime: String(data.get("startTime") ?? parts.startTime),
      endTime: String(data.get("endTime") ?? parts.endTime),
    });
  }

  function addReminder(formEvent: FormEvent<HTMLFormElement>): void {
    formEvent.preventDefault();
    const data = new FormData(formEvent.currentTarget);
    onAddReminder({
      offsetMinutes: Number(data.get("offsetMinutes")),
      channel: String(data.get("channel")) as "in_app" | "web_push",
    });
  }

  return (
    <div className={styles.inspector}>
      <PlannerStatusIndicator status={mutationStatus} />
      <form className={styles.inspector} key={`${event.id}:${event.version}`} onSubmit={submit}>
        <PlannerField label="标题"><input defaultValue={event.title} name="title" ref={titleInputRef} required /></PlannerField>
        <div className={styles.propertyList}>
        <PlannerPropertyRow label="日历"><PlannerSelect defaultValue={event.calendar_id} name="calendarId">
          {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
        </PlannerSelect></PlannerPropertyRow>
        <div className={styles.facts}>
          <span>{event.all_day ? `${event.start_date} → ${event.end_date_exclusive}` : formatEventInstant(event)}</span>
          <span>{event.timezone ?? "仅日期"}</span>
        </div>
        <PlannerPropertyRow label="地点"><input defaultValue={event.location} name="location" /></PlannerPropertyRow>
        </div>
        <PlannerCollapsible label="说明与分类" summary={event.description || `${eventKindLabel(event.kind)} · ${event.busy_status === "busy" ? "忙碌" : "空闲"}`}>
          <div className={styles.inspector}>
            <PlannerField label="说明"><textarea defaultValue={event.description} name="description" rows={4} /></PlannerField>
            <div className={styles.propertyList}>
              <PlannerPropertyRow label="类型"><PlannerSelect defaultValue={event.kind} name="kind">
                <option value="event">事件</option><option value="class">课程</option><option value="exam">考试</option>
                <option value="meeting">会议</option><option value="focus">专注</option><option value="milestone">里程碑</option>
              </PlannerSelect></PlannerPropertyRow>
              <PlannerPropertyRow label="忙闲"><PlannerSelect defaultValue={event.busy_status} name="busyStatus">
                <option value="busy">忙碌</option><option value="free">空闲</option>
              </PlannerSelect></PlannerPropertyRow>
            </div>
            <PlannerField label="重复规则"><input defaultValue={event.recurrence_rule ?? ""} name="recurrenceRule" /></PlannerField>
          </div>
        </PlannerCollapsible>
        <button className="primaryButton" type="submit">保存事件</button>
      </form>
      <PlannerCollapsible defaultOpen label="移动到日期/时间" summary="键盘与触控改期入口">
        <form className={styles.inspector} key={`${event.id}:${event.version}:reschedule`} onSubmit={reschedule}>
          <label className={styles.allDay}><input defaultChecked={Boolean(event.all_day)} name="allDay" type="checkbox" />全天事件</label>
          <div className={styles.propertyList}>
            <PlannerPropertyRow label="开始日期"><PlannerDateTimeField defaultValue={parts.startDate} name="startDate" required type="date" /></PlannerPropertyRow>
            <PlannerPropertyRow label="结束日期"><PlannerDateTimeField defaultValue={parts.endDate} name="endDate" required type="date" /></PlannerPropertyRow>
            <PlannerPropertyRow label="开始时间"><PlannerDateTimeField defaultValue={parts.startTime} name="startTime" type="time" /></PlannerPropertyRow>
            <PlannerPropertyRow label="结束时间"><PlannerDateTimeField defaultValue={parts.endTime} name="endTime" type="time" /></PlannerPropertyRow>
          </div>
          <button type="submit"><CalendarClock size={14} />更新日期与时间</button>
        </form>
      </PlannerCollapsible>
      <PlannerCollapsible label="提醒" summary={reminders.length ? `${reminders.length} 条提醒` : "未设置"}>
        <div className={styles.reminderList}>
          {reminders.map((reminder) => (
            <div className={styles.reminderItem} key={reminder.id}>
              <span>{reminder.offset_minutes ?? 0} 分钟 · {plannerReminderChannelLabel(reminder.channel)} · {plannerReminderStatusLabel(reminder.status)}</span>
              {reminder.status === "pending" || reminder.status === "failed" ? (
                <button onClick={() => onCancelReminder(reminder)} type="button">取消</button>
              ) : null}
            </div>
          ))}
          <form className={styles.propertyList} onSubmit={addReminder}>
            <PlannerPropertyRow label="提前量"><PlannerSelect defaultValue="-10" name="offsetMinutes">
              <option value="-1440">提前 1 天</option><option value="-60">提前 1 小时</option>
              <option value="-10">提前 10 分钟</option><option value="0">准时</option>
            </PlannerSelect></PlannerPropertyRow>
            <PlannerPropertyRow label="渠道"><PlannerSelect name="channel"><option value="in_app">应用内</option><option value="web_push">Web Push</option></PlannerSelect></PlannerPropertyRow>
            <button type="submit">添加提醒</button>
          </form>
        </div>
      </PlannerCollapsible>
      <button className={styles.dangerButton} onClick={onDelete} type="button"><Trash2 size={15} />删除事件</button>
    </div>
  );
}

function eventDateTimeParts(event: CalendarEvent, timeZone: string) {
  if (event.all_day) {
    return {
      startDate: event.start_date ?? "",
      endDate: event.end_date_exclusive ?? "",
      startTime: "09:00",
      endTime: "10:00",
    };
  }
  return {
    ...instantParts(event.start_at, event.timezone ?? timeZone, "start"),
    ...instantParts(event.end_at, event.timezone ?? timeZone, "end"),
  };
}

function instantParts(value: string | null, timeZone: string, prefix: "start" | "end") {
  if (!value) return { [`${prefix}Date`]: "", [`${prefix}Time`]: "" };
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    [`${prefix}Date`]: `${values.year}-${values.month}-${values.day}`,
    [`${prefix}Time`]: `${values.hour}:${values.minute}`,
  };
}

function formatEventInstant(event: CalendarEvent): string {
  if (!event.start_at || !event.end_at) return "";
  const start = instantParts(event.start_at, event.timezone ?? "UTC", "start");
  const end = instantParts(event.end_at, event.timezone ?? "UTC", "end");
  return `${start.startDate} ${start.startTime} → ${end.endDate} ${end.endTime}`;
}

function eventKindLabel(kind: PlannerEventKind): string {
  return ({ event: "事件", class: "课程", exam: "考试", meeting: "会议", focus: "专注", milestone: "里程碑" })[kind];
}
