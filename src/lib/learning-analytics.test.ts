import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { initializeDatabase } from "./db";
import { runMigrations } from "./migrations";
import { getLearningAnalyticsWithDb } from "./repository";

describe("learning analytics", () => {
  it("summarizes the recent week and ranks weak points by urgency", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);
    db.exec(`
      INSERT INTO daily_entries (date, diary, summary) VALUES
        ('2026-07-01', 'worked on eigenvalues', ''),
        ('2026-07-05', '', 'reviewed PCA'),
        ('2026-07-07', 'today note', 'today summary');

      INSERT INTO study_sessions (day, subject_code, knowledge_point_id, title, duration_minutes) VALUES
        ('2026-06-30', 'M1', 'old', 'outside window', 999),
        ('2026-07-01', 'M1', 'kp-red', 'linear algebra', 45),
        ('2026-07-07', 'M8', 'kp-yellow', 'PCA', 60);

      INSERT INTO review_events (day, knowledge_point_id, score, note) VALUES
        ('2026-07-07', 'kp-red', 1, 'weak');

      INSERT INTO assets (day, original_name, safe_name, relative_path, mime_type, size) VALUES
        ('2026-07-07', 'notes.pdf', 'notes.pdf', 'blobs/aa/aaa', 'application/pdf', 12);

      INSERT INTO knowledge_points
        (id, subject_code, subject_name, submodule, tier, tier_name, title, exam, status, mastery, reviews, next_review)
      VALUES
        ('kp-red', 'M1', '数学', '线代', 'r', '红点', '特征值与对角化', 1, '学习中', 35, 2, '2026-07-07'),
        ('kp-yellow', 'M8', '机器学习', '降维', 'y', '黄点', 'PCA 主成分', 0, '学习中', 20, 1, '2026-07-09'),
        ('kp-done', 'M1', '数学', '矩阵', 'r', '红点', '矩阵乘法', 1, '已掌握', 92, 5, '2026-08-01');

      INSERT INTO mistakes (day, subject_code, knowledge_point_id, title, cause, next_review, graduated) VALUES
        ('2026-07-05', 'M1', 'kp-red', '对角化条件', '概念混淆', '2026-07-07', 0),
        ('2026-07-07', 'M1', 'kp-red', '特征向量', '计算慢', '2026-07-08', 0),
        ('2026-07-07', 'M8', 'kp-yellow', 'PCA 方差解释', '公式不熟', '2026-07-09', 0);
    `);

    const analytics = getLearningAnalyticsWithDb(db, "2026-07-07");

    expect(analytics.week).toEqual({
      start: "2026-07-01",
      end: "2026-07-07",
      studyMinutes: 105,
      reviews: 1,
      mistakes: 3,
      assets: 1,
      activeDays: 3,
      reflectionDays: 3,
    });
    expect(analytics.weakPoints.map((point) => point.id)).toEqual(["kp-red", "kp-yellow"]);
    expect(analytics.weakPoints[0]).toMatchObject({
      id: "kp-red",
      subjectCode: "M1",
      title: "特征值与对角化",
      openMistakes: 2,
      priorityScore: 152,
      reasons: ["红点", "掌握度 35", "今日到期", "未毕业错题 2", "真题"],
    });
  });
});
