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

  it("stores attempt mode, draft, duration, and pre-reveal confidence separately from outcome", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);

    createReviewEvent(db, legacyScope, {
      day: "2026-07-01",
      knowledgePointId: "kp1",
      score: 1,
      attemptMode: "typed",
      attemptText: "先写矩阵乘法的行列规则",
      attemptDurationSeconds: 37,
      preConfidence: 3,
    });

    expect(db.prepare(`
      SELECT score, attempt_mode, attempt_text, attempt_duration_seconds, pre_confidence
      FROM review_events
    `).get()).toEqual({
      score: 1,
      attempt_mode: "typed",
      attempt_text: "先写矩阵乘法的行列规则",
      attempt_duration_seconds: 37,
      pre_confidence: 3,
    });
  });

  it("does not invent attempt evidence for legacy-compatible writes", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);

    createReviewEvent(db, legacyScope, {
      day: "2026-07-01",
      knowledgePointId: "kp1",
      score: 3,
    });

    expect(db.prepare(`
      SELECT attempt_mode, attempt_text, attempt_duration_seconds, pre_confidence
      FROM review_events
    `).get()).toEqual({
      attempt_mode: "unknown",
      attempt_text: "",
      attempt_duration_seconds: 0,
      pre_confidence: null,
    });
  });

  it("rejects incomplete typed evidence before changing point state", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);

    expect(() => createReviewEvent(db, legacyScope, {
      day: "2026-07-01",
      knowledgePointId: "kp1",
      score: 3,
      attemptMode: "typed",
      attemptText: "",
      preConfidence: 2,
    })).toThrow("请输入简短草稿");

    expect(db.prepare("SELECT COUNT(*) AS count FROM review_events").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT reviews, mastery FROM knowledge_points WHERE id = 'kp1'").get())
      .toEqual({ reviews: 0, mastery: 0 });
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

    expect(() => reattemptMistake(
      db,
      legacyScope,
      { id: 1, day: "2026-07-02", score: 3 },
    )).toThrow("错题将在 2026-07-06 到期");
    expect(db.prepare("SELECT pass_count FROM mistakes WHERE id = 1").get()).toMatchObject({ pass_count: 1 });

    const second = reattemptMistake(db, legacyScope, { id: 1, day: "2026-07-06", score: 3 });
    expect(second).toMatchObject({ graduated: 1, nextReview: null });
    expect(db.prepare("SELECT COUNT(*) c FROM review_events WHERE note = '错题回炉'").get()).toMatchObject({ c: 2 });

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

  it("deduplicates mistake reattempt operations before applying the outcome", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    createMistake(db, legacyScope, {
      day: "2026-07-01",
      title: "错题",
      knowledgePointId: "kp1",
    });
    const input = {
      id: 1,
      day: "2026-07-02",
      score: 3,
      operationId: "mistake-op-1",
    };

    const first = reattemptMistake(db, legacyScope, input);
    const duplicate = reattemptMistake(db, legacyScope, input);

    expect(first.undo).not.toBeNull();
    expect(duplicate.undo).toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS count FROM review_events").get())
      .toMatchObject({ count: 1 });
    expect(db.prepare("SELECT reviews FROM knowledge_points WHERE id = 'kp1'").get())
      .toMatchObject({ reviews: 1 });
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

  it("does not reconstruct a historical queue from current schedules", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("UPDATE knowledge_points SET next_review = '2026-07-01' WHERE id = 'kp1'").run();
    createReviewEvent(db, legacyScope, {
      day: "2026-07-01",
      knowledgePointId: "kp1",
      score: 3,
    });

    const historical = getDay(db, legacyScope, "2026-07-01", {
      includeReviewQueue: false,
    });

    expect(historical.reviews).toHaveLength(1);
    expect(historical.dueReviews).toEqual([]);
    expect(historical.dueReviewsTotal).toBe(0);
    expect(historical.dueMistakes).toEqual([]);
    expect(historical.dueMistakesTotal).toBe(0);
  });

  it("shares the remaining daily capacity across reviews and mistakes", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("UPDATE knowledge_points SET next_review = '2026-07-01' WHERE id = 'kp1'").run();
    createMistake(db, legacyScope, { day: "2026-06-30", title: "错题一" });
    createMistake(db, legacyScope, { day: "2026-06-30", title: "错题二" });
    createReviewEvent(db, legacyScope, { day: "2026-07-01", score: 3 });

    const day = getDay(db, legacyScope, "2026-07-01", { reviewLimit: 2 });

    expect(day.reviews).toHaveLength(1);
    expect(day.dueReviewsTotal + day.dueMistakesTotal).toBe(3);
    expect(day.dueReviews.length + day.dueMistakes.length).toBe(1);
  });

  it("prioritizes exam points only for sprint subjects", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare(`
      INSERT INTO subjects (workspace_id, code, name, description)
      VALUES (@workspaceId, 'M2', '概率论', '')
    `).run({ workspaceId: LEGACY_WORKSPACE_ID });
    db.prepare(`
      INSERT INTO knowledge_points
        (workspace_id, id, subject_code, subject_name, submodule, tier, tier_name, title,
         exam, status, mastery, sort_order, next_review)
      VALUES
        (@workspaceId, 'kp-m2', 'M2', '概率论', '随机变量', 'g', '了解', '分布函数',
         1, '学习中', 30, 1, '2026-07-01')
    `).run({ workspaceId: LEGACY_WORKSPACE_ID });
    db.prepare(`
      UPDATE knowledge_points
      SET tier = 'r', tier_name = '精通', mastery = 5, next_review = '2026-07-01'
      WHERE id = 'kp1'
    `).run();

    const day = getDay(db, legacyScope, "2026-07-01", {
      reviewLimit: 1,
      sprintSubjectCodes: ["M2"],
    });

    expect(day.dueReviews.map((item) => item.id)).toEqual(["kp-m2"]);
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

  it("subtracts completed work before spreading today's shared backlog", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("UPDATE knowledge_points SET next_review = '2026-07-01' WHERE id = 'kp1'").run();
    createMistake(db, legacyScope, { day: "2026-06-30", title: "错题一" });
    createMistake(db, legacyScope, { day: "2026-06-30", title: "错题二" });
    createReviewEvent(db, legacyScope, { day: "2026-07-01", score: 3 });

    const result = spreadReviewBacklog(db, legacyScope, { day: "2026-07-01", dailyLimit: 2 });

    expect(result.moved).toBe(2);
    const due = getDay(db, legacyScope, "2026-07-01", { reviewLimit: 10 });
    expect(due.dueReviewsTotal + due.dueMistakesTotal).toBe(1);
  });

  it("does not overfill future days when spreading a backlog", () => {
    const db = createTestDb();
    for (let index = 1; index <= 6; index += 1) {
      createMistake(db, legacyScope, {
        day: "2026-06-30",
        title: `错题 ${index}`,
      });
    }
    db.prepare("UPDATE mistakes SET next_review = '2026-07-02' WHERE id IN (1, 2)").run();
    db.prepare("UPDATE mistakes SET next_review = '2026-07-03' WHERE id = 3").run();
    createReviewEvent(db, legacyScope, { day: "2026-07-01", score: 3 });

    const result = spreadReviewBacklog(db, legacyScope, {
      day: "2026-07-01",
      dailyLimit: 2,
      horizonDays: 2,
    });

    expect(result).toEqual({ moved: 1, throughDate: "2026-07-03" });
    expect(db.prepare(`
      SELECT next_review AS day, COUNT(*) AS count
      FROM mistakes
      WHERE next_review BETWEEN '2026-07-02' AND '2026-07-03'
      GROUP BY next_review
      ORDER BY next_review
    `).all()).toEqual([
      { day: "2026-07-02", count: 2 },
      { day: "2026-07-03", count: 2 },
    ]);
    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM mistakes
      WHERE next_review <= '2026-07-01'
    `).get()).toEqual({ count: 2 });
  });

  it("records unlinked mistake reattempts as completed review work", () => {
    const db = createTestDb();
    createMistake(db, legacyScope, { day: "2026-07-01", title: "未关联错题" });

    const result = reattemptMistake(db, legacyScope, {
      id: 1,
      day: "2026-07-02",
      score: 3,
      attemptMode: "paper",
      attemptDurationSeconds: 45,
      preConfidence: 2,
    });

    expect(result.undo?.eventId).not.toBeNull();
    expect(db.prepare(`
      SELECT knowledge_point_id, note, event_type, attempt_mode,
             attempt_duration_seconds, pre_confidence
      FROM review_events
      WHERE day = '2026-07-02'
    `).get()).toMatchObject({
      knowledge_point_id: null,
      note: "错题回炉",
      event_type: "mistake_reattempt",
      attempt_mode: "paper",
      attempt_duration_seconds: 45,
      pre_confidence: 2,
    });
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
