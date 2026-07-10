import { describe, expect, it } from "vitest";
import { getDay, updateDayEntry } from "./days";
import { createMistake, createReviewEvent, createStudySession, getMistakeBook, reattemptMistake } from "./reviews";
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

    const point = db.prepare("SELECT mastery, reviews, status, next_review FROM knowledge_points WHERE id = 'kp1'").get() as {
      mastery: number;
      reviews: number;
      status: string;
      next_review: string;
    };
    expect(point.mastery).toBe(16);
    expect(point.reviews).toBe(1);
    expect(point.status).toBe("学习中");
    expect(point.next_review).toBe("2026-07-04");
  });

  it("resets the ladder on a failed review", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("UPDATE knowledge_points SET mastery = 50, reviews = 3 WHERE id = 'kp1'").run();

    createReviewEvent(db, legacyScope, { day: "2026-07-01", knowledgePointId: "kp1", score: 0 });

    const point = db.prepare("SELECT mastery, next_review FROM knowledge_points WHERE id = 'kp1'").get() as {
      mastery: number;
      next_review: string;
    };
    expect(point.mastery).toBe(38);
    expect(point.next_review).toBe("2026-07-02");
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

  it("graduates a mistake when reattempted successfully and logs a review", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    createMistake(db, legacyScope, { day: "2026-07-01", title: "错题", knowledgePointId: "kp1" });

    const result = reattemptMistake(db, legacyScope, { id: 1, day: "2026-07-02", score: 3 });

    expect(result).toMatchObject({ graduated: 1, nextReview: null });
    expect(db.prepare("SELECT COUNT(*) c FROM review_events WHERE note = '错题回炉'").get()).toMatchObject({ c: 1 });

    const book = getMistakeBook(db, legacyScope, "2026-07-03");
    expect(book.graduated).toHaveLength(1);
    expect(book.due).toHaveLength(0);
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
