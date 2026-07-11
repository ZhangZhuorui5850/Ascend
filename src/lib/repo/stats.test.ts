import { describe, expect, it } from "vitest";
import { getDaySnapshot, getLearningAnalytics, getStudyStreak } from "./stats";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "./testing";
import { LEGACY_WORKSPACE_ID } from "./workspaces";

const legacyScope = { workspaceId: LEGACY_WORKSPACE_ID };

describe("learning analytics", () => {
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
    db.prepare("INSERT INTO review_events (day, knowledge_point_id, score) VALUES ('2026-07-01', 'kp1', 1)").run();
    db.prepare("INSERT INTO mistakes (day, knowledge_point_id, title, graduated) VALUES ('2026-07-01', 'kp1', '错', 0)").run();
    db.prepare("INSERT INTO daily_entries (date, diary) VALUES ('2026-07-01', '写了复盘')").run();

    const analytics = getLearningAnalytics(db, legacyScope, "2026-07-02");

    expect(analytics.week).toMatchObject({
      start: "2026-06-26",
      end: "2026-07-02",
      studyMinutes: 90,
      reviews: 1,
      mistakes: 1,
      activeDays: 2,
      reflectionDays: 1,
    });
    expect(analytics.weakPoints[0]).toMatchObject({ id: "kp1", openMistakes: 1 });
    expect(analytics.weakPoints[0].priorityScore).toBeGreaterThan(100);
    expect(analytics.weakPoints[0].reasons).toContain("复习到期");
  });

  it("excludes mastered points from the weak point queue", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("UPDATE knowledge_points SET mastery = 90, status = '已掌握' WHERE id = 'kp1'").run();

    const analytics = getLearningAnalytics(db, legacyScope, "2026-07-02");

    expect(analytics.weakPoints).toHaveLength(0);
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
});
