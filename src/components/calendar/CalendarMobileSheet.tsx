"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { CalendarContextContent } from "@/components/calendar/CalendarContextRail";
import type { CalendarContext } from "@/components/calendar/CalendarToolbar";
import { PlannerDrawer } from "@/components/ui/PlannerDrawer";
import type { PlannerMutationStatus } from "@/components/ui/PlannerStatusIndicator";
import styles from "@/styles/planner/calendar.module.css";

export function CalendarMobileSheet({
  children,
  context,
  mutationStatus,
  onOpenChange,
  open,
  triggerRef,
  viewport,
}: {
  children: (initialFocus: RefObject<HTMLInputElement | null>) => ReactNode;
  context: CalendarContext;
  mutationStatus: PlannerMutationStatus;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  viewport: "tablet" | "mobile";
}) {
  const initialFocus = useRef<HTMLInputElement | null>(null);
  return (
    <PlannerDrawer
      description="查看待排任务、创建事件或编辑当前事件"
      initialFocus={initialFocus}
      onOpenChange={onOpenChange}
      open={open}
      surface={viewport === "mobile" ? "sheet" : "drawer"}
      title="日历上下文"
      triggerRef={triggerRef}
    >
      <div className={styles.mobileSheetBody}>
        <CalendarContextContent context={context} mutationStatus={mutationStatus}>
          {children(initialFocus)}
        </CalendarContextContent>
      </div>
    </PlannerDrawer>
  );
}
