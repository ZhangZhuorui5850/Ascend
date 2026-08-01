"use client";

import type { ReactNode } from "react";
import { PlannerStatusIndicator, type PlannerMutationStatus } from "@/components/ui/PlannerStatusIndicator";
import type { CalendarContext } from "@/components/calendar/CalendarToolbar";
import styles from "@/styles/planner/calendar.module.css";

const TITLES: Record<CalendarContext, { title: string; description: string }> = {
  inbox: { title: "待排任务", description: "选择日期与开始时间" },
  composer: { title: "新建事件", description: "创建独立日历事件" },
  event: { title: "事件详情", description: "编辑、改期与提醒" },
};

export function CalendarContextContent({
  children,
  context,
  mutationStatus,
}: {
  children: ReactNode;
  context: CalendarContext;
  mutationStatus: PlannerMutationStatus;
}) {
  return (
    <>
      <header className={styles.contextHeader}>
        <div><h2>{TITLES[context].title}</h2><small>{TITLES[context].description}</small></div>
        <PlannerStatusIndicator status={mutationStatus} />
      </header>
      <div className={styles.contextBody}>{children}</div>
    </>
  );
}

export function CalendarContextRail({
  children,
  context,
  mutationStatus,
}: {
  children: ReactNode;
  context: CalendarContext;
  mutationStatus: PlannerMutationStatus;
}) {
  return (
    <aside aria-label="日历上下文" className={styles.contextRail}>
      <CalendarContextContent context={context} mutationStatus={mutationStatus}>
        {children}
      </CalendarContextContent>
    </aside>
  );
}
