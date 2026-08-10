import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./calendar/CalendarWorkspace.tsx", import.meta.url), "utf8");
const compatibility = readFileSync(new URL("./CalendarView.tsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("./calendar/CalendarCanvas.tsx", import.meta.url), "utf8");
const eventContent = readFileSync(new URL("./calendar/CalendarEventContent.tsx", import.meta.url), "utf8");
const dayPopover = readFileSync(new URL("./calendar/CalendarDayPopover.tsx", import.meta.url), "utf8");
const contextRail = readFileSync(new URL("./calendar/CalendarContextRail.tsx", import.meta.url), "utf8");
const mobileSheet = readFileSync(new URL("./calendar/CalendarMobileSheet.tsx", import.meta.url), "utf8");
const inspector = readFileSync(new URL("./calendar/CalendarEventInspector.tsx", import.meta.url), "utf8");
const composer = readFileSync(new URL("./calendar/CalendarEventComposer.tsx", import.meta.url), "utf8");
const inbox = readFileSync(new URL("./calendar/CalendarTaskInbox.tsx", import.meta.url), "utf8");
const calendarStyles = readFileSync(new URL("../styles/planner/calendar.module.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/calendar/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles/summit.css", import.meta.url), "utf8");
const plannerFields = readFileSync(new URL("./ui/PlannerFormFields.tsx", import.meta.url), "utf8");
const primitiveStyles = readFileSync(new URL("../styles/planner/primitives.module.css", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("calendar day schedule popover", () => {
  it("opens the lightweight day card from dates, events, and agenda rows", () => {
    expect(source).toContain("onDateClick={(info) => openDay");
    expect(source).toContain("openDay(day, info.el)");
    expect(source).toContain("onOpenDay={(day, trigger) => openDay(day, trigger)}");
    expect(dayPopover).toContain('from "@base-ui/react/popover"');
    expect(dayPopover).toContain("Popover.Portal");
    expect(dayPopover).toContain("finalFocus={() => popover.anchorElement}");
  });

  it("keeps task completion and full-detail navigation in the day card", () => {
    expect(source).toContain("toggleCalendarTaskAction");
    expect(source).toContain("expectedVersion: task.version");
    expect(source).toContain('applyOptimisticTask({ type: "patch"');
    expect(dayPopover).toContain('role="checkbox"');
    expect(dayPopover).toContain('href={`/day/${popover.day}`}');
    expect(dayPopover).toContain("进入当日详情");
    expect(source).not.toContain("router.refresh()");
  });

  it("supports quick task management (add/remove) inside the day card", () => {
    expect(source).toContain("createCalendarTaskAction");
    expect(source).toContain("deleteCalendarTaskAction");
    expect(source).toContain("useOptimistic(");
    expect(source).toContain("startTransition(");
    expect(dayPopover).toContain("calendarDayComposer");
    expect(dayPopover).toContain("calendarDayTaskRemove");
    expect(styles).toContain(".calendarDayComposer");
    expect(styles).toContain(".calendarDayTaskRemove");
  });

  it("keeps Calendar tasks on canonical UUID and versioned Planner mutations", () => {
    expect(page).toContain("listCanonicalCalendarTasks");
    expect(page).not.toContain("listCalendarTasks");
    expect(source).toContain("rescheduleCalendarTaskAction");
    expect(source).toContain("taskVersion");
    expect(source).not.toContain('from "@/app/actions/planner"');
    expect(source).not.toContain("Number(info.event.extendedProps.taskId)");
    expect(inbox).not.toContain('from "@/app/actions/planner"');
  });

  it("projects schedule items without loading activity summaries", () => {
    expect(page).not.toContain("getCalendarSummaries");
    expect(source).not.toContain("CalendarSummary");
    expect(source).not.toContain("activityEvents");
  });

  it("loads and mutates independent Planner events with optimistic recovery", () => {
    expect(page).toContain("listCalendarEventRange");
    expect(page).toContain("listPlannerCalendars");
    expect(source).toContain("/api/planner/events?");
    expect(source).toContain("createPlannerEventAction");
    expect(source).toContain("updatePlannerEventAction");
    expect(source).toContain("deletePlannerEventAction");
    expect(source).toContain("setCalendarEvents");
    expect(source).toContain("info.revert()");
    expect(source).toContain("endDateExclusive");
    expect(source).toContain("busyStatus");
    expect(source).toContain("location");
  });

  it("anchors and animates the card above or below the clicked date", () => {
    expect(styles).toContain(".calendarDayPopoverPositioner.above");
    expect(styles).toContain("calendar-popover-in-below");
    expect(styles).toContain("calendar-popover-in-above");
    expect(styles).toContain("--calendar-popover-arrow-x");
  });

  it("keeps CalendarView as a small compatibility entry over the split workspace", () => {
    expect(compatibility).toContain("CalendarWorkspace");
    expect(compatibility.split("\n").length).toBeLessThan(40);
    expect(source).toContain("CalendarOverview");
    expect(source).toContain("CalendarToolbar");
    expect(source).toContain("CalendarCanvas");
    expect(source).toContain("CalendarContextRail");
  });

  it("uses custom FullCalendar event content while FullCalendar owns positioning", () => {
    expect(canvas).toContain("eventContent");
    expect(canvas).toContain("CalendarEventContent");
    expect(eventContent).toContain("data-entity");
    expect(eventContent).not.toContain("motion/react");
    expect(calendarStyles).toContain(":global(.fc .fc-event)");
  });

  it("caps month-cell event rendering for dense calendar ranges", () => {
    expect(canvas).toContain("dayMaxEvents={2}");
  });

  it("moves one context into a desktop rail, tablet Drawer, or mobile Sheet", () => {
    expect(contextRail).toContain('aria-label="日历上下文"');
    expect(mobileSheet).toContain("PlannerDrawer");
    expect(mobileSheet).toContain('surface={viewport === "mobile" ? "sheet" : "drawer"}');
    expect(mobileSheet).toContain("triggerRef");
    expect(calendarStyles).toContain("@media (max-width: 1179px)");
    expect(calendarStyles).toContain("@media (max-width: 760px)");
    expect(source).toContain("handleContextOpenChange");
    expect(source).toContain("queueMicrotask");
    expect(source).toContain("contextTriggerRef.current?.isConnected");
    expect(source).toContain("contextTriggerRef.current.focus({ preventScroll: true })");
    expect(source).toContain("onOpenChange={handleContextOpenChange}");
    expect(source).not.toContain("onOpenChange={setContextOpen}");
  });

  it("does not share the global fixed ICP overlay with Calendar surfaces", () => {
    expect(globalStyles).toContain('body:has([data-planner-workspace="calendar"]) .icpFooter');
  });

  it("provides a click-based reschedule form through the same event Action", () => {
    expect(inspector).toContain("移动到日期/时间");
    expect(inspector).toContain("onReschedule");
    expect(source).toContain("rescheduleEvent");
    expect(source).toContain("updatePlannerEventAction");
    expect(source).toContain("localDateTimeToUtc");
  });

  it("defaults mobile presentation to agenda and keeps the event form in a Sheet", () => {
    expect(source).toContain('mobile ? "agenda" : "month"');
    expect(source).toContain("<CalendarAgenda");
    expect(calendarStyles).toContain(".calendarCanvas");
    expect(calendarStyles).toContain("display: none");
  });

  it("shares the Planner form primitives and fixed date/time presentation across Calendar contexts", () => {
    for (const component of [composer, inspector, inbox]) {
      expect(component).toContain('from "@/components/ui/PlannerFormFields"');
    }
    expect(composer).toContain("PlannerField");
    expect(composer).toContain("PlannerSelect");
    expect(composer).toContain("PlannerDateTimeField");
    expect(inspector).toContain("PlannerPropertyRow");
    expect(inbox).toContain("editing");
    expect(inbox).toContain("PlannerDateTimeField");
    expect(calendarStyles).toContain(".propertyList");
    expect(plannerFields).toContain("PlannerPropertyRow");
    expect(primitiveStyles).toMatch(/\.propertyRow input,[\s\S]*?background: transparent;/);
    expect(primitiveStyles).toMatch(/\.dateTimeField\s*\{[\s\S]*?background: transparent;/);
  });

  it("resets the event reschedule form when selection changes", () => {
    expect(inspector).toContain('key={`${event.id}:${event.version}:reschedule`}');
  });

  it("keeps overview as one quiet summary and leaves task scheduling compact until requested", () => {
    const overview = readFileSync(new URL("./calendar/CalendarOverview.tsx", import.meta.url), "utf8");
    expect(overview).not.toContain("overviewItem");
    expect(overview).toContain("已安排");
    expect(inbox).toContain('editing ? <div className={styles.scheduleControls}>');
    expect(calendarStyles).toContain(".scheduleToggle");
  });

  it("uses Chinese product labels for task duration, date-only events, and reminder enums", () => {
    expect(inbox).toContain("{task.estimated_minutes} 分钟");
    expect(inbox).not.toContain("{task.estimated_minutes} min");
    expect(inspector).toContain('event.timezone ?? "仅日期"');
    expect(inspector).not.toContain("date-only");
    expect(inspector).toContain("plannerReminderChannelLabel(reminder.channel)");
    expect(inspector).toContain("plannerReminderStatusLabel(reminder.status)");
  });
});
