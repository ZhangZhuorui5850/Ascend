import { notFound } from "next/navigation";
import { KineticDay } from "@/components/kinetic/KineticDay";
import { assertDateKey, shiftDateKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { dateKeyInTimeZone, utcToZonedDateTime } from "@/lib/planner/time";
import { getDay, getTomorrowPlan } from "@/lib/repo/days";
import { getCaptureHierarchy, getSubjects } from "@/lib/repo/knowledge";
import { ensurePlannerDefaults } from "@/lib/repo/planner-defaults";
import { listTaskLists } from "@/lib/repo/planner-lists";
import { listPlannerTasks } from "@/lib/repo/planner-tasks";
import { listRecentMistakeCauses } from "@/lib/repo/reviews";
import { getSettings } from "@/lib/repo/settings";

export const dynamic = "force-dynamic";

export default async function KineticDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  try {
    assertDateKey(date);
  } catch {
    notFound();
  }

  const access = await requirePageWorkspace(`/kinetic/day/${date}`);
  const db = getDb();
  ensurePlannerDefaults(db, access);
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?")
    .get(access.workspaceId) as { timezone: string };
  const today = dateKeyInTimeZone(new Date(), workspace.timezone);
  const isToday = date === today;
  const settings = getSettings(db, access);
  const subjects = getSubjects(db, access);
  const enabledSubjectCodes = settings.enabledSubjectCodes.length
    ? settings.enabledSubjectCodes
    : subjects.map((subject) => subject.code);
  const sprintSubjectCodes = [...new Set(settings.examCountdowns.flatMap((exam) => {
    const days = Math.round((Date.parse(`${exam.date}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
    if (days < 0 || days > 14) return [];
    return exam.subjectCode ? [exam.subjectCode] : enabledSubjectCodes;
  }))];
  const day = getDay(db, access, date, {
    reviewLimit: settings.dailyReviewLimit,
    sprintSubjectCodes,
    includeReviewQueue: isToday,
  });
  const tasks = listPlannerTasks(db, access).filter((task) => {
    const scheduledDate = task.scheduled_start_at && task.scheduled_timezone
      ? utcToZonedDateTime(task.scheduled_start_at, task.scheduled_timezone).date
      : null;
    const dueDate = task.due_date
      ?? (task.due_at && task.due_timezone ? utcToZonedDateTime(task.due_at, task.due_timezone).date : null);
    return scheduledDate === date || dueDate === date;
  });
  const yesterday = shiftDateKey(date, -1);

  return (
    <KineticDay
      captureHierarchy={getCaptureHierarchy(db, access)}
      dailyReviewLimit={settings.dailyReviewLimit}
      date={date}
      day={day}
      isToday={isToday}
      lists={listTaskLists(db, access)}
      offlineScope={access.workspaceId}
      recentCauses={listRecentMistakeCauses(db, access)}
      sprintSubjectCodes={sprintSubjectCodes}
      tasks={tasks}
      timeZone={workspace.timezone}
      today={today}
      yesterdayPlan={isToday ? getTomorrowPlan(db, access, yesterday) : ""}
    />
  );
}
