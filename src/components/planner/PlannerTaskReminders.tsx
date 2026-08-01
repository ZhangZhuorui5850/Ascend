"use client";

import type { FormEvent } from "react";
import type { PlannerReminder } from "@/lib/planner/types";
import {
  plannerReminderAnchorLabel,
  plannerReminderChannelLabel,
  plannerReminderStatusLabel,
} from "@/lib/planner/presentation";
import styles from "@/styles/planner/tasks.module.css";

export function PlannerTaskReminders({
  onAdd,
  onCancel,
  onEnablePush,
  reminders,
}: {
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: (reminder: PlannerReminder) => void;
  onEnablePush: () => void;
  reminders: PlannerReminder[];
}) {
  return (
    <div className={styles.sectionStack}>
      {reminders.map((reminder) => (
        <div className={styles.reminderItem} key={reminder.id}>
          <span>{plannerReminderAnchorLabel(reminder.anchor)} · {reminder.offset_minutes ?? 0} 分钟 · {plannerReminderChannelLabel(reminder.channel)} · {plannerReminderStatusLabel(reminder.status)}</span>
          {reminder.status === "pending" || reminder.status === "failed" ? (
            <button onClick={() => onCancel(reminder)} type="button">取消</button>
          ) : null}
        </div>
      ))}
      <form className={styles.sectionForm} onSubmit={onAdd}>
        <select aria-label="提醒锚点" name="anchor">
          <option value="due">到期时间</option>
          <option value="scheduled_start">计划开始</option>
        </select>
        <select aria-label="提醒提前量" defaultValue="-10" name="offsetMinutes">
          <option value="-1440">提前 1 天</option>
          <option value="-60">提前 1 小时</option>
          <option value="-10">提前 10 分钟</option>
          <option value="0">准时</option>
        </select>
        <select aria-label="提醒渠道" name="channel">
          <option value="in_app">应用内</option>
          <option value="web_push">Web Push</option>
        </select>
        <button type="submit">添加提醒</button>
      </form>
      <button onClick={onEnablePush} type="button">启用此设备 Push</button>
    </div>
  );
}
