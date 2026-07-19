import { describe, expect, it } from "vitest";
import { buildWorkspaceExport, WORKSPACE_EXPORT_SCHEMA, WORKSPACE_EXPORT_SCHEMA_VERSION } from "./export";
import { createMockExam } from "./mock-exams";
import { addNote, addTask } from "./planner";
import { createMistake, createStudySession } from "./reviews";
import { saveDailyReviewLimit } from "./settings";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "./testing";

const EXPORTED_AT = "2026-07-18T09:00:00.000Z";

function seedWorkspaceData(db: ReturnType<typeof createTestDb>, workspaceId: string) {
  const scope = { workspaceId };
  seedSubjectWithChapter(db, scope);
  addTask(db, scope, { day: "2026-07-17", title: "刷矩阵真题", subjectCode: "M1", priority: 1 });
  const done = addTask(db, scope, { day: "2026-07-17", title: "复盘错题" });
  db.prepare("UPDATE day_tasks SET done = 1 WHERE workspace_id = ? AND id = ?").run(workspaceId, done.id);
  addNote(db, scope, { day: "2026-07-17", content: "今天状态不错" });
  // ensureDay 已建出 2026-07-17 的空行：写入计划内容，另留一个空行日验证过滤。
  db.prepare("UPDATE daily_entries SET plan = '上午线代' WHERE workspace_id = ? AND date = '2026-07-17'").run(workspaceId);
  db.prepare("INSERT INTO daily_entries (workspace_id, date) VALUES (?, '2026-07-16')").run(workspaceId);

  createStudySession(db, scope, { day: "2026-07-17", title: "矩阵乘法专项", durationMinutes: 45, knowledgePointId: "kp1" });
  db.prepare(`
    INSERT INTO review_events (workspace_id, day, knowledge_point_id, score, note)
    VALUES (?, '2026-07-17', 'kp1', 4, '较熟练')
  `).run(workspaceId);
  db.prepare(`
    INSERT INTO review_recovery_events (workspace_id, day, moved_count, horizon_days) VALUES (?, '2026-07-17', 3, 7)
  `).run(workspaceId);
  createMistake(db, scope, { day: "2026-07-17", title: "行列式符号搞反", cause: "概念不清", knowledgePointId: "kp1" });
  createMockExam(db, scope, {
    day: "2026-07-17",
    name: "线代模考一",
    subjectCode: "M1",
    score: 92,
    maxScore: 150,
    breakdown: [{ label: "选择", score: 40, maxScore: 60 }],
  });

  db.prepare("INSERT INTO folders (workspace_id, path, name, parent_path) VALUES (?, '真题', '真题', '')").run(workspaceId);
  db.prepare(`
    INSERT INTO assets (workspace_id, day, original_name, safe_name, relative_path, mime_type, size, category, folder_path, note)
    VALUES (?, '2026-07-17', '错题 截图.png', 'x.png', ?, 'image/png', 2048, 'mistake', '真题', '第三题')
  `).run(workspaceId, `${encodeURIComponent(workspaceId)}/blobs/ab/${"ab".repeat(32)}`);
  const assetId = (db.prepare("SELECT id FROM assets WHERE workspace_id = ? LIMIT 1").get(workspaceId) as { id: number }).id;
  db.prepare(`
    INSERT INTO asset_links (workspace_id, asset_id, subject_code, chapter_id, knowledge_point_id)
    VALUES (?, ?, 'M1', 'chapter:M1:matrix', 'kp1')
  `).run(workspaceId, assetId);

  saveDailyReviewLimit(db, scope, 20);
  return { scope, assetId };
}

