import { describe, expect, it } from "vitest";
import {
  completeTask,
  createTask,
  deleteTask,
  updateTask,
} from "../application/tasks/commands";
import { getDaySnapshot, getHomeSnapshot, getLearningAnalytics, getStudyStreak, getWeeklyCapacity } from "./stats";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "./testing";
import { LEGACY_WORKSPACE_ID } from "./workspaces";

const legacyScope = { workspaceId: LEGACY_WORKSPACE_ID };

describe("learning analytics", () => {
  it("counts canonical Planner-only tasks in the Home snapshot", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const open = createTask(db, scope, {
      clientMutationId: "home-open",
      title: "Open",
      dueDate: "2026-08-10",
    });
    const done = createTask(db, scope, {
      clientMutationId: "home-done",
      title: "Done",
      dueDate: "2026-08-10",
    });
    completeTask(db, scope, { id: done.id, expectedVersion: done.version });

    expect(getHomeSnapshot(db, scope, "2026-08-10")).toMatchObject({
      openTasks: 1,
      doneTasks: 1,
    });
    expect(open.legacy_day_task_id).toBeNull();
  });

  it("isolates daily totals and streaks by workspace", () => {
    const db = createTestDb();
    const a = createTestWorkspace(db, { userId: "user-a", email: "a@example.com" });
    const b = createTestWorkspace(db, { userId: "user-b", email: "b@example.com" });
    db.prepare(`
      INSERT INTO study_sessions (workspace_id, day, title, duration_minutes)
      VALUES (?, '2026-07-02', 'A', 10)
    `).run(a.workspaceId);
    db.prepare(`
      INSERT INTO study_sessions (workspace_id, day, title, duration_minutes)
      VALUES (?, '2026-07-02', 'B', 90)
    `).run(b.workspaceId);

    expect(getDaySnapshot(db, a, "2026-07-02").studyMinutes).toBe(10);
    expect(getDaySnapshot(db, b, "2026-07-02").studyMinutes).toBe(90);
    expect(getStudyStreak(db, a, "2026-07-02")).toBe(1);
  });

  it("aggregates the trailing week and surfaces weak points", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("UPDATE knowledge_points SET mastery = 20, next_review = '2026-07-01' WHERE id = 'kp1'").run();
    db.prepare("INSERT INTO study_sessions (day, title, duration_minutes) VALUES ('2026-07-01', 'a', 60)").run();
    db.prepare("INSERT INTO study_sessions (day, title, duration_minutes) VALUES ('2026-06-30', 'b', 30)").run();
    db.prepare(`
      INSERT INTO review_events
        (day, knowledge_point_id, score, attempt_mode, pre_confidence)
      VALUES ('2026-07-01', 'kp1', 1, 'paper', 3)
    `).run();
    db.prepare("INSERT INTO mistakes (day, knowledge_point_id, title, graduated) VALUES ('2026-07-01', 'kp1', '错', 0)").run();
    db.prepare("INSERT INTO daily_entries (date, diary) VALUES ('2026-07-01', '写了复盘')").run();

    const analytics = getLearningAnalytics(db, legacyScope, "2026-07-02");

    expect(analytics.week).toMatchObject({
      start: "2026-06-26",
      end: "2026-07-02",
      studyMinutes: 90,
      reviews: 1,
      evidencedReviews: 1,
      mistakes: 1,
      activeDays: 2,
      reflectionDays: 1,
    });
    expect(analytics.weakPoints[0]).toMatchObject({ id: "kp1", openMistakes: 1 });
    expect(analytics.weakPoints[0].priorityScore).toBe(143);
    expect(analytics.weakPoints[0].reasons).toContain("复习到期");
  });

  it("uses the same learning-record definition for weekly active days", () => {
    const db = createTestDb();
    db.prepare(`
      INSERT INTO mock_exams (workspace_id, day, name, score, max_score)
      VALUES (?, '2026-07-02', '模拟卷', 80, 100)
    `).run(LEGACY_WORKSPACE_ID);
    db.prepare(`
      INSERT INTO assets (day, original_name, safe_name, relative_path)
      VALUES ('2026-07-02', '讲义.pdf', 'lecture.pdf', 'lecture.pdf')
    `).run();
    const checkedTask = createTask(db, legacyScope, {
      clientMutationId: "active-day-task",
      title: "只打勾的任务",
      dueDate: "2026-07-03",
    });
    completeTask(db, legacyScope, {
      id: checkedTask.id,
      expectedVersion: checkedTask.version,
      day: "2026-07-03",
    });

    const analytics = getLearningAnalytics(db, legacyScope, "2026-07-03");

    expect(analytics.week.activeDays).toBe(1);
    expect(getStudyStreak(db, legacyScope, "2026-07-03")).toBe(1);
    expect(getDaySnapshot(db, legacyScope, "2026-07-02").mockExams).toBe(1);
  });

  it("excludes mastered points from the weak point queue", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("UPDATE knowledge_points SET mastery = 90, status = '已掌握' WHERE id = 'kp1'").run();

    const analytics = getLearningAnalytics(db, legacyScope, "2026-07-02");

    expect(analytics.weakPoints).toHaveLength(0);
  });

  it("re-exposes a mastered point after a recent failed recall", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare(`
      UPDATE knowledge_points
      SET mastery = 90, status = '已掌握', next_review = '2026-08-01'
      WHERE id = 'kp1'
    `).run();
    db.prepare(`
      INSERT INTO review_events (day, knowledge_point_id, score)
      VALUES ('2026-07-01', 'kp1', 1)
    `).run();

    const analytics = getLearningAnalytics(db, legacyScope, "2026-07-02");

    expect(analytics.weakPoints[0]).toMatchObject({ id: "kp1", recentFailures: 1 });
    expect(analytics.weakPoints[0].reasons).toContain("近期回忆失败 1 次");
  });

  it("re-exposes a mastered point when it has a new open mistake", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare(`
      UPDATE knowledge_points
      SET mastery = 85, status = '已掌握', next_review = '2026-08-01'
      WHERE id = 'kp1'
    `).run();
    db.prepare(`
      INSERT INTO mistakes (day, knowledge_point_id, title, graduated, next_review)
      VALUES ('2026-07-01', 'kp1', '新近错题', 0, '2026-08-01')
    `).run();

    const analytics = getLearningAnalytics(db, legacyScope, "2026-07-02");

    expect(analytics.weakPoints[0]).toMatchObject({ id: "kp1", openMistakes: 1 });
    expect(analytics.weakPoints[0].reasons).toContain("未毕业错题 1");
  });

  it("groups weekly minutes by subject with an uncategorized bucket", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("INSERT INTO study_sessions (day, subject_code, title, duration_minutes) VALUES ('2026-07-01', 'M1', 'a', 60)").run();
    db.prepare("INSERT INTO study_sessions (day, subject_code, title, duration_minutes) VALUES ('2026-06-27', 'M1', 'b', 30)").run();
    db.prepare("INSERT INTO study_sessions (day, subject_code, title, duration_minutes) VALUES ('2026-07-02', NULL, 'c', 20)").run();
    // 窗口外：不计入。
    db.prepare("INSERT INTO study_sessions (day, subject_code, title, duration_minutes) VALUES ('2026-06-25', 'M1', 'd', 999)").run();

    const analytics = getLearningAnalytics(db, legacyScope, "2026-07-02");

    expect(analytics.subjectMinutes).toEqual([
      { code: "M1", name: "线性代数", minutes: 90 },
      { code: null, name: "未分科", minutes: 20 },
    ]);
  });

  it("counts weekly review score distribution", () => {
    const db = createTestDb();
    db.prepare("INSERT INTO review_events (day, score) VALUES ('2026-06-26', 0)").run();
    db.prepare("INSERT INTO review_events (day, score) VALUES ('2026-06-30', 1)").run();
    db.prepare("INSERT INTO review_events (day, score) VALUES ('2026-07-01', 1)").run();
    db.prepare("INSERT INTO review_events (day, score) VALUES ('2026-07-02', 3)").run();
    // 窗口外：不计入。
    db.prepare("INSERT INTO review_events (day, score) VALUES ('2026-06-25', 2)").run();

    const analytics = getLearningAnalytics(db, legacyScope, "2026-07-02");

    expect(analytics.scoreDist).toEqual([1, 2, 0, 1]);
    expect(analytics.week.reviews).toBe(4);
  });

  it("aggregates the previous 7-day window with exact boundaries", () => {
    const db = createTestDb();
    // today = 2026-07-14 → 本周 07-08..07-14，上周 07-01..07-07。
    db.prepare("INSERT INTO study_sessions (day, title, duration_minutes) VALUES ('2026-06-30', 'out', 40)").run();
    db.prepare("INSERT INTO study_sessions (day, title, duration_minutes) VALUES ('2026-07-01', 'lo', 10)").run();
    db.prepare("INSERT INTO study_sessions (day, title, duration_minutes) VALUES ('2026-07-07', 'hi', 20)").run();
    db.prepare("INSERT INTO study_sessions (day, title, duration_minutes) VALUES ('2026-07-08', 'cur', 5)").run();
    db.prepare("INSERT INTO review_events (day, score) VALUES ('2026-07-07', 2)").run();
    db.prepare("INSERT INTO review_events (day, score) VALUES ('2026-07-08', 2)").run();

    const analytics = getLearningAnalytics(db, legacyScope, "2026-07-14");

    expect(analytics.prevWeek).toEqual({ studyMinutes: 30, activeDays: 2, reviews: 1 });
    expect(analytics.week.studyMinutes).toBe(5);
    expect(analytics.week.reviews).toBe(1);
  });

  it("reports the review backlog due as of today", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("UPDATE knowledge_points SET next_review = '2026-07-01' WHERE id = 'kp1'").run();
    db.prepare(`
      INSERT INTO knowledge_points
        (id, subject_code, subject_name, submodule, tier, tier_name, title, exam, status, mastery, reviews, next_review)
      VALUES ('kp2', 'M1', '线性代数', '矩阵', 'y', '熟悉', '行列式', 0, '未学', 0, 0, '2026-08-01')
    `).run();
    db.prepare("INSERT INTO mistakes (day, title, graduated, next_review) VALUES ('2026-06-20', '到期', 0, '2026-07-02')").run();
    db.prepare("INSERT INTO mistakes (day, title, graduated, next_review) VALUES ('2026-06-20', '已毕业', 1, '2026-07-01')").run();
    db.prepare("INSERT INTO mistakes (day, title, graduated, next_review) VALUES ('2026-06-20', '未到期', 0, '2026-08-01')").run();

    const analytics = getLearningAnalytics(db, legacyScope, "2026-07-02");

    expect(analytics.backlog).toEqual({ dueReviews: 1, dueMistakes: 1 });
  });

  it("separates calendar-week actual, future plan, overdue work, and unallocated capacity", () => {
    const db = createTestDb();
    // 2026-07-25 是周六；ISO 周为 07-20..07-26。
    db.prepare(`
      INSERT INTO study_sessions (day, title, duration_minutes)
      VALUES ('2026-07-20', '周一学习', 60), ('2026-07-25', '周六学习', 60)
    `).run();
    createTask(db, legacyScope, {
      clientMutationId: "capacity-overdue",
      title: "过期未完成",
      dueDate: "2026-07-21",
      estimatedMinutes: 60,
    });
    createTask(db, legacyScope, {
      clientMutationId: "capacity-today",
      title: "今天计划",
      dueDate: "2026-07-25",
      estimatedMinutes: 60,
    });
    createTask(db, legacyScope, {
      clientMutationId: "capacity-scheduled-over-due",
      title: "周日到期但周六执行",
      dueDate: "2026-07-26",
      scheduledStartAt: "2026-07-25T01:00:00.000Z",
      scheduledEndAt: "2026-07-25T03:00:00.000Z",
      scheduledTimezone: "Asia/Shanghai",
      estimatedMinutes: 120,
    });
    const completed = createTask(db, legacyScope, {
      clientMutationId: "capacity-completed",
      title: "已经完成",
      dueDate: "2026-07-26",
      estimatedMinutes: 999,
    });
    completeTask(db, legacyScope, {
      id: completed.id,
      expectedVersion: completed.version,
      day: "2026-07-25",
    });
    createTask(db, legacyScope, {
      clientMutationId: "capacity-next-week",
      title: "下周任务",
      dueDate: "2026-07-27",
      estimatedMinutes: 999,
    });

    const capacity = getWeeklyCapacity(db, legacyScope, {
      today: "2026-07-25",
      targetMinutes: 600,
    });

    expect(capacity).toMatchObject({
      start: "2026-07-20",
      end: "2026-07-26",
      targetMinutes: 600,
      studiedMinutes: 120,
      plannedMinutes: 180,
      overdueOpenMinutes: 60,
      remainingToTarget: 480,
      unallocatedMinutes: 300,
      overloadMinutes: 0,
      completionPercent: 20,
    });
    expect(capacity.days.reduce((sum, day) => sum + day.suggestedMinutes, 0)).toBe(300);
    expect(capacity.days.find((day) => day.day === "2026-07-25")?.plannedMinutes).toBe(180);
    expect(capacity.days.find((day) => day.day === "2026-07-26")?.plannedMinutes).toBe(0);
    expect(capacity.days.filter((day) => day.suggestedMinutes > 0).map((day) => day.day))
      .toEqual(["2026-07-25", "2026-07-26"]);
  });

  it("reports overload without proposing more capacity and stays workspace-scoped", () => {
    const db = createTestDb();
    const mine = createTestWorkspace(db, { email: "capacity@example.com" });
    const theirs = createTestWorkspace(db, { email: "capacity-other@example.com" });
    db.prepare(`
      INSERT INTO study_sessions (workspace_id, day, title, duration_minutes)
      VALUES (?, '2026-07-24', '我的学习', 250), (?, '2026-07-24', '别人的学习', 900)
    `).run(mine.workspaceId, theirs.workspaceId);
    createTask(db, mine, {
      clientMutationId: "mine-capacity",
      title: "我的计划",
      dueDate: "2026-07-25",
      estimatedMinutes: 100,
    });
    createTask(db, theirs, {
      clientMutationId: "their-capacity",
      title: "别人的计划",
      dueDate: "2026-07-25",
      estimatedMinutes: 900,
    });

    const capacity = getWeeklyCapacity(db, mine, {
      today: "2026-07-25",
      targetMinutes: 300,
    });

    expect(capacity).toMatchObject({
      studiedMinutes: 250,
      plannedMinutes: 100,
      unallocatedMinutes: 0,
      overloadMinutes: 50,
    });
    expect(capacity.days.every((day) => day.suggestedMinutes === 0)).toBe(true);
  });

  it("excludes deleted, canceled, and completed canonical tasks from weekly capacity", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const deleted = createTask(db, scope, {
      clientMutationId: "capacity-deleted",
      title: "Deleted",
      dueDate: "2026-07-25",
      estimatedMinutes: 400,
    });
    deleteTask(db, scope, {
      id: deleted.id,
      expectedVersion: deleted.version,
      clientMutationId: "capacity-delete-op",
    });
    const canceled = createTask(db, scope, {
      clientMutationId: "capacity-canceled",
      title: "Canceled",
      dueDate: "2026-07-25",
      estimatedMinutes: 400,
    });
    updateTask(db, scope, {
      id: canceled.id,
      expectedVersion: canceled.version,
      status: "canceled",
    });
    const completed = createTask(db, scope, {
      clientMutationId: "capacity-done",
      title: "Done",
      dueDate: "2026-07-25",
      estimatedMinutes: 400,
    });
    completeTask(db, scope, {
      id: completed.id,
      expectedVersion: completed.version,
      day: "2026-07-25",
    });

    expect(getWeeklyCapacity(db, scope, {
      today: "2026-07-25",
      targetMinutes: 300,
    })).toMatchObject({
      plannedMinutes: 0,
      overdueOpenMinutes: 0,
    });
  });

  it("validates weekly target bounds", () => {
    const db = createTestDb();
    expect(() => getWeeklyCapacity(db, legacyScope, {
      today: "2026-07-25",
      targetMinutes: 0,
    })).toThrow("30-10080");
  });

  it("reports outcome signals with explicit windows, samples, and evidence filters", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare(`
      INSERT INTO knowledge_points
        (id, subject_code, subject_name, submodule, tier, tier_name, title, status, mastery, reviews, next_review)
      VALUES ('kp2', 'M1', '线性代数', '矩阵', 'y', '熟悉', '行列式', '学习中', 40, 0, '2026-07-24')
    `).run();
    db.prepare("UPDATE knowledge_points SET next_review = '2026-07-15' WHERE id = 'kp1'").run();
    db.prepare(`
      INSERT INTO review_events
        (day, knowledge_point_id, score, event_type, attempt_mode, pre_confidence)
      VALUES
        ('2026-04-01', 'kp1', 1, 'point_review', 'paper', 3),
        ('2026-05-10', 'kp1', 3, 'point_review', 'paper', 1),
        ('2026-05-20', 'kp1', 1, 'point_review', 'oral', 2),
        ('2026-06-25', 'kp1', 2, 'point_review', 'paper', 2),
        ('2026-07-20', 'kp1', 1, 'point_review', 'paper', 3),
        ('2026-07-21', 'kp1', 3, 'point_review', 'unknown', NULL),
        ('2026-07-18', 'kp1', 3, 'mistake_reattempt', 'paper', 2),
        ('2026-07-19', 'kp1', 1, 'mistake_reattempt', 'oral', 0)
    `).run();
    db.prepare(`
      INSERT INTO mistakes (day, title, graduated, next_review)
      VALUES
        ('2026-06-01', '较老积压', 0, '2026-06-25'),
        ('2026-07-20', '今天到期', 0, '2026-07-25')
    `).run();
    const reviewed = createTask(db, legacyScope, {
      clientMutationId: "outcome-reviewed",
      title: "已复测干预",
      dueDate: "2026-07-15",
    });
    completeTask(db, legacyScope, {
      id: reviewed.id,
      expectedVersion: reviewed.version,
      day: "2026-07-15",
      evidence: {
        knowledgePointId: "kp1",
        sourceType: "weak_point",
        sourceId: "reviewed-intervention",
        output: "完成训练",
      },
    });
    const structuredParent = createTask(db, legacyScope, {
      clientMutationId: "outcome-structured",
      title: "结构化复测干预",
      dueDate: "2026-07-15",
    });
    completeTask(db, legacyScope, {
      id: structuredParent.id,
      expectedVersion: structuredParent.version,
      day: "2026-07-15",
      evidence: {
        knowledgePointId: "kp2",
        sourceType: "weak_point",
        sourceId: "structured-intervention",
        output: "完成训练",
        outcome: "practiced",
      },
    });
    const unverified = createTask(db, legacyScope, {
      clientMutationId: "outcome-unverified",
      title: "未复测干预",
      dueDate: "2026-07-15",
    });
    completeTask(db, legacyScope, {
      id: unverified.id,
      expectedVersion: unverified.version,
      day: "2026-07-15",
      evidence: {
        knowledgePointId: "kp2",
        sourceType: "weak_point",
        sourceId: "unverified-intervention",
        output: "完成训练",
      },
    });
    const noEvidence = createTask(db, legacyScope, {
      clientMutationId: "outcome-no-evidence",
      title: "无完成证据",
      dueDate: "2026-07-15",
    });
    completeTask(db, legacyScope, {
      id: noEvidence.id,
      expectedVersion: noEvidence.version,
      day: "2026-07-15",
      evidence: {
        knowledgePointId: "kp2",
        sourceType: "weak_point",
        sourceId: "no-evidence-intervention",
      },
    });
    const retest = createTask(db, legacyScope, {
      clientMutationId: "outcome-retest",
      title: "短复测",
      dueDate: "2026-07-18",
    });
    completeTask(db, legacyScope, {
      id: retest.id,
      expectedVersion: retest.version,
      day: "2026-07-18",
      evidence: {
        knowledgePointId: "kp2",
        sourceType: "training_retest",
        sourceId: `${structuredParent.id}:${structuredParent.version + 1}`,
        outcome: "verified",
        verificationOutcome: "improved",
      },
    });
    db.prepare(`
      UPDATE review_events
      SET created_at = '2099-01-01 00:00:00'
      WHERE knowledge_point_id = 'kp1'
    `).run();

    const outcomes = getLearningAnalytics(db, legacyScope, "2026-07-25").outcomes;

    expect(outcomes).toEqual({
      windowStart: "2026-04-27",
      windowEnd: "2026-07-25",
      delayedRecall7: { samples: 4, successes: 2, rate: 50 },
      delayedRecall30: { samples: 2, successes: 2, rate: 100 },
      mistakeReattempt: { samples: 2, successes: 1, rate: 50 },
      confidenceCalibration: { samples: 3, meanAbsoluteGap: 1.3 },
      backlogAge: { samples: 4, p50Days: 1, p90Days: 30 },
      interventionVerification: {
        eligible: 3,
        verified: 2,
        successful: 2,
        rate: 67,
      },
    });
  });
});
