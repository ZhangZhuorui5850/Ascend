import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { buildCalendarSummaries } from "../calendar-summary";
import { assertDateKey, shiftDateKey } from "../dates";
import type { CalendarSummary } from "../types";

export type DaySnapshot = {
  assets: number;
  studyMinutes: number;
  reviews: number;
  mistakes: number;
};

export function getDaySnapshot(db: Database.Database, scope: WorkspaceScope, date: string): DaySnapshot {
  assertDateKey(date);
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM assets WHERE workspace_id = @workspaceId AND day = @date) AS assets,
      (SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions
       WHERE workspace_id = @workspaceId AND day = @date) AS studyMinutes,
      (SELECT COUNT(*) FROM review_events WHERE workspace_id = @workspaceId AND day = @date) AS reviews,
      (SELECT COUNT(*) FROM mistakes WHERE workspace_id = @workspaceId AND day = @date) AS mistakes
  `).get({ workspaceId: scope.workspaceId, date }) as DaySnapshot;
}

/** 连续学习天数：从今天（或昨天）往回数，有任意学习行为的连续天数。 */
export function getStudyStreak(db: Database.Database, scope: WorkspaceScope, today: string): number {
  assertDateKey(today);
  const rows = db.prepare(`
    SELECT DISTINCT day FROM (
      SELECT day FROM study_sessions WHERE workspace_id = @workspaceId
      UNION SELECT day FROM review_events WHERE workspace_id = @workspaceId
      UNION SELECT day FROM mistakes WHERE workspace_id = @workspaceId
      UNION SELECT day FROM assets WHERE workspace_id = @workspaceId
      UNION
      SELECT COALESCE(due_date, substr(scheduled_start_at, 1, 10)) AS day
      FROM planner_tasks
      WHERE workspace_id = @workspaceId AND status = 'completed' AND deleted_at IS NULL
    )
    WHERE day <= @today
    ORDER BY day DESC
    LIMIT 400
  `).all({ workspaceId: scope.workspaceId, today }) as Array<{ day: string }>;
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

export function getHomeSnapshot(db: Database.Database, scope: WorkspaceScope, today: string): HomeSnapshot {
  assertDateKey(today);
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM knowledge_points
       WHERE workspace_id = @workspaceId AND next_review IS NOT NULL AND next_review <= @today) AS dueReviews,
      (SELECT COUNT(*) FROM mistakes
       WHERE workspace_id = @workspaceId AND graduated = 0
         AND next_review IS NOT NULL AND next_review <= @today) AS dueMistakes,
      (SELECT COUNT(*) FROM planner_tasks
       WHERE workspace_id = @workspaceId AND deleted_at IS NULL
         AND status IN ('open', 'waiting')
         AND COALESCE(due_date, substr(scheduled_start_at, 1, 10)) = @today) AS openTasks,
      (SELECT COUNT(*) FROM planner_tasks
       WHERE workspace_id = @workspaceId AND deleted_at IS NULL
         AND status = 'completed'
         AND COALESCE(due_date, substr(scheduled_start_at, 1, 10)) = @today) AS doneTasks
  `).get({ workspaceId: scope.workspaceId, today }) as {
    dueReviews: number;
    dueMistakes: number;
    openTasks: number;
    doneTasks: number;
  };

  return {
    today: getDaySnapshot(db, scope, today),
    dueReviews: counts.dueReviews,
    dueMistakes: counts.dueMistakes,
    openTasks: counts.openTasks,
    doneTasks: counts.doneTasks,
    streak: getStudyStreak(db, scope, today),
  };
}

export function getCalendarSummaries(db: Database.Database, scope: WorkspaceScope): CalendarSummary[] {
  const days = db.prepare(`
    SELECT date, plan, summary FROM daily_entries WHERE workspace_id = ?
  `).all(scope.workspaceId) as Array<{
    date: string;
    plan: string;
    summary: string;
  }>;
  const assetCounts = db.prepare(`
    SELECT day, COUNT(*) AS count FROM assets WHERE workspace_id = ? GROUP BY day
  `).all(scope.workspaceId) as Array<{ day: string; count: number }>;
  const studyMinutes = db.prepare(`
    SELECT day, COALESCE(SUM(duration_minutes), 0) AS minutes
    FROM study_sessions WHERE workspace_id = ? GROUP BY day
  `).all(scope.workspaceId) as Array<{ day: string; minutes: number }>;
  const reviewCounts = db.prepare(`
    SELECT day, COUNT(*) AS count FROM review_events WHERE workspace_id = ? GROUP BY day
  `).all(scope.workspaceId) as Array<{ day: string; count: number }>;
  const mistakeCounts = db.prepare(`
    SELECT day, COUNT(*) AS count FROM mistakes WHERE workspace_id = ? GROUP BY day
  `).all(scope.workspaceId) as Array<{ day: string; count: number }>;
  return buildCalendarSummaries({ days, assetCounts, studyMinutes, reviewCounts, mistakeCounts });
}

/** 弱点优先级分桶阈值：达到即「急」。 */
export const WEAK_POINT_URGENT_SCORE = 120;
/** 弱点优先级分桶阈值：达到即「高」。 */
export const WEAK_POINT_HIGH_SCORE = 90;

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
  prevWeek: {
    studyMinutes: number;
    activeDays: number;
    reviews: number;
  };
  dailyMinutes: Array<{ day: string; minutes: number }>;
  subjectMinutes: Array<{ code: string | null; name: string; minutes: number }>;
  /** 本周复习评分分布：[记不清, 模糊, 基本会, 熟练]。 */
  scoreDist: [number, number, number, number];
  backlog: { dueReviews: number; dueMistakes: number };
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

