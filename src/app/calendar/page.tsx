import { CalendarView } from "@/components/CalendarView";
import { getDb } from "@/lib/db";
import { dateKeyInTimeZone } from "@/lib/planner/time";
import { requirePageWorkspace } from "@/lib/page-auth";
import { listPlannerCalendars } from "@/lib/repo/planner-calendars";
import { ensurePlannerDefaults } from "@/lib/repo/planner-defaults";
import { listCalendarEventRange } from "@/lib/repo/planner-events";
import { listWorkspaceReminders } from "@/lib/repo/planner-reminders";
import { listCalendarTasks } from "@/lib/repo/planner";
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
    <div className="pageStack">
      <div className="pageHeader">
        <span className="eyebrow">LEARNING RHYTHM · 学习节奏</span>
        <h1>学习日历</h1>
        <p>点击日期查看当天待办。拖动任务可以改期，周视图中拉伸任务可以调整时间预算。</p>
      </div>
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
        tasks={listCalendarTasks(db, access)}
        timeZone={workspace.timezone}
      />
    </div>
  );
}
