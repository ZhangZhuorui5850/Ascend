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
  moveChapterToPosition,
  movePointToPosition,
  renameChapter,
  reorderPoints,
  reparentChapter,
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

  it("reorders points within a chapter transactionally", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const chapter = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    const a = createPoint(db, legacyScope, { chapterId: chapter.id, title: "甲" });
    const b = createPoint(db, legacyScope, { chapterId: chapter.id, title: "乙" });
    const c = createPoint(db, legacyScope, { chapterId: chapter.id, title: "丙" });

    reorderPoints(db, legacyScope, { chapterId: chapter.id, orderedIds: [c.id, a.id, b.id] });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    expect(detail?.chapters[0].points.map((point) => point.title)).toEqual(["丙", "甲", "乙"]);
  });

  it("rejects reorder lists that do not match the chapter", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const chapter = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    const a = createPoint(db, legacyScope, { chapterId: chapter.id, title: "甲" });
    createPoint(db, legacyScope, { chapterId: chapter.id, title: "乙" });

    expect(() => reorderPoints(db, legacyScope, { chapterId: chapter.id, orderedIds: [a.id] })).toThrow();
    expect(() => reorderPoints(db, legacyScope, { chapterId: chapter.id, orderedIds: [a.id, "kp-别人的"] })).toThrow();
  });

  it("scopes reorder to the workspace", () => {
    const db = createTestDb();
    // 先用一个占位工作区认领掉 legacy 工作区槽位，避免下面的 "a" 在全新数据库里
    // 因为是第一个被认领的工作区而意外拿到 LEGACY_WORKSPACE_ID，导致与 legacyScope 撞车。
    createTestWorkspace(db, { userId: "user-placeholder", email: "placeholder@example.com" });
    const a = createTestWorkspace(db, { userId: "user-a", email: "a2@example.com" });
    createSubject(db, a, { code: "M9", name: "A 的科目" });
    const chapter = createChapter(db, a, { subjectCode: "M9", title: "第一章" });
    const p1 = createPoint(db, a, { chapterId: chapter.id, title: "甲" });
    const p2 = createPoint(db, a, { chapterId: chapter.id, title: "乙" });

    // 用 legacy workspace 的 scope 去重排 A 的章节：应因为集合不匹配而抛错
    expect(() => reorderPoints(db, legacyScope, { chapterId: chapter.id, orderedIds: [p2.id, p1.id] })).toThrow();
  });

  it("moves a point within its chapter to the given position", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试" });
    const chapter = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    const a = createPoint(db, legacyScope, { chapterId: chapter.id, title: "A" });
    createPoint(db, legacyScope, { chapterId: chapter.id, title: "B" });
    createPoint(db, legacyScope, { chapterId: chapter.id, title: "C" });

    movePointToPosition(db, legacyScope, { pointId: a.id, targetChapterId: chapter.id, index: 2 });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    expect(detail?.chapters[0].points.map((point) => point.title)).toEqual(["B", "C", "A"]);
  });

  it("moves a point across chapters, renumbers both and syncs submodule", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试" });
    const first = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    const second = createChapter(db, legacyScope, { subjectCode: "M9", title: "第二章" });
    const a = createPoint(db, legacyScope, { chapterId: first.id, title: "A" });
    createPoint(db, legacyScope, { chapterId: first.id, title: "B" });
    createPoint(db, legacyScope, { chapterId: second.id, title: "C" });

    movePointToPosition(db, legacyScope, { pointId: a.id, targetChapterId: second.id, index: 0 });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    const chapters = detail?.chapters ?? [];
    expect(chapters.find((c) => c.id === first.id)?.points.map((p) => p.title)).toEqual(["B"]);
    expect(chapters.find((c) => c.id === second.id)?.points.map((p) => p.title)).toEqual(["A", "C"]);
    const moved = db.prepare(
      "SELECT chapter_id, submodule, sort_order FROM knowledge_points WHERE id = ?",
    ).get(a.id);
    expect(moved).toMatchObject({ chapter_id: second.id, submodule: "第二章", sort_order: 1 });
    const left = db.prepare(
      "SELECT sort_order FROM knowledge_points WHERE chapter_id = ?",
    ).get(first.id);
    expect(left).toMatchObject({ sort_order: 1 });
  });

  it("clamps an out-of-range point index to the end", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试" });
    const chapter = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    const a = createPoint(db, legacyScope, { chapterId: chapter.id, title: "A" });
    createPoint(db, legacyScope, { chapterId: chapter.id, title: "B" });

    movePointToPosition(db, legacyScope, { pointId: a.id, targetChapterId: chapter.id, index: 99 });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    expect(detail?.chapters[0].points.map((point) => point.title)).toEqual(["B", "A"]);
  });

  it("rejects cross-subject point moves and missing rows", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "甲" });
    createSubject(db, legacyScope, { code: "M8", name: "乙" });
    const home = createChapter(db, legacyScope, { subjectCode: "M9", title: "甲一章" });
    const foreign = createChapter(db, legacyScope, { subjectCode: "M8", title: "乙一章" });
    const a = createPoint(db, legacyScope, { chapterId: home.id, title: "A" });

    expect(() =>
      movePointToPosition(db, legacyScope, { pointId: a.id, targetChapterId: foreign.id, index: 0 }),
    ).toThrow("不能移动到其他科目的章节");
    expect(() =>
      movePointToPosition(db, legacyScope, { pointId: "missing", targetChapterId: home.id, index: 0 }),
    ).toThrow("知识点不存在");
    expect(() =>
      movePointToPosition(db, legacyScope, { pointId: a.id, targetChapterId: "missing", index: 0 }),
    ).toThrow("目标章节不存在");
  });

  it("keeps point moves isolated by workspace", () => {
    const db = createTestDb();
    const alice = createTestWorkspace(db, { userId: "user-a-move", email: "a-move@example.com" });
    const bob = createTestWorkspace(db, { userId: "user-b-move", email: "b-move@example.com" });
    createSubject(db, alice, { code: "OWN", name: "A 的科目" });
    const chapter = createChapter(db, alice, { subjectCode: "OWN", title: "第一章" });
    const point = createPoint(db, alice, { chapterId: chapter.id, title: "A" });

    expect(() =>
      movePointToPosition(db, bob, { pointId: point.id, targetChapterId: chapter.id, index: 0 }),
    ).toThrow("知识点不存在");
  });

  it("reorders a chapter among top-level siblings", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试" });
    createChapter(db, legacyScope, { subjectCode: "M9", title: "A" });
    createChapter(db, legacyScope, { subjectCode: "M9", title: "B" });
    const c = createChapter(db, legacyScope, { subjectCode: "M9", title: "C" });

    moveChapterToPosition(db, legacyScope, { id: c.id, parentId: null, index: 0 });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    expect(detail?.chapters.map((chapter) => chapter.title)).toEqual(["C", "A", "B"]);
  });

  it("moves a chapter under a new parent at the given position", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试" });
    const parent = createChapter(db, legacyScope, { subjectCode: "M9", title: "父" });
    createChapter(db, legacyScope, { subjectCode: "M9", title: "老大", parentId: parent.id });
    const joiner = createChapter(db, legacyScope, { subjectCode: "M9", title: "插队" });

    moveChapterToPosition(db, legacyScope, { id: joiner.id, parentId: parent.id, index: 0 });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    const tree = detail?.chapters.find((chapter) => chapter.id === parent.id);
    expect(tree?.children.map((child) => child.title)).toEqual(["插队", "老大"]);
  });

  it("moves a nested chapter back to top level", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试" });
    const parent = createChapter(db, legacyScope, { subjectCode: "M9", title: "父" });
    const child = createChapter(db, legacyScope, { subjectCode: "M9", title: "子", parentId: parent.id });

    moveChapterToPosition(db, legacyScope, { id: child.id, parentId: null, index: 0 });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    expect(detail?.chapters.map((chapter) => chapter.title)).toEqual(["子", "父"]);
    expect(detail?.chapters.find((chapter) => chapter.id === parent.id)?.children).toEqual([]);
  });

  it("rejects moving a chapter into its own subtree", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试" });
    const root = createChapter(db, legacyScope, { subjectCode: "M9", title: "根" });
    const leaf = createChapter(db, legacyScope, { subjectCode: "M9", title: "叶", parentId: root.id });

    expect(() =>
      moveChapterToPosition(db, legacyScope, { id: root.id, parentId: leaf.id, index: 0 }),
    ).toThrow("不能移动到自己的子章节里");
  });

  it("rejects chapter moves beyond the max depth", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试" });
    let parentId: string | null = null;
    let deepest = "";
    for (let level = 1; level <= 8; level += 1) {
      const created = createChapter(db, legacyScope, { subjectCode: "M9", title: `层${level}`, parentId });
      parentId = created.id;
      deepest = created.id;
    }
    const extra = createChapter(db, legacyScope, { subjectCode: "M9", title: "顶层" });

    expect(() =>
      moveChapterToPosition(db, legacyScope, { id: extra.id, parentId: deepest, index: 0 }),
    ).toThrow(/层级/);
  });

  it("keeps chapter moves isolated by workspace", () => {
    const db = createTestDb();
    const alice = createTestWorkspace(db, { userId: "user-a2", email: "a2-chapter@example.com" });
    const bob = createTestWorkspace(db, { userId: "user-b2", email: "b2-chapter@example.com" });
    createSubject(db, alice, { code: "OWN", name: "A 的科目" });
    const chapter = createChapter(db, alice, { subjectCode: "OWN", title: "第一章" });

    expect(() =>
      moveChapterToPosition(db, bob, { id: chapter.id, parentId: null, index: 0 }),
    ).toThrow("章节不存在");
  });
});

