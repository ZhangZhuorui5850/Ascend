import type Database from "better-sqlite3";
import { buildCalendarSummaries } from "../calendar-summary";
import { assertDateKey, shiftDateKey } from "../dates";
import type { CalendarSummary } from "../types";

export type DaySnapshot = {
  assets: number;
  studyMinutes: number;
  reviews: number;
  mistakes: number;
};

export function getDaySnapshot(db: Database.Database, date: string): DaySnapshot {
  assertDateKey(date);
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM assets WHERE day = @date) AS assets,
      (SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions WHERE day = @date) AS studyMinutes,
      (SELECT COUNT(*) FROM review_events WHERE day = @date) AS reviews,
      (SELECT COUNT(*) FROM mistakes WHERE day = @date) AS mistakes
  `).get({ date }) as DaySnapshot;
}

/** 连续学习天数：从今天（或昨天）往回数，有任意学习行为的连续天数。 */
export function getStudyStreak(db: Database.Database, today: string): number {
  assertDateKey(today);
  const rows = db.prepare(`
    SELECT DISTINCT day FROM (
      SELECT day FROM study_sessions
      UNION SELECT day FROM review_events
      UNION SELECT day FROM mistakes
      UNION SELECT day FROM assets
      UNION SELECT day FROM day_tasks WHERE done = 1
    )
    WHERE day <= ?
    ORDER BY day DESC
    LIMIT 400
  `).all(today) as Array<{ day: string }>;
  const active = new Set(rows.map((row) => row.day));

  let streak = 0;
  let cursor = today;
  // 今天还没学不打断连击，从昨天起算。
  if (!active.has(cursor)) cursor = shiftDateKey(cursor, -1);
  while (active.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

export type HomeSnapshot = {
  today: DaySnapshot;
  dueReviews: number;
  dueMistakes: number;
  openTasks: number;
  doneTasks: number;
  streak: number;
};

export function getHomeSnapshot(db: Database.Database, today: string): HomeSnapshot {
  assertDateKey(today);
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM knowledge_points WHERE next_review IS NOT NULL AND next_review <= @today) AS dueReviews,
      (SELECT COUNT(*) FROM mistakes WHERE graduated = 0 AND next_review IS NOT NULL AND next_review <= @today) AS dueMistakes,
      (SELECT COUNT(*) FROM day_tasks WHERE day = @today AND done = 0) AS openTasks,
      (SELECT COUNT(*) FROM day_tasks WHERE day = @today AND done = 1) AS doneTasks
  `).get({ today }) as { dueReviews: number; dueMistakes: number; openTasks: number; doneTasks: number };

  return {
    today: getDaySnapshot(db, today),
    dueReviews: counts.dueReviews,
    dueMistakes: counts.dueMistakes,
    openTasks: counts.openTasks,
    doneTasks: counts.doneTasks,
    streak: getStudyStreak(db, today),
  };
}

export function getCalendarSummaries(db: Database.Database): CalendarSummary[] {
  const days = db.prepare("SELECT date, plan, summary FROM daily_entries").all() as Array<{
    date: string;
    plan: string;
    summary: string;
  }>;
  const assets = db.prepare("SELECT id, day FROM assets").all() as Array<{ id: number; day: string }>;
  const studySessions = db.prepare(
    "SELECT id, day, duration_minutes AS durationMinutes FROM study_sessions",
  ).all() as Array<{ id: number; day: string; durationMinutes: number }>;
  const reviewEvents = db.prepare("SELECT id, day FROM review_events").all() as Array<{ id: number; day: string }>;
  const mistakes = db.prepare("SELECT id, day FROM mistakes").all() as Array<{ id: number; day: string }>;
  return buildCalendarSummaries({ days, assets, studySessions, reviewEvents, mistakes });
}

export type LearningAnalytics = {
  week: {
    start: string;
    end: string;
    studyMinutes: number;
    reviews: number;
    mistakes: number;
    assets: number;
    activeDays: number;
    reflectionDays: number;
  };
  weakPoints: Array<{
    id: string;
    subjectCode: string;
    title: string;
    tierName: string;
    mastery: number;
    nextReview: string | null;
    openMistakes: number;
    priorityScore: number;
    reasons: string[];
  }>;
};