describe("export repo", () => {
  it("aggregates the whole workspace into JSON + markdown", () => {
    const db = createTestDb();
    const { workspaceId } = createTestWorkspace(db, { displayName: "备考空间" });
    const { scope, assetId } = seedWorkspaceData(db, workspaceId);

    const bundle = buildWorkspaceExport(db, scope, { exportedAt: EXPORTED_AT });
    const { data } = bundle;

    expect(data.schema).toBe(WORKSPACE_EXPORT_SCHEMA);
    expect(data.schema_version).toBe(WORKSPACE_EXPORT_SCHEMA_VERSION);
    expect(data.exported_at).toBe(EXPORTED_AT);
    expect(data.workspace.display_name).toBe("备考空间");

    expect(data.settings.dailyReviewLimit).toBe(20);
    expect(data.planner.tasks).toHaveLength(2);
    expect(data.planner.tasks.map((task) => task.title)).toEqual(["刷矩阵真题", "复盘错题"]);
    expect(data.planner.notes).toHaveLength(1);
    // ensureDay 造出来的空行不导出，只保留真正写过内容的日子。
    expect(data.planner.daily_entries.map((entry) => entry.date)).toEqual(["2026-07-17"]);

    expect(data.knowledge.subjects).toEqual([
      { code: "M1", name: "线性代数", description: "", track: "written" },
    ]);
    expect(data.knowledge.chapters).toHaveLength(1);
    expect(data.knowledge.points).toHaveLength(1);
    expect(data.knowledge.points[0]).toMatchObject({ id: "kp1", title: "矩阵乘法", subject_code: "M1" });

    expect(data.reviews.events).toHaveLength(1);
    expect(data.reviews.recovery_events).toHaveLength(1);
    expect(data.reviews.study_sessions).toHaveLength(1);
    expect(data.mistakes).toHaveLength(1);
    expect(data.mistakes[0]).toMatchObject({ title: "行列式符号搞反", knowledge_point_id: "kp1" });

    expect(data.mock_exams).toHaveLength(1);
    expect(data.mock_exams[0].breakdown).toEqual([{ label: "选择", score: 40, maxScore: 60 }]);
    expect(data.mock_exams[0]).not.toHaveProperty("breakdown_json");

    expect(data.library.folders).toEqual([
      expect.objectContaining({ path: "真题", name: "真题" }),
    ]);
    expect(data.library.assets).toHaveLength(1);
    const [asset] = data.library.assets;
    expect(asset).toMatchObject({
      id: assetId,
      original_name: "错题 截图.png",
      subject_code: "M1",
      chapter_id: "chapter:M1:matrix",
      knowledge_point_ids: ["kp1"],
      export_path: `assets/${assetId}-错题 截图.png`,
    });
    // 内部存储键不进 data.json，只通过 assetFiles 交给路由读盘。
    expect(asset).not.toHaveProperty("relative_path");
    expect(bundle.assetFiles).toEqual([
      { zipPath: `assets/${assetId}-错题 截图.png`, storageKey: expect.stringContaining("/blobs/ab/") },
    ]);

    expect(bundle.markdown).toContain("# 登峰 · 学习空间数据导出");
    expect(bundle.markdown).toContain(EXPORTED_AT);
    expect(bundle.markdown).toContain("| 任务 | 2（已完成 1） |");
    expect(bundle.markdown).toContain("线性代数（M1）");
    expect(bundle.markdown).toContain("行列式符号搞反");
    expect(bundle.markdown).toContain("| 2026-07-17 | 线代模考一 | 92/150 |");
  });

  it("never leaks data from other workspaces", () => {
    const db = createTestDb();
    const mine = createTestWorkspace(db, { displayName: "我的空间" });
    const theirs = createTestWorkspace(db, { displayName: "别人的空间" });
    seedWorkspaceData(db, mine.workspaceId);
    const theirScope = { workspaceId: theirs.workspaceId };
    addTask(db, theirScope, { day: "2026-07-17", title: "别人的秘密任务" });
    createMistake(db, theirScope, { day: "2026-07-17", title: "别人的错题" });
    db.prepare(`
      INSERT INTO assets (workspace_id, day, original_name, safe_name, relative_path, mime_type, size)
      VALUES (?, '2026-07-17', 'their.png', 'their.png', ?, 'image/png', 1)
    `).run(theirs.workspaceId, `${encodeURIComponent(theirs.workspaceId)}/blobs/cd/${"cd".repeat(32)}`);

    const bundle = buildWorkspaceExport(db, { workspaceId: mine.workspaceId }, { exportedAt: EXPORTED_AT });
    expect(bundle.data.workspace.display_name).toBe("我的空间");
    expect(bundle.data.planner.tasks).toHaveLength(2);
    const serialized = JSON.stringify(bundle.data);
    expect(serialized).not.toContain("别人的秘密任务");
    expect(serialized).not.toContain("别人的错题");
    expect(serialized).not.toContain("their.png");
    expect(bundle.data.library.assets).toHaveLength(1);
    expect(bundle.assetFiles).toHaveLength(1);
    expect(bundle.assetFiles[0].storageKey).toContain(encodeURIComponent(mine.workspaceId));
  });

  it("rejects unknown workspaces", () => {
    const db = createTestDb();
    expect(() => buildWorkspaceExport(db, { workspaceId: "workspace:missing" }, { exportedAt: EXPORTED_AT }))
      .toThrow("学习空间不存在");
  });
});
