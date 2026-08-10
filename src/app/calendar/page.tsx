import { CalendarView } from "@/components/CalendarView";
import { PlannerShell } from "@/components/planner/PlannerShell";
import { getDb } from "@/lib/db";
import { dateKeyInTimeZone } from "@/lib/planner/time";
import { requirePageWorkspace } from "@/lib/page-auth";
import { listPlannerCalendars } from "@/lib/repo/planner-calendars";
import { ensurePlannerDefaults } from "@/lib/repo/planner-defaults";
import { listCalendarEventRange } from "@/lib/repo/planner-events";
import { listWorkspaceReminders } from "@/lib/repo/planner-reminders";
import { listCanonicalCalendarTasks } from "@/lib/repo/planner-calendar-tasks";
import { getSettings } from "@/lib/repo/settings";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const access = await requirePageWorkspace("/calendar");
  const db = getDb();
  ensurePlannerDefaults(db, access);
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?")
    .get(access.workspaceId) as { timezone: string };
  const now = new Date();
  const rangeStart = new Date(now.getTime() - 370 * 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(now.getTime() + 370 * 24 * 60 * 60 * 1000);

  return (
    <PlannerShell
      active="calendar"
      description="查看任务与事件的时间分配；拖动任务可改期，拉伸可调整时间预算。"
      title="日历"
    >
      <CalendarView
        calendars={listPlannerCalendars(db, access)}
        exams={getSettings(db, access).examCountdowns}
        plannerEvents={listCalendarEventRange(db, access, {
          start: rangeStart.toISOString(),
          end: rangeEnd.toISOString(),
          startDate: dateKeyInTimeZone(rangeStart, workspace.timezone),
          endDateExclusive: dateKeyInTimeZone(rangeEnd, workspace.timezone),
        })}
        reminders={listWorkspaceReminders(db, access)}
        tasks={listCanonicalCalendarTasks(db, access, workspace.timezone)}
        timeZone={workspace.timezone}
      />
    </PlannerShell>
  );
}
