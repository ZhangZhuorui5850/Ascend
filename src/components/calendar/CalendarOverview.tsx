"use client";

import styles from "@/styles/planner/calendar.module.css";

export function CalendarOverview({
  completed,
  exams,
  inbox,
  scheduledMinutes,
}: {
  completed: number;
  exams: number;
  inbox: number;
  scheduledMinutes: number;
}) {
  return (
    <section aria-label="日历概览" className={styles.overview}>
      <span>已安排 {scheduledMinutes} 分钟</span><span>待排 {inbox} 项</span><span>考试节点 {exams} 个</span><span>已完成 {completed} 项</span>
    </section>
  );
}
