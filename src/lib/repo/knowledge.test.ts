import { describe, expect, it } from "vitest";
import {
  createChapter,
  createPoint,
  createSubject,
  deleteChapter,
  deletePoint,
  deleteSubject,
  getCaptureHierarchy,
  getSubjects,
  getSubjectDetail,
  getSubjectOverviews,
  moveChapter,
  renameChapter,
  updatePoint,
} from "./knowledge";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "./testing";
import { LEGACY_WORKSPACE_ID } from "./workspaces";

const legacyScope = { workspaceId: LEGACY_WORKSPACE_ID };

describe("knowledge repo", () => {
  it("keeps identical subject structures isolated by workspace", () => {
    const db = createTestDb();
    const a = createTestWorkspace(db, { userId: "user-a", email: "a@example.com" });
    const b = createTestWorkspace(db, { userId: "user-b", email: "b@example.com" });

    createSubject(db, a, { code: "OWN", name: "A 的科目" });
    createSubject(db, b, { code: "OWN", name: "B 的科目" });

    expect(getSubjects(db, a).map((subject) => subject.name)).toContain("A 的科目");
    expect(getSubjects(db, a).map((subject) => subject.name)).not.toContain("B 的科目");
    expect(getSubjectDetail(db, b, "ONLY-A")).toBeNull();
  });
  it("creates subject -> chapter -> point hierarchy", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const chapter = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    createPoint(db, legacyScope, { chapterId: chapter.id, title: "知识点 A", tier: "r" });

    const hierarchy = getCaptureHierarchy(db, legacyScope);
    const subject = hierarchy.find((item) => item.code === "M9");
    expect(subject?.chapters).toHaveLength(1);
    expect(subject?.chapters[0].points.map((point) => point.title)).toEqual(["知识点 A"]);
  });

  it("deduplicates chapters and points by title", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const first = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    const second = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    expect(second.id).toBe(first.id);

    const pointA = createPoint(db, legacyScope, { chapterId: first.id, title: "同名" });
    const pointB = createPoint(db, legacyScope, { chapterId: first.id, title: "同名" });
    expect(pointB.id).toBe(pointA.id);
  });

  it("cascades chapter deletion to points but keeps review history", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("INSERT INTO review_events (day, knowledge_point_id, score) VALUES ('2026-07-01', 'kp1', 3)").run();
    db.prepare("INSERT INTO mistakes (day, knowledge_point_id, title) VALUES ('2026-07-01', 'kp1', '错题')").run();

    deleteChapter(db, legacyScope, "chapter:M1:matrix");

    expect(db.prepare("SELECT COUNT(*) c FROM knowledge_points").get()).toMatchObject({ c: 0 });
    expect(db.prepare("SELECT knowledge_point_id FROM review_events").get()).toMatchObject({ knowledge_point_id: null });
    expect(db.prepare("SELECT knowledge_point_id FROM mistakes").get()).toMatchObject({ knowledge_point_id: null });
  });

  it("cascades subject deletion", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);

    deleteSubject(db, legacyScope, "M1");

    expect(db.prepare("SELECT COUNT(*) c FROM subjects").get()).toMatchObject({ c: 0 });
    expect(db.prepare("SELECT COUNT(*) c FROM subject_chapters").get()).toMatchObject({ c: 0 });
    expect(db.prepare("SELECT COUNT(*) c FROM knowledge_points").get()).toMatchObject({ c: 0 });
  });

  it("updates point tier and title", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);

    updatePoint(db, legacyScope, { id: "kp1", title: "矩阵乘法与逆", tier: "g" });

    const point = db.prepare("SELECT title, tier, tier_name FROM knowledge_points WHERE id = 'kp1'").get();
    expect(point).toMatchObject({ title: "矩阵乘法与逆", tier: "g", tier_name: "了解" });
  });

  it("reorders chapters", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试" });
    const a = createChapter(db, legacyScope, { subjectCode: "M9", title: "A" });
    const b = createChapter(db, legacyScope, { subjectCode: "M9", title: "B" });

    moveChapter(db, legacyScope, { id: b.id, direction: "up" });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    expect(detail?.chapters.map((chapter) => chapter.title)).toEqual(["B", "A"]);
    expect(a.id).not.toBe(b.id);
  });

  it("renames chapters and rejects missing ids", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    renameChapter(db, legacyScope, { id: "chapter:M1:matrix", title: "矩阵与行列式" });
    expect(db.prepare("SELECT title FROM subject_chapters").get()).toMatchObject({ title: "矩阵与行列式" });
    expect(() => renameChapter(db, legacyScope, { id: "missing", title: "x" })).toThrow();
  });

  it("summarizes subject overviews with due and mistake counts", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare("UPDATE knowledge_points SET next_review = '2026-07-01' WHERE id = 'kp1'").run();
    db.prepare("INSERT INTO mistakes (day, subject_code, knowledge_point_id, title) VALUES ('2026-07-01', 'M1', 'kp1', '错题')").run();

    const [overview] = getSubjectOverviews(db, legacyScope, "2026-07-02");

    expect(overview).toMatchObject({ code: "M1", pointCount: 1, dueCount: 1, openMistakes: 1 });
  });

  it("deletes a single point and detaches asset links", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    db.prepare(`
      INSERT INTO assets (day, original_name, safe_name, relative_path)
      VALUES ('2026-07-01', 'a.png', 'a.png', 'blobs/aa/a')
    `).run();
    db.prepare("INSERT INTO asset_links (asset_id, subject_code, chapter_id, knowledge_point_id) VALUES (1, 'M1', 'chapter:M1:matrix', 'kp1')").run();

    deletePoint(db, legacyScope, "kp1");

    expect(db.prepare("SELECT COUNT(*) c FROM asset_links WHERE knowledge_point_id = 'kp1'").get()).toMatchObject({ c: 0 });
    expect(db.prepare("SELECT COUNT(*) c FROM assets").get()).toMatchObject({ c: 1 });
  });

  it("stamps created_at on new points and exposes it in detail queries", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const chapter = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    createPoint(db, legacyScope, { chapterId: chapter.id, title: "知识点 A" });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    const point = detail?.chapters[0]?.points[0];
    expect(point?.created_at).toBeTruthy();
    expect(point?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("updates mastery manually and derives status", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);

    updatePoint(db, legacyScope, { id: "kp1", mastery: 85 });
    let row = db.prepare("SELECT mastery, status FROM knowledge_points WHERE id = 'kp1'").get();
    expect(row).toMatchObject({ mastery: 85, status: "已掌握" });

    updatePoint(db, legacyScope, { id: "kp1", mastery: 250 });
    row = db.prepare("SELECT mastery, status FROM knowledge_points WHERE id = 'kp1'").get();
    expect(row).toMatchObject({ mastery: 100, status: "已掌握" });

    updatePoint(db, legacyScope, { id: "kp1", mastery: 0 });
    row = db.prepare("SELECT mastery, status FROM knowledge_points WHERE id = 'kp1'").get();
    expect(row).toMatchObject({ mastery: 0, status: "未学" });

    // 不传 mastery 时不得改动
    updatePoint(db, legacyScope, { id: "kp1", title: "矩阵乘法（改名）" });
    row = db.prepare("SELECT mastery, status FROM knowledge_points WHERE id = 'kp1'").get();
    expect(row).toMatchObject({ mastery: 0, status: "未学" });
  });
});