describe("章节递归树", () => {
  it("getSubjectDetail 按 parent_id 组装章节树", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const root = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    const child = createChapter(db, legacyScope, { subjectCode: "M9", title: "1.1 小节", parentId: root.id });
    createChapter(db, legacyScope, { subjectCode: "M9", title: "1.1.1 细目", parentId: child.id });
    createChapter(db, legacyScope, { subjectCode: "M9", title: "第二章" });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    expect(detail?.chapters.map((c) => c.title)).toEqual(["第一章", "第二章"]);
    expect(detail?.chapters[0].children.map((c) => c.title)).toEqual(["1.1 小节"]);
    expect(detail?.chapters[0].children[0].children.map((c) => c.title)).toEqual(["1.1.1 细目"]);
  });

  it("知识点可以挂在任意层级的章节下", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const root = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    const child = createChapter(db, legacyScope, { subjectCode: "M9", title: "1.1", parentId: root.id });
    createPoint(db, legacyScope, { chapterId: child.id, title: "深层知识点" });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    expect(detail?.chapters[0].children[0].points.map((p) => p.title)).toEqual(["深层知识点"]);
  });

  it("同科目同名章节在不同父级下拒绝创建", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const a = createChapter(db, legacyScope, { subjectCode: "M9", title: "甲" });
    createChapter(db, legacyScope, { subjectCode: "M9", title: "乙" });
    // 同父级同名：幂等返回既有 id
    expect(createChapter(db, legacyScope, { subjectCode: "M9", title: "甲" }).id).toBe(a.id);
    // 不同父级同名：明确报错
    expect(() => createChapter(db, legacyScope, { subjectCode: "M9", title: "乙", parentId: a.id })).toThrow();
  });

  it("reparentChapter 防环：不能移入自身或子孙", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const a = createChapter(db, legacyScope, { subjectCode: "M9", title: "甲" });
    const b = createChapter(db, legacyScope, { subjectCode: "M9", title: "乙", parentId: a.id });
    const c = createChapter(db, legacyScope, { subjectCode: "M9", title: "丙", parentId: b.id });

    expect(() => reparentChapter(db, legacyScope, { id: a.id, parentId: a.id })).toThrow();
    expect(() => reparentChapter(db, legacyScope, { id: a.id, parentId: c.id })).toThrow();
  });

  it("reparentChapter 移动与提升", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const a = createChapter(db, legacyScope, { subjectCode: "M9", title: "甲" });
    const b = createChapter(db, legacyScope, { subjectCode: "M9", title: "乙" });

    reparentChapter(db, legacyScope, { id: b.id, parentId: a.id });
    let detail = getSubjectDetail(db, legacyScope, "M9");
    expect(detail?.chapters.map((c) => c.title)).toEqual(["甲"]);
    expect(detail?.chapters[0].children.map((c) => c.title)).toEqual(["乙"]);

    reparentChapter(db, legacyScope, { id: b.id, parentId: null });
    detail = getSubjectDetail(db, legacyScope, "M9");
    expect(detail?.chapters.map((c) => c.title)).toEqual(["甲", "乙"]);
  });

  it("章节层级最深 8 层", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    let parentId: string | undefined;
    for (let level = 1; level <= 8; level += 1) {
      parentId = createChapter(db, legacyScope, { subjectCode: "M9", title: `层${level}`, parentId }).id;
    }
    expect(() => createChapter(db, legacyScope, { subjectCode: "M9", title: "层9", parentId })).toThrow();
  });

  it("deleteChapter 级联删除全部子孙章节及其知识点", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const root = createChapter(db, legacyScope, { subjectCode: "M9", title: "根" });
    const child = createChapter(db, legacyScope, { subjectCode: "M9", title: "子", parentId: root.id });
    const grand = createChapter(db, legacyScope, { subjectCode: "M9", title: "孙", parentId: child.id });
    createPoint(db, legacyScope, { chapterId: grand.id, title: "孙下知识点" });
    createChapter(db, legacyScope, { subjectCode: "M9", title: "旁支" });

    deleteChapter(db, legacyScope, root.id);

    const detail = getSubjectDetail(db, legacyScope, "M9");
    expect(detail?.chapters.map((c) => c.title)).toEqual(["旁支"]);
    expect(db.prepare("SELECT COUNT(*) c FROM knowledge_points WHERE title = '孙下知识点'").get()).toMatchObject({ c: 0 });
  });

  it("同层重排只影响同 parent 的兄弟", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const a = createChapter(db, legacyScope, { subjectCode: "M9", title: "甲" });
    createChapter(db, legacyScope, { subjectCode: "M9", title: "子1", parentId: a.id });
    const z2 = createChapter(db, legacyScope, { subjectCode: "M9", title: "子2", parentId: a.id });
    createChapter(db, legacyScope, { subjectCode: "M9", title: "乙" });

    moveChapter(db, legacyScope, { id: z2.id, direction: "up" });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    expect(detail?.chapters.map((c) => c.title)).toEqual(["甲", "乙"]);
    expect(detail?.chapters[0].children.map((c) => c.title)).toEqual(["子2", "子1"]);
  });
});
