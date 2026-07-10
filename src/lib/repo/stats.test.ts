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
});
