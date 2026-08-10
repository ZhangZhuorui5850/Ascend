import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { buildCalendarSummaries } from "../calendar-summary";
import { assertDateKey, shiftDateKey, weekRange } from "../dates";
import type { CalendarSummary } from "../types";
import { listCanonicalTaskPlacements, listDayTaskItems } from "./task-read-model";

export type DaySnapshot = {
  assets: number;
  studyMinutes: number;
  reviews: number;
  mistakes: number;
  mockExams: number;
};

export function getDaySnapshot(db: Database.Database, scope: WorkspaceScope, date: string): DaySnapshot {
  assertDateKey(date);
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM assets WHERE workspace_id = @workspaceId AND day = @date) AS assets,
      (SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions
       WHERE workspace_id = @workspaceId AND day = @date) AS studyMinutes,
      (SELECT COUNT(*) FROM review_events WHERE workspace_id = @workspaceId AND day = @date) AS reviews,
      (SELECT COUNT(*) FROM mistakes WHERE workspace_id = @workspaceId AND day = @date) AS mistakes,
      (SELECT COUNT(*) FROM mock_exams WHERE workspace_id = @workspaceId AND day = @date) AS mockExams
  `).get({ workspaceId: scope.workspaceId, date }) as DaySnapshot;
}

/**
 * 连续有学习记录天数：从今天（或昨天）往回数。
 *
 * 只把与学习或作答直接相关的记录纳入口径：
 * 学习活动、复习评分、错题记录和模考。任务完成与资料整理属于执行/整理证据，
 * 不再维持学习 streak。
 */
export function getStudyStreak(db: Database.Database, scope: WorkspaceScope, today: string): number {
  assertDateKey(today);
  const rows = db.prepare(`
    SELECT DISTINCT day FROM (
      SELECT day FROM study_sessions WHERE workspace_id = @workspaceId
      UNION SELECT day FROM review_events WHERE workspace_id = @workspaceId
      UNION SELECT day FROM mistakes WHERE workspace_id = @workspaceId
      UNION SELECT day FROM mock_exams WHERE workspace_id = @workspaceId
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
         AND next_review IS NOT NULL AND next_review <= @today) AS dueMistakes
  `).get({ workspaceId: scope.workspaceId, today }) as {
    dueReviews: number;
    dueMistakes: number;
  };
  const tasks = listDayTaskItems(db, scope, today);

  return {
    today: getDaySnapshot(db, scope, today),
    dueReviews: counts.dueReviews,
    dueMistakes: counts.dueMistakes,
    openTasks: tasks.filter((task) => !task.done).length,
    doneTasks: tasks.filter((task) => task.done).length,
    streak: getStudyStreak(db, scope, today),
  };
}

export type WeeklyCapacityDay = {
  day: string;
  studiedMinutes: number;
  plannedMinutes: number;
  suggestedMinutes: number;
};

export type WeeklyCapacity = {
  start: string;
  end: string;
  targetMinutes: number;
  studiedMinutes: number;
  plannedMinutes: number;
  overdueOpenMinutes: number;
  remainingToTarget: number;
  unallocatedMinutes: number;
  overloadMinutes: number;
  completionPercent: number;
  days: WeeklyCapacityDay[];
};

/**
 * 日历周容量：
 * - actual 只取 study_sessions；
 * - planned 只取今天至周日的未完成任务预计时长；
 * - 过期未完成任务单列，不伪装成未来已经分配的容量；
 * - suggested 只是只读草案，不写任务。
 */
export function getWeeklyCapacity(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { today: string; targetMinutes: number },
): WeeklyCapacity {
  const today = assertDateKey(input.today);
  const targetMinutes = Math.round(Number(input.targetMinutes));
  if (!Number.isInteger(targetMinutes) || targetMinutes < 30 || targetMinutes > 10080) {
    throw new Error("每周计划时长需在 30-10080 分钟之间");
  }
  const { start, end } = weekRange(today);
  const studiedRows = db.prepare(`
    SELECT day, COALESCE(SUM(duration_minutes), 0) AS minutes
    FROM study_sessions
    WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
    GROUP BY day
  `).all({ workspaceId: scope.workspaceId, start, end }) as Array<{ day: string; minutes: number }>;
  const studiedByDay = new Map(studiedRows.map((row) => [row.day, Number(row.minutes)]));
  const plannedByDay = new Map<string, number>();
  for (const { day, task } of listCanonicalTaskPlacements(db, scope)) {
    if (
      day < start
      || day > end
      || (task.status !== "open" && task.status !== "waiting")
    ) continue;
    plannedByDay.set(day, (plannedByDay.get(day) ?? 0) + task.estimated_minutes);
  }
  const days = Array.from({ length: 7 }, (_, index): WeeklyCapacityDay => {
    const day = shiftDateKey(start, index);
    return {
      day,
      studiedMinutes: studiedByDay.get(day) ?? 0,
      plannedMinutes: day >= today ? plannedByDay.get(day) ?? 0 : 0,
      suggestedMinutes: 0,
    };
  });
  const studiedMinutes = days.reduce((sum, day) => sum + day.studiedMinutes, 0);
  const plannedMinutes = days.reduce((sum, day) => sum + day.plannedMinutes, 0);
  const overdueOpenMinutes = [...plannedByDay]
    .filter(([day]) => day < today)
    .reduce((sum, [, minutes]) => sum + minutes, 0);
  const remainingToTarget = Math.max(0, targetMinutes - studiedMinutes);
  const unallocatedMinutes = Math.max(0, targetMinutes - studiedMinutes - plannedMinutes);
  const overloadMinutes = Math.max(0, studiedMinutes + plannedMinutes - targetMinutes);

  // 以 30 分钟块在今天至周日之间做最小负载优先的只读草案；尾块保留真实余数。
  let toAllocate = unallocatedMinutes;
  const candidates = days.filter((day) => day.day >= today);
  while (toAllocate > 0 && candidates.length) {
    candidates.sort(
      (a, b) =>
        a.studiedMinutes + a.plannedMinutes + a.suggestedMinutes
        - (b.studiedMinutes + b.plannedMinutes + b.suggestedMinutes)
        || a.day.localeCompare(b.day),
    );
    const chunk = Math.min(30, toAllocate);
    candidates[0].suggestedMinutes += chunk;
    toAllocate -= chunk;
  }
  days.sort((a, b) => a.day.localeCompare(b.day));

  return {
    start,
    end,
    targetMinutes,
    studiedMinutes,
    plannedMinutes,
    overdueOpenMinutes,
    remainingToTarget,
    unallocatedMinutes,
    overloadMinutes,
    completionPercent: Math.min(100, Math.round((studiedMinutes / targetMinutes) * 100)),
    days,
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
    mistakeReattempts: number;
    evidencedReviews: number;
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
  outcomes: {
    windowStart: string;
    windowEnd: string;
    delayedRecall7: RateSignal;
    delayedRecall30: RateSignal;
    mistakeReattempt: RateSignal;
    confidenceCalibration: {
      samples: number;
      meanAbsoluteGap: number | null;
    };
    backlogAge: {
      samples: number;
      p50Days: number | null;
      p90Days: number | null;
    };
    interventionVerification: {
      eligible: number;
      verified: number;
      successful: number;
      rate: number | null;
    };
  };
  weakPoints: Array<{
    id: string;
    subjectCode: string;
    title: string;
    tierName: string;
    mastery: number;
    nextReview: string | null;
    openMistakes: number;
    recentFailures: number;
    priorityScore: number;
    reasons: string[];
  }>;
};

export type RateSignal = {
  samples: number;
  successes: number;
  rate: number | null;
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
      (SELECT COUNT(*) FROM review_events
       WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
         AND event_type = 'mistake_reattempt') AS mistakeReattempts,
      (SELECT COUNT(*) FROM review_events
       WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
         AND attempt_mode != 'unknown') AS evidencedReviews,
      (SELECT COUNT(*) FROM mistakes
       WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end) AS mistakes,
      (SELECT COUNT(*) FROM assets
       WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end) AS assets,
      (
        SELECT COUNT(DISTINCT day) FROM (
          SELECT day FROM study_sessions WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
          UNION ALL SELECT day FROM review_events WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
          UNION ALL SELECT day FROM mistakes WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
          UNION ALL SELECT day FROM mock_exams WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
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
    mistakeReattempts: number;
    evidencedReviews: number;
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
          UNION ALL SELECT day FROM mock_exams WHERE workspace_id = @workspaceId AND day BETWEEN @start AND @end
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
      COUNT(DISTINCT CASE WHEN m.graduated = 0 THEN m.id END) AS openMistakes,
      (
        SELECT COUNT(*)
        FROM review_events r
        WHERE r.workspace_id = k.workspace_id
          AND r.knowledge_point_id = k.id
          AND r.day BETWEEN @start AND @end
          AND r.score <= 1
      ) AS recentFailures
    FROM knowledge_points k
    LEFT JOIN mistakes m ON m.knowledge_point_id = k.id AND m.workspace_id = k.workspace_id
    WHERE k.workspace_id = @workspaceId
    GROUP BY k.id
    HAVING k.mastery < 70
      OR (k.next_review IS NOT NULL AND k.next_review <= @end)
      OR openMistakes > 0
      OR recentFailures > 0
  `).all({ workspaceId: scope.workspaceId, start, end }) as Array<{
    id: string;
    subjectCode: string;
    title: string;
    tier: string;
    tierName: string;
    mastery: number;
    nextReview: string | null;
    exam: number;
    openMistakes: number;
    recentFailures: number;
  }>;

  const weakPoints = candidates
    .map((point) => {
      const due = Boolean(point.nextReview && point.nextReview <= end);
      const tierScore = point.tier === "r" ? 30 : point.tier === "y" ? 18 : 8;
      // 掌握度、未毕业错题和近期失败往往来自同一轮学习结果，不能逐项叠加；
      // 取最强风险信号，再叠加独立的课程层级、到期和真题优先级。
      const evidenceRisk = Math.max(
        100 - point.mastery,
        Math.min(30, point.openMistakes * 12),
        Math.min(30, point.recentFailures * 15),
      );
      const priorityScore = evidenceRisk + tierScore + (due ? 25 : 0) + (point.exam ? 8 : 0);
      const reasons = [
        point.tierName,
        point.mastery < 35 ? "系统证据较弱" : point.mastery < 70 ? "系统证据需巩固" : "",
        due ? "复习到期" : "",
        point.openMistakes ? `未毕业错题 ${point.openMistakes}` : "",
        point.recentFailures ? `近期回忆失败 ${point.recentFailures} 次` : "",
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
        recentFailures: point.recentFailures,
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
      AND event_type = 'point_review'
    GROUP BY score
  `).all({ workspaceId: scope.workspaceId, start, end }) as Array<{ score: number; count: number }>;
  const scoreDist: [number, number, number, number] = [0, 0, 0, 0];
  for (const row of scoreRows) {
    if (row.score >= 0 && row.score <= 3) scoreDist[row.score] = row.count;
  }
  const outcomes = getOutcomeSignals(db, scope, end);

  return {
    week: {
      start,
      end,
      studyMinutes: Number(weekRows.studyMinutes || 0),
      reviews: weekRows.reviews,
      mistakeReattempts: weekRows.mistakeReattempts,
      evidencedReviews: weekRows.evidencedReviews,
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
    outcomes,
    weakPoints,
  };
}

function getOutcomeSignals(
  db: Database.Database,
  scope: WorkspaceScope,
  end: string,
): LearningAnalytics["outcomes"] {
  const windowStart = shiftDateKey(end, -89);
  const recentStart = shiftDateKey(end, -29);
  const delayedRows = db.prepare(`
    WITH ordered AS (
      SELECT
        id, day, score,
        LAG(day) OVER (
          PARTITION BY knowledge_point_id
          ORDER BY day ASC, created_at ASC, id ASC
        ) AS previous_day
      FROM review_events
      WHERE workspace_id = @workspaceId
        AND event_type = 'point_review'
        AND knowledge_point_id IS NOT NULL
        AND attempt_mode != 'unknown'
    )
    SELECT day, score, previous_day
    FROM ordered
    WHERE day BETWEEN @windowStart AND @end
      AND previous_day IS NOT NULL
  `).all({
    workspaceId: scope.workspaceId,
    windowStart,
    end,
  }) as Array<{ day: string; score: number; previous_day: string }>;
  const delayed7 = delayedRows.filter((row) => daysBetween(row.previous_day, row.day) >= 7);
  const delayed30 = delayedRows.filter((row) => daysBetween(row.previous_day, row.day) >= 30);

  const mistakeRows = db.prepare(`
    SELECT score
    FROM review_events
    WHERE workspace_id = ?
      AND day BETWEEN ? AND ?
      AND event_type = 'mistake_reattempt'
      AND attempt_mode != 'unknown'
  `).all(scope.workspaceId, recentStart, end) as Array<{ score: number }>;

  const confidenceRows = db.prepare(`
    SELECT pre_confidence, score
    FROM review_events
    WHERE workspace_id = ?
      AND day BETWEEN ? AND ?
      AND attempt_mode != 'unknown'
      AND pre_confidence IS NOT NULL
  `).all(scope.workspaceId, recentStart, end) as Array<{ pre_confidence: number; score: number }>;
  const meanAbsoluteGap = confidenceRows.length
    ? Math.round(
        confidenceRows.reduce(
          (sum, row) => sum + Math.abs(row.pre_confidence - row.score),
          0,
        ) / confidenceRows.length * 10,
      ) / 10
    : null;

  const dueRows = db.prepare(`
    SELECT next_review AS due_day
    FROM knowledge_points
    WHERE workspace_id = @workspaceId
      AND next_review IS NOT NULL
      AND next_review <= @end
    UNION ALL
    SELECT next_review AS due_day
    FROM mistakes
    WHERE workspace_id = @workspaceId
      AND graduated = 0
      AND next_review IS NOT NULL
      AND next_review <= @end
  `).all({ workspaceId: scope.workspaceId, end }) as Array<{ due_day: string }>;
  const backlogAges = dueRows
    .map((row) => daysBetween(row.due_day, end))
    .filter((days) => days >= 0)
    .sort((a, b) => a - b);

  const interventionRows = db.prepare(`
    SELECT
      t.id,
      EXISTS (
        SELECT 1
        FROM review_events r
        WHERE r.workspace_id = t.workspace_id
          AND r.knowledge_point_id = COALESCE(e.knowledge_point_id, l.knowledge_point_id)
          AND julianday(r.created_at) > julianday(e.created_at)
          AND r.day <= @end
          AND r.attempt_mode != 'unknown'
      )
      OR EXISTS (
        SELECT 1
        FROM planner_tasks rt
        LEFT JOIN learning_task_links rl
          ON rl.workspace_id = rt.workspace_id AND rl.task_id = rt.id
        JOIN learning_evidence re
          ON re.workspace_id = rt.workspace_id AND re.task_id = rt.id
        WHERE rt.workspace_id = t.workspace_id
          AND rt.deleted_at IS NULL
          AND rt.status = 'completed'
          AND COALESCE(NULLIF(rl.source_type, ''), re.source_type) = 'training_retest'
          AND (
            COALESCE(NULLIF(rl.source_id, ''), re.source_id) = t.id
            OR substr(COALESCE(NULLIF(rl.source_id, ''), re.source_id), 1, length(t.id) + 1) = t.id || ':'
          )
          AND re.voided_at IS NULL
          AND re.corrected_by IS NULL
          AND re.outcome != 'reopened'
          AND TRIM(re.verification_outcome) != ''
          AND re.day <= @end
      ) AS verified,
      EXISTS (
        SELECT 1
        FROM review_events r
        WHERE r.workspace_id = t.workspace_id
          AND r.knowledge_point_id = COALESCE(e.knowledge_point_id, l.knowledge_point_id)
          AND julianday(r.created_at) > julianday(e.created_at)
          AND r.day <= @end
          AND r.attempt_mode != 'unknown'
          AND r.score >= 2
      )
      OR EXISTS (
        SELECT 1
        FROM planner_tasks rt
        LEFT JOIN learning_task_links rl
          ON rl.workspace_id = rt.workspace_id AND rl.task_id = rt.id
        JOIN learning_evidence re
          ON re.workspace_id = rt.workspace_id AND re.task_id = rt.id
        WHERE rt.workspace_id = t.workspace_id
          AND rt.deleted_at IS NULL
          AND rt.status = 'completed'
          AND COALESCE(NULLIF(rl.source_type, ''), re.source_type) = 'training_retest'
          AND (
            COALESCE(NULLIF(rl.source_id, ''), re.source_id) = t.id
            OR substr(COALESCE(NULLIF(rl.source_id, ''), re.source_id), 1, length(t.id) + 1) = t.id || ':'
          )
          AND re.voided_at IS NULL
          AND re.corrected_by IS NULL
          AND re.outcome != 'reopened'
          AND re.verification_outcome = 'improved'
          AND re.day <= @end
      ) AS successful
    FROM planner_tasks t
    JOIN learning_evidence e
      ON e.workspace_id = t.workspace_id AND e.task_id = t.id
    LEFT JOIN learning_task_links l
      ON l.workspace_id = t.workspace_id AND l.task_id = t.id
    WHERE t.workspace_id = @workspaceId
      AND t.deleted_at IS NULL
      AND t.status = 'completed'
      AND e.voided_at IS NULL
      AND e.corrected_by IS NULL
      AND e.outcome != 'reopened'
      AND e.day BETWEEN @windowStart AND @end
      AND COALESCE(e.knowledge_point_id, l.knowledge_point_id) IS NOT NULL
      AND COALESCE(NULLIF(l.source_type, ''), e.source_type) != ''
      AND (
        e.actual_minutes IS NOT NULL
        OR TRIM(e.output) != ''
        OR TRIM(e.verification_result) != ''
      )
      AND NOT EXISTS (
        SELECT 1
        FROM learning_evidence newer
        WHERE newer.workspace_id = e.workspace_id
          AND newer.task_id = e.task_id
          AND newer.voided_at IS NULL
          AND newer.corrected_by IS NULL
          AND newer.outcome != 'reopened'
          AND (
            newer.completion_cycle > e.completion_cycle
            OR (
              newer.completion_cycle = e.completion_cycle
              AND (newer.created_at > e.created_at OR (
                newer.created_at = e.created_at AND newer.id > e.id
              ))
            )
          )
      )
  `).all({
    workspaceId: scope.workspaceId,
    windowStart,
    end,
  }) as Array<{ id: string; verified: number; successful: number }>;
  const verified = interventionRows.filter((row) => row.verified).length;

  return {
    windowStart,
    windowEnd: end,
    delayedRecall7: rateSignal(delayed7.map((row) => row.score)),
    delayedRecall30: rateSignal(delayed30.map((row) => row.score)),
    mistakeReattempt: rateSignal(mistakeRows.map((row) => row.score)),
    confidenceCalibration: {
      samples: confidenceRows.length,
      meanAbsoluteGap,
    },
    backlogAge: {
      samples: backlogAges.length,
      p50Days: percentile(backlogAges, 0.5),
      p90Days: percentile(backlogAges, 0.9),
    },
    interventionVerification: {
      eligible: interventionRows.length,
      verified,
      successful: interventionRows.filter((row) => row.successful).length,
      rate: interventionRows.length ? Math.round((verified / interventionRows.length) * 100) : null,
    },
  };
}

function rateSignal(scores: number[]): RateSignal {
  const successes = scores.filter((score) => score >= 2).length;
  return {
    samples: scores.length,
    successes,
    rate: scores.length ? Math.round((successes / scores.length) * 100) : null,
  };
}

function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`))
    / 86400000,
  );
}

function percentile(sortedValues: number[], percentileValue: number): number | null {
  if (!sortedValues.length) return null;
  const index = Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1);
  return sortedValues[index];
}
