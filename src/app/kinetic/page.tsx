import { KineticHome, type KineticHomeData } from "@/components/kinetic/KineticHome";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { dateKeyInTimeZone, utcToZonedDateTime } from "@/lib/planner/time";
import { getPluginTodayRecommendations } from "@/lib/plugins/runtime";
import { getSubjectOverviews } from "@/lib/repo/knowledge";
import { ensurePlannerDefaults } from "@/lib/repo/planner-defaults";
import { listTaskView } from "@/lib/repo/planner-tasks";
import { getSettings } from "@/lib/repo/settings";
import { getHomeSnapshot, getLearningAnalytics, getWeeklyCapacity } from "@/lib/repo/stats";

export const dynamic = "force-dynamic";

export default async function KineticHomePage() {
  const access = await requirePageWorkspace("/kinetic");
  const db = getDb();
  const today = todayKey();
  ensurePlannerDefaults(db, access);
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?").get(access.workspaceId) as { timezone: string };
  const settings = getSettings(db, access);
  const snapshot = getHomeSnapshot(db, access, today);
  const analytics = getLearningAnalytics(db, access, today);
  const capacity = getWeeklyCapacity(db, access, { today, targetMinutes: settings.weeklyMinutes });
  const subjects = getSubjectOverviews(db, access, today)
    .filter((subject) => !settings.enabledSubjectCodes.length || settings.enabledSubjectCodes.includes(subject.code));
  const todayTasks = listTaskView(db, access, { view: "today", today, limit: 80 });
  const completedToday = listTaskView(db, access, { view: "completed", today, limit: 300 })
    .filter((task) => task.completed_at && dateKeyInTimeZone(task.completed_at, workspace.timezone) === today);
  const pluginSignals = getPluginTodayRecommendations(db, access, today);

  const data: KineticHomeData = {
    displayName: access.displayName,
    today,
    learningGoal: settings.learningGoal,
    momentum: capacity.completionPercent,
    weekly: {
      targetMinutes: capacity.targetMinutes,
      studiedMinutes: capacity.studiedMinutes,
      plannedMinutes: capacity.plannedMinutes,
      unallocatedMinutes: capacity.unallocatedMinutes,
      overloadMinutes: capacity.overloadMinutes,
      dailyMinutes: analytics.dailyMinutes,
    },
    summary: {
      dueReviews: snapshot.dueReviews,
      dueMistakes: snapshot.dueMistakes,
      studyMinutes: snapshot.today.studyMinutes,
      reviewsDone: snapshot.today.reviews,
      mistakesLogged: snapshot.today.mistakes,
      streak: snapshot.streak,
      openTasks: todayTasks.length,
      doneTasks: completedToday.length,
    },
    missions: todayTasks.map((task, index) => ({
      id: task.id,
      version: task.version,
      index: String(index + 1).padStart(2, "0"),
      title: task.title,
      subject: task.subject_code || "未关联科目",
      duration: task.estimated_minutes,
      priority: task.priority,
      scheduledTime: task.scheduled_start_at
        ? utcToZonedDateTime(task.scheduled_start_at, task.scheduled_timezone || workspace.timezone).time.slice(0, 5)
        : null,
      dueDate: task.due_date,
      completed: false,
    })),
    subjects: subjects.map((subject, index) => ({
      code: subject.code,
      name: subject.name,
      mastery: subject.avgMastery,
      due: subject.dueCount,
      mistakes: subject.openMistakes,
      points: subject.pointCount,
      position: orbitPosition(index, subjects.length),
    })),
    echoes: analytics.weakPoints.slice(0, 6).map((point) => ({
      id: point.id,
      subjectCode: point.subjectCode,
      title: point.title,
      tierName: point.tierName,
      mastery: point.mastery,
      due: Boolean(point.nextReview && point.nextReview <= today),
      reasons: point.reasons,
      openMistakes: point.openMistakes,
    })),
    exams: settings.examCountdowns
      .map((exam) => ({ ...exam, days: daysUntil(today, exam.date) }))
      .filter((exam): exam is typeof exam & { days: number } => exam.days !== null && exam.days >= 0)
      .sort((a, b) => a.days - b.days)
      .slice(0, 3),
    pluginSignals: pluginSignals.map((signal) => ({
      key: signal.key,
      label: signal.label,
      title: signal.title,
      description: signal.description,
      count: signal.count,
      href: `/kinetic${signal.href}`,
    })),
  };

  return <KineticHome data={data} />;
}

function daysUntil(today: string, date: string): number | null {
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

function orbitPosition(index: number, total: number) {
  const angle = ((index / Math.max(total, 1)) * Math.PI * 2) - Math.PI / 2;
  return {
    x: Math.round(50 + Math.cos(angle) * 38),
    y: Math.round(50 + Math.sin(angle) * 38),
  };
}
