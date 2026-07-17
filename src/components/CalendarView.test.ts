import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./CalendarView.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/calendar/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles/summit.css", import.meta.url), "utf8");

describe("calendar day schedule popover", () => {
  it("opens the lightweight day card from dates, events, and agenda rows", () => {
    expect(source).toContain("dateClick={(info) => openDay");
    expect(source).toContain("openDay(day, info.el)");
    expect(source).toContain("onOpen(day, event.currentTarget)");
    expect(source).toContain('role="dialog"');
    expect(source).toContain("createPortal(<DaySchedulePopover");
    expect(source).toContain("document.body");
  });

  it("keeps task completion and full-detail navigation in the day card", () => {
    expect(source).toContain("toggleTaskAction");
    expect(source).toContain("completionOverrides");
    expect(source).toContain("setTaskCompletion(task.id, done)");
    expect(source).toContain('role="checkbox"');
    expect(source).toContain('href={`/day/${popover.day}`}');
    expect(source).toContain("进入当日详情");
    expect(source).not.toContain("router.refresh()");
  });

  it("supports quick task management (add/remove) inside the day card", () => {
    expect(source).toContain("addTaskAction");
    expect(source).toContain("deleteTaskAction");
    expect(source).toContain("useOptimistic(");
    expect(source).toContain("startTransition(");
    expect(source).toContain("calendarDayComposer");
    expect(source).toContain("calendarDayTaskRemove");
    expect(styles).toContain(".calendarDayComposer");
    expect(styles).toContain(".calendarDayTaskRemove");
  });

  it("projects schedule items without loading activity summaries", () => {
    expect(page).not.toContain("getCalendarSummaries");
    expect(source).not.toContain("CalendarSummary");
    expect(source).not.toContain("activityEvents");
  });

  it("anchors and animates the card above or below the clicked date", () => {
    expect(styles).toContain(".calendarDayPopoverPositioner.above");
    expect(styles).toContain("calendar-popover-in-below");
    expect(styles).toContain("calendar-popover-in-above");
    expect(styles).toContain("--calendar-popover-arrow-x");
  });
});
