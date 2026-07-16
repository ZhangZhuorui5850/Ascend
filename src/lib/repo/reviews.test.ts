import { describe, expect, it } from "vitest";
import { getDay, updateDayEntry } from "./days";
import {
  createMistake,
  createReviewEvent,
  createStudySession,
  getMistakeBook,
  markPointLearned,
  reattemptMistake,
  spreadReviewBacklog,
} from "./reviews";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "./testing";
import { LEGACY_WORKSPACE_ID } from "./workspaces";

const legacyScope = { workspaceId: LEGACY_WORKSPACE_ID };

describe("reviews repo", () => {
  it("keeps mistakes isolated and rejects cross-workspace reattempts", () => {
    const db = createTestDb();
    const a = createTestWorkspace(db, { userId: "user-a", email: "a@example.com" });
    const b = createTestWorkspace(db, { userId: "user-b", email: "b@example.com" });
    const aMistake = createMistake(db, a, { day: "2026-07-01", title: "A 的错题" });
    createMistake(db, b, { day: "2026-07-01", title: "B 的错题" });

    expect(getMistakeBook(db, a, "2026-07-02").due.map((item) => item.title)).toEqual(["A 的错题"]);
    expect(() => reattemptMistake(db, b, { id: aMistake.id, day: "2026-07-02", score: 3 })).toThrow(
      "错题不存在",
    );
  });
  it("raises mastery and schedules the next review on success", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);

    createReviewEvent(db, legacyScope, { day: "2026-07-01", knowledgePointId: "kp1", score: 3 });

    const point = db.prepare(`
      SELECT mastery, reviews, status, next_review, interval_step, last_score
      FROM knowledge_points WHERE id = 'kp1'
    `).get() as {
      mastery: number;
      reviews: number;
      status: string;
      next_review: string;
      interval_step: number;
      last_score: number;
    };
    expect(point.mastery).toBe(16);
    expect(point.reviews).toBe(1);
    expect(point.status).toBe("学习中");
    expect(point.next_review).toBe("2026-07-04");
    expect(point.interval_step).toBe(1);
    expect(point.last_score).toBe(3);
  });

  it("resets the ladder on a failed review", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("UPDATE knowledge_points SET mastery = 50, reviews = 8, interval_step = 4 WHERE id = 'kp1'").run();

    createReviewEvent(db, legacyScope, { day: "2026-07-01", knowledgePointId: "kp1", score: 0 });

    const point = db.prepare(`
      SELECT mastery, next_review, interval_step, lapse_count FROM knowledge_points WHERE id = 'kp1'
    `).get() as {
      mastery: number;
      next_review: string;
      interval_step: number;
      lapse_count: number;
    };
    expect(point.mastery).toBe(38);
    expect(point.next_review).toBe("2026-07-02");
    expect(point.interval_step).toBe(0);
    expect(point.lapse_count).toBe(1);

    createReviewEvent(db, legacyScope, { day: "2026-07-02", knowledgePointId: "kp1", score: 2 });
    expect(db.prepare("SELECT next_review, interval_step FROM knowledge_points WHERE id = 'kp1'").get()).toMatchObject({
      next_review: "2026-07-05",
      interval_step: 1,
    });
  });

  it("schedules D+1 after a knowledge-linked study session and preserves an existing schedule", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);

    createStudySession(db, legacyScope, {
      day: "2026-07-01",
      title: "学习矩阵乘法",
      subjectCode: "wrong",
      knowledgePointId: "kp1",
    });

    expect(db.prepare("SELECT subject_code, knowledge_point_id FROM study_sessions").get()).toMatchObject({
      subject_code: "M1",
      knowledge_point_id: "kp1",
    });
    expect(db.prepare("SELECT status, next_review FROM knowledge_points WHERE id = 'kp1'").get()).toMatchObject({
      status: "学习中",
      next_review: "2026-07-02",
    });

    db.prepare("UPDATE knowledge_points SET next_review = '2026-07-10' WHERE id = 'kp1'").run();
    markPointLearned(db, legacyScope, { knowledgePointId: "kp1", day: "2026-07-03" });
    expect(db.prepare("SELECT next_review FROM knowledge_points WHERE id = 'kp1'").get()).toMatchObject({
      next_review: "2026-07-10",
    });
  });

  it("rejects knowledge links from another workspace", () => {
    const db = createTestDb();
    const owner = createTestWorkspace(db, { userId: "linked-owner", email: "linked-owner@example.com" });
    const other = createTestWorkspace(db, { userId: "linked-other", email: "linked-other@example.com" });
    const subject = db.prepare("SELECT code, name FROM subjects WHERE workspace_id = ? ORDER BY code LIMIT 1").get(
      other.workspaceId,
    ) as { code: string; name: string };
    db.prepare(`
      INSERT INTO knowledge_points
        (workspace_id, id, subject_code, subject_name, submodule, tier, tier_name, title)
      VALUES (?, 'foreign-kp', ?, ?, '', 'g', '了解', '外部知识点')
    `).run(other.workspaceId, subject.code, subject.name);

    expect(() => createStudySession(db, owner, {
      day: "2026-07-01",
      title: "越权关联",
      knowledgePointId: "foreign-kp",
    })).toThrow("知识点不存在");
    expect(db.prepare("SELECT COUNT(*) AS count FROM study_sessions").get()).toMatchObject({ count: 0 });
  });

  it("creating a mistake lowers mastery and schedules D+1 review", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("UPDATE knowledge_points SET mastery = 90, status = '已掌握' WHERE id = 'kp1'").run();

    createMistake(db, legacyScope, { day: "2026-07-01", title: "漏了 bias", knowledgePointId: "kp1", subjectCode: "M1" });

    const mistake = db.prepare("SELECT next_review, graduated FROM mistakes").get();
    expect(mistake).toMatchObject({ next_review: "2026-07-02", graduated: 0 });
    const point = db.prepare("SELECT mastery, status FROM knowledge_points WHERE id = 'kp1'").get();
    expect(point).toMatchObject({ mastery: 75, status: "学习中" });
  });

  it("graduates a mistake after two successful reattempts on different days", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    createMistake(db, legacyScope, { day: "2026-07-01", title: "错题", knowledgePointId: "kp1" });

    const first = reattemptMistake(db, legacyScope, { id: 1, day: "2026-07-02", score: 3 });

    expect(first).toMatchObject({ graduated: 0, nextReview: "2026-07-06" });
    expect(db.prepare("SELECT pass_count FROM mistakes WHERE id = 1").get()).toMatchObject({ pass_count: 1 });

    const sameDay = reattemptMistake(db, legacyScope, { id: 1, day: "2026-07-02", score: 3 });
    expect(sameDay).toMatchObject({ graduated: 0, nextReview: "2026-07-06" });
    expect(db.prepare("SELECT pass_count FROM mistakes WHERE id = 1").get()).toMatchObject({ pass_count: 1 });

    const second = reattemptMistake(db, legacyScope, { id: 1, day: "2026-07-06", score: 3 });
    expect(second).toMatchObject({ graduated: 1, nextReview: null });
    expect(db.prepare("SELECT COUNT(*) c FROM review_events WHERE note = '错题回炉'").get()).toMatchObject({ c: 3 });

    const book = getMistakeBook(db, legacyScope, "2026-07-03");
    expect(book.graduated).toHaveLength(1);
    expect(book.due).toHaveLength(0);
  });

  it("resets mistake pass progress after another failure", () => {
    const db = createTestDb();
    createMistake(db, legacyScope, { day: "2026-07-01", title: "错题" });
    reattemptMistake(db, legacyScope, { id: 1, day: "2026-07-02", score: 3 });
    reattemptMistake(db, legacyScope, { id: 1, day: "2026-07-06", score: 1 });

    expect(db.prepare("SELECT pass_count, last_pass_day, next_review FROM mistakes WHERE id = 1").get()).toMatchObject({
      pass_count: 0,
      last_pass_day: null,
      next_review: "2026-07-07",
    });
  });

  it("deduplicates review operations before applying the outcome", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    const input = { day: "2026-07-01", knowledgePointId: "kp1", score: 3, operationId: "op-1" };

    createReviewEvent(db, legacyScope, input);
    createReviewEvent(db, legacyScope, input);

    expect(db.prepare("SELECT COUNT(*) AS count FROM review_events").get()).toMatchObject({ count: 1 });
    expect(db.prepare("SELECT reviews FROM knowledge_points WHERE id = 'kp1'").get()).toMatchObject({ reviews: 1 });
  });

  it("keeps failed reattempts in the due queue", () => {
    const db = createTestDb();
    createMistake(db, legacyScope, { day: "2026-07-01", title: "错题" });

    reattemptMistake(db, legacyScope, { id: 1, day: "2026-07-02", score: 1 });

    const book = getMistakeBook(db, legacyScope, "2026-07-03");
    expect(book.due).toHaveLength(1);
    expect(book.due[0].next_review).toBe("2026-07-03");
  });

  it("collects due reviews and mistakes into the day view", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("UPDATE knowledge_points SET next_review = '2026-07-01' WHERE id = 'kp1'").run();
    createMistake(db, legacyScope, { day: "2026-06-30", title: "回炉我" });
    createStudySession(db, legacyScope, { day: "2026-07-01", title: "推导", durationMinutes: 45 });
    updateDayEntry(db, legacyScope, "2026-07-01", { plan: "上午特征值" });

    const day = getDay(db, legacyScope, "2026-07-01");

    expect(day.entry.plan).toBe("上午特征值");
    expect(day.dueReviews.map((review) => review.id)).toEqual(["kp1"]);
    expect(day.dueMistakes.map((mistake) => mistake.title)).toEqual(["回炉我"]);
    expect(day.sessions[0]).toMatchObject({ title: "推导", duration_minutes: 45 });
  });

  it("prioritizes mastery tiers explicitly when the daily queue is capped", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare(`
      INSERT INTO knowledge_points
        (workspace_id, id, subject_code, subject_name, submodule, tier, tier_name, title,
         status, mastery, chapter_id, sort_order, next_review)
      VALUES
        (@workspaceId, 'kp-g', 'M1', '线性代数', '矩阵', 'g', '了解', '了解点', '学习中', 10, 'chapter:M1:matrix', 2, '2026-06-20'),
        (@workspaceId, 'kp-y', 'M1', '线性代数', '矩阵', 'y', '掌握', '掌握点', '学习中', 20, 'chapter:M1:matrix', 3, '2026-06-25')
    `).run({ workspaceId: LEGACY_WORKSPACE_ID });
    db.prepare("UPDATE knowledge_points SET next_review = '2026-07-01' WHERE id = 'kp1'").run();

    expect(getDay(db, legacyScope, "2026-07-01", { reviewLimit: 2 }).dueReviews.map((item) => item.id)).toEqual([
      "kp1",
      "kp-y",
    ]);
  });

  it("spreads review overflow across the next seven days", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("UPDATE knowledge_points SET next_review = '2026-07-01' WHERE id = 'kp1'").run();
    for (let index = 0; index < 4; index += 1) createMistake(db, legacyScope, { day: "2026-06-30", title: `错题 ${index}` });

    const result = spreadReviewBacklog(db, legacyScope, { day: "2026-07-01", dailyLimit: 2 });

    expect(result.moved).toBe(3);
    const due = getDay(db, legacyScope, "2026-07-01", { reviewLimit: 10 });
    expect(due.dueReviewsTotal + due.dueMistakesTotal).toBe(2);
    expect(db.prepare("SELECT COUNT(*) AS count FROM mistakes WHERE next_review > '2026-07-01'").get()).toMatchObject({ count: 3 });
    expect(db.prepare("SELECT moved_count, horizon_days FROM review_recovery_events").get()).toMatchObject({ moved_count: 3, horizon_days: 7 });
  });

  it("partially updates day entries without clobbering other fields", () => {
    const db = createTestDb();
    updateDayEntry(db, legacyScope, "2026-07-01", { plan: "计划", summary: "总结" });
    updateDayEntry(db, legacyScope, "2026-07-01", { diary: "过程" });

    const entry = db.prepare("SELECT plan, diary, summary FROM daily_entries WHERE date = '2026-07-01'").get();
    expect(entry).toMatchObject({ plan: "计划", diary: "过程", summary: "总结" });
  });

  it("rejects invalid dates and empty titles", () => {
    const db = createTestDb();
    expect(() => createStudySession(db, legacyScope, { day: "bad", title: "x" })).toThrow();
    expect(() => createStudySession(db, legacyScope, { day: "2026-07-01", title: "  " })).toThrow();
  });
});