export function getLearningAnalytics(db: Database.Database, today: string): LearningAnalytics {
  const end = assertDateKey(today);
  const start = shiftDateKey(end, -6);
  const weekRows = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions WHERE day BETWEEN @start AND @end) AS studyMinutes,
      (SELECT COUNT(*) FROM review_events WHERE day BETWEEN @start AND @end) AS reviews,
      (SELECT COUNT(*) FROM mistakes WHERE day BETWEEN @start AND @end) AS mistakes,
      (SELECT COUNT(*) FROM assets WHERE day BETWEEN @start AND @end) AS assets,
      (
        SELECT COUNT(DISTINCT day) FROM (
          SELECT day FROM study_sessions WHERE day BETWEEN @start AND @end
          UNION ALL SELECT day FROM review_events WHERE day BETWEEN @start AND @end
          UNION ALL SELECT day FROM mistakes WHERE day BETWEEN @start AND @end
          UNION ALL SELECT day FROM assets WHERE day BETWEEN @start AND @end
        )
      ) AS activeDays,
      (
        SELECT COUNT(*) FROM daily_entries
        WHERE date BETWEEN @start AND @end
          AND (TRIM(diary) != '' OR TRIM(summary) != '')
      ) AS reflectionDays
  `).get({ start, end }) as {
    studyMinutes: number | null;
    reviews: number;
    mistakes: number;
    assets: number;
    activeDays: number;
    reflectionDays: number;
  };

  const candidates = db.prepare(`
    SELECT
      k.id,
      k.subject_code AS subjectCode,
      k.title,
      k.tier,
      k.tier_name AS tierName,
      k.mastery,
      k.next_review AS nextReview,
      k.exam,
      COUNT(DISTINCT CASE WHEN m.graduated = 0 THEN m.id END) AS openMistakes
    FROM knowledge_points k
    LEFT JOIN mistakes m ON m.knowledge_point_id = k.id
    WHERE k.status != '已掌握'
    GROUP BY k.id
    HAVING k.mastery < 70 OR (k.next_review IS NOT NULL AND k.next_review <= @end) OR openMistakes > 0
  `).all({ end }) as Array<{
    id: string;
    subjectCode: string;
    title: string;
    tier: string;
    tierName: string;
    mastery: number;
    nextReview: string | null;
    exam: number;
    openMistakes: number;
  }>;

  const weakPoints = candidates
    .map((point) => {
      const due = Boolean(point.nextReview && point.nextReview <= end);
      const tierScore = point.tier === "r" ? 30 : point.tier === "y" ? 18 : 8;
      const priorityScore =
        100 - point.mastery + tierScore + (due ? 25 : 0) + point.openMistakes * 12 + (point.exam ? 8 : 0);
      const reasons = [
        point.tierName,
        `掌握度 ${point.mastery}`,
        due ? "复习到期" : "",
        point.openMistakes ? `未毕业错题 ${point.openMistakes}` : "",
        point.exam ? "真题" : "",
      ].filter(Boolean);
      return {
        id: point.id,
        subjectCode: point.subjectCode,
        title: point.title,
        tierName: point.tierName,
        mastery: point.mastery,
        nextReview: point.nextReview,
        openMistakes: point.openMistakes,
        priorityScore,
        reasons,
      };
    })
    .sort(
      (a, b) =>
        b.priorityScore - a.priorityScore ||
        a.subjectCode.localeCompare(b.subjectCode) ||
        a.title.localeCompare(b.title),
    )
    .slice(0, 10);

  return {
    week: {
      start,
      end,
      studyMinutes: Number(weekRows.studyMinutes || 0),
      reviews: weekRows.reviews,
      mistakes: weekRows.mistakes,
      assets: weekRows.assets,
      activeDays: weekRows.activeDays,
      reflectionDays: weekRows.reflectionDays,
    },
    weakPoints,
  };
}
