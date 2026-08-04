import { KineticCalendar } from "@/components/kinetic/KineticCalendar";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { dateKeyInTimeZone } from "@/lib/planner/time";
import { listPlannerCalendars } from "@/lib/repo/planner-calendars";
import { ensurePlannerDefaults } from "@/lib/repo/planner-defaults";
import { listCalendarEventRange } from "@/lib/repo/planner-events";
import { listTaskLists } from "@/lib/repo/planner-lists";
import { listPlannerTasks } from "@/lib/repo/planner-tasks";
import { getSettings } from "@/lib/repo/settings";

export const dynamic = "force-dynamic";

export default async function KineticCalendarPage() {
  const access = await requirePageWorkspace("/kinetic/calendar");
  const db = getDb();
  ensurePlannerDefaults(db, access);
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?")
    .get(access.workspaceId) as { timezone: string };
  const now = new Date();
  const rangeStart = new Date(now.getTime() - 370 * 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(now.getTime() + 370 * 24 * 60 * 60 * 1000);

  return (
    <KineticCalendar
      calendars={listPlannerCalendars(db, access)}
      events={listCalendarEventRange(db, access, {
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
        startDate: dateKeyInTimeZone(rangeStart, workspace.timezone),
        endDateExclusive: dateKeyInTimeZone(rangeEnd, workspace.timezone),
      })}
      exams={getSettings(db, access).examCountdowns}
      lists={listTaskLists(db, access)}
      tasks={listPlannerTasks(db, access)}
      timeZone={workspace.timezone}
      today={dateKeyInTimeZone(now, workspace.timezone)}
    />
  );
}