export function getLearningAnalytics(
  db: Database.Database,
  scope: WorkspaceScope,
  today: string,
): LearningAnalytics {
  const end = assertDateKey(today);
  const start = shiftDateKey(end, -6);
  const weekRows = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions
       WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end) AS studyMinutes,
      (SELECT COUNT(*) FROM review_events
       WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end) AS reviews,
      (SELECT COUNT(*) FROM mistakes
       WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end) AS mistakes,
      (SELECT COUNT(*) FROM assets
       WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end) AS assets,
      (
        SELECT COUNT(DISTINCT day) FROM (
          SELECT day FROM study_sessions WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
          UNION ALL SELECT day FROM review_events WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
          UNION ALL SELECT day FROM mistakes WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
          UNION ALL SELECT day FROM assets WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
        )
      ) AS activeDays,
      (
        SELECT COUNT(*) FROM daily_entries
        WHERE workspace_id = @workspaceId AND date BETWEEN @start AND @end
          AND (TRIM(diary) != '' OR TRIM(summary) != '')
      ) AS reflectionDays
  `).get({ workspaceId: scope.workspaceId, start, end }) as {
    studyMinutes: number | null;
    reviews: number;
    mistakes: number;
    assets: number;
    activeDays: number;
    reflectionDays: number;
  };

  // 周环比：上一个 7 天窗口（end-13 .. end-7）。
  const prevStart = shiftDateKey(end, -13);
  const prevEnd = shiftDateKey(end, -7);
  const prevWeekRows = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions
       WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end) AS studyMinutes,
      (SELECT COUNT(*) FROM review_events
       WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end) AS reviews,
      (
        SELECT COUNT(DISTINCT day) FROM (
          SELECT day FROM study_sessions WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
          UNION ALL SELECT day FROM review_events WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
          UNION ALL SELECT day FROM mistakes WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
          UNION ALL SELECT day FROM assets WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
        )
      ) AS activeDays
  `).get({ workspaceId: scope.workspaceId, start: prevStart, end: prevEnd }) as {
    studyMinutes: number | null;
    reviews: number;
    activeDays: number;
  };

  // 待复习积压：与首页快照相同的两个到期口径（截至 today）。
  const backlog = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM knowledge_points
       WHERE workspace_id = @workspaceId AND next_review IS NOT NULL AND next_review <= @end) AS dueReviews,
      (SELECT COUNT(*) FROM mistakes
       WHERE workspace_id = @workspaceId AND graduated = 0
         AND next_review IS NOT NULL AND next_review <= @end) AS dueMistakes
  `).get({ workspaceId: scope.workspaceId, end }) as { dueReviews: number; dueMistakes: number };

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
    LEFT JOIN mistakes m ON m.knowledge_point_id = k.id AND m.workspace_id = k.workspace_id
    WHERE k.workspace_id = @workspaceId AND k.status != '已掌握'
    GROUP BY k.id
    HAVING k.mastery < 70 OR (k.next_review IS NOT NULL AND k.next_review <= @end) OR openMistakes > 0
  `).all({ workspaceId: scope.workspaceId, end }) as Array<{
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

  const minuteRows = db.prepare(`
    SELECT day, COALESCE(SUM(duration_minutes), 0) AS minutes
    FROM study_sessions
    WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
    GROUP BY day
  `).all({ workspaceId: scope.workspaceId, start, end }) as Array<{ day: string; minutes: number }>;
  const minutesByDay = new Map(minuteRows.map((row) => [row.day, Number(row.minutes)]));
  const dailyMinutes = Array.from({ length: 7 }, (_, index) => {
    const day = shiftDateKey(start, index);
    return { day, minutes: minutesByDay.get(day) ?? 0 };
  });

  const subjectMinutes = db.prepare(`
    SELECT
      s.subject_code AS code,
      COALESCE(subj.name, s.subject_code, '未分科') AS name,
      COALESCE(SUM(s.duration_minutes), 0) AS minutes
    FROM study_sessions s
    LEFT JOIN subjects subj
      ON subj.workspace_id = s.workspace_id AND subj.code = s.subject_code
    WHERE s.workspace_id = @workspaceId AND s.day BETWEEN @start AND @end
    GROUP BY s.subject_code
    ORDER BY minutes DESC, name ASC
  `).all({ workspaceId: scope.workspaceId, start, end }) as Array<{
    code: string | null;
    name: string;
    minutes: number;
  }>;

  const scoreRows = db.prepare(`
    SELECT score, COUNT(*) AS count
    FROM review_events
    WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
    GROUP BY score
  `).all({ workspaceId: scope.workspaceId, start, end }) as Array<{ score: number; count: number }>;
  const scoreDist: [number, number, number, number] = [0, 0, 0, 0];
  for (const row of scoreRows) {
    if (row.score >= 0 && row.score <= 3) scoreDist[row.score] = row.count;
  }

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
    prevWeek: {
      studyMinutes: Number(prevWeekRows.studyMinutes || 0),
      activeDays: prevWeekRows.activeDays,
      reviews: prevWeekRows.reviews,
    },
    dailyMinutes,
    subjectMinutes,
    scoreDist,
    backlog,
    weakPoints,
  };
}
