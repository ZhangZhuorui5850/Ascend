import { describe, expect, it } from "vitest";
import {
  buildWorkspaceExport,
  restoreWorkspaceExport,
  WORKSPACE_EXPORT_SCHEMA,
  WORKSPACE_EXPORT_SCHEMA_VERSION,
} from "./export";
import {
  appendLearningEvidence,
  upsertLearningTaskLink,
  voidLearningEvidence,
} from "./learning-evidence";
import { createMockExam } from "./mock-exams";
import { addNote, addTask, toggleTask } from "./planner";
import { createMistake, createStudySession } from "./reviews";
import { saveDailyReviewLimit } from "./settings";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "./testing";

const EXPORTED_AT = "2026-07-18T09:00:00.000Z";

function seedWorkspaceData(db: ReturnType<typeof createTestDb>, workspaceId: string) {
  const scope = { workspaceId };
  seedSubjectWithChapter(db, scope);
  addTask(db, scope, {
    day: "2026-07-17",
    title: "刷矩阵真题",
    subjectCode: "M1",
    priority: 1,
    knowledgePointId: "kp1",
    activityType: "practice",
    completionCriteria: "独立完成 20 题",
    sourceType: "capture",
    sourceId: "capture-1",
    verificationMethod: "闭卷小测",
  });
  const done = addTask(db, scope, { day: "2026-07-17", title: "复盘错题", knowledgePointId: "kp1" });
  toggleTask(db, scope, {
    id: done.id,
    done: true,
    actualMinutes: 35,
    completionOutput: "订正 3 题",
    verificationMethod: "口头复述",
    verificationResult: "通过",
    verificationOutcome: "improved",
  });
  addNote(db, scope, { day: "2026-07-17", content: "今天状态不错" });
  // ensureDay 已建出 2026-07-17 的空行：写入计划内容，另留一个空行日验证过滤。
  db.prepare("UPDATE daily_entries SET plan = '上午线代' WHERE workspace_id = ? AND date = '2026-07-17'").run(
    workspaceId,
  );
  db.prepare("INSERT INTO daily_entries (workspace_id, date) VALUES (?, '2026-07-16')").run(workspaceId);

  createStudySession(db, scope, {
    day: "2026-07-17",
    title: "矩阵乘法专项",
    durationMinutes: 45,
    knowledgePointId: "kp1",
  });
  const session = db.prepare(`
    SELECT id FROM study_sessions
    WHERE workspace_id = ? AND day = '2026-07-17' AND title = '矩阵乘法专项'
  `).get(workspaceId) as { id: number };
  db.prepare(
    `
    INSERT INTO review_events (workspace_id, day, knowledge_point_id, score, note)
    VALUES (?, '2026-07-17', 'kp1', 4, '较熟练')
  `,
  ).run(workspaceId);
  const reviewId = Number((db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id);
  db.prepare(`
    UPDATE review_events
    SET operation_id = 'review-export-1', event_type = 'point_review',
        attempt_mode = 'recall', attempt_text = '矩阵乘法定义',
        attempt_duration_seconds = 42, pre_confidence = 3
    WHERE workspace_id = ? AND id = ?
  `).run(workspaceId, reviewId);
  db.prepare("UPDATE knowledge_points SET self_confidence = 82 WHERE workspace_id = ? AND id = 'kp1'")
    .run(workspaceId);
  db.prepare(`
    UPDATE study_sessions
    SET task_id = ?, source_type = 'manual_capture', source_id = 'study-export-1'
    WHERE workspace_id = ? AND id = ?
  `).run(done.id, workspaceId, session.id);
  db.prepare(
    `
    INSERT INTO review_recovery_events (workspace_id, day, moved_count, horizon_days) VALUES (?, '2026-07-17', 3, 7)
  `,
  ).run(workspaceId);
  createMistake(db, scope, { day: "2026-07-17", title: "行列式符号搞反", cause: "概念不清", knowledgePointId: "kp1" });
  createMockExam(db, scope, {
    day: "2026-07-17",
    name: "线代模考一",
    subjectCode: "M1",
    score: 92,
    maxScore: 150,
    breakdown: [{ label: "选择", score: 40, maxScore: 60 }],
  });

  db.prepare("INSERT INTO folders (workspace_id, path, name, parent_path) VALUES (?, '真题', '真题', '')").run(
    workspaceId,
  );
  db.prepare(
    `
    INSERT INTO assets (workspace_id, day, original_name, safe_name, relative_path, mime_type, size, category, folder_path, note)
    VALUES (?, '2026-07-17', '错题 截图.png', 'x.png', ?, 'image/png', 2048, 'mistake', '真题', '第三题')
  `,
  ).run(workspaceId, `${encodeURIComponent(workspaceId)}/blobs/ab/${"ab".repeat(32)}`);
  const assetId = (
    db.prepare("SELECT id FROM assets WHERE workspace_id = ? LIMIT 1").get(workspaceId) as { id: number }
  ).id;
  db.prepare(
    `
    INSERT INTO asset_links (workspace_id, asset_id, subject_code, chapter_id, knowledge_point_id)
    VALUES (?, ?, 'M1', 'chapter:M1:matrix', 'kp1')
  `,
  ).run(workspaceId, assetId);

  saveDailyReviewLimit(db, scope, 20);
  const plannerTask = db.prepare(`
    SELECT id FROM planner_tasks WHERE workspace_id = ? AND legacy_day_task_id = ?
  `).get(workspaceId, done.id) as { id: string };
  upsertLearningTaskLink(db, scope, {
    taskId: plannerTask.id,
    knowledgePointId: "kp1",
    activityType: "review",
    completionCriteria: "完成错题复盘",
    plannedVerificationMethod: "同类题复测",
    sourceType: "legacy_day_task",
    sourceId: done.id,
  });
  const originalEvidence = appendLearningEvidence(db, scope, {
    idempotencyKey: "export-evidence-original",
    taskId: plannerTask.id,
    completionCycle: 1,
    day: "2026-07-17",
    actualMinutes: 35,
    output: "误记为订正 2 题",
    outcome: "completed",
    difficulty: "medium",
    verificationMethod: "口头复述",
    verificationResult: "通过",
    verificationOutcome: "passed",
    confidence: 82,
  });
  const correction = appendLearningEvidence(db, scope, {
    idempotencyKey: "export-evidence-correction",
    taskId: plannerTask.id,
    completionCycle: 1,
    day: "2026-07-17",
    output: "实际订正 3 题",
    correctsEvidenceId: originalEvidence.id,
  });
  voidLearningEvidence(db, scope, { id: originalEvidence.id, reason: "由纠正记录替代" });
  return { scope, assetId, plannerTaskId: plannerTask.id, originalEvidence, correction };
}

describe("export repo", () => {
  it("aggregates the whole workspace into JSON + markdown", () => {
    const db = createTestDb();
    const { workspaceId } = createTestWorkspace(db, { displayName: "备考空间" });
    const { scope, assetId, plannerTaskId, originalEvidence, correction } = seedWorkspaceData(db, workspaceId);

    const bundle = buildWorkspaceExport(db, scope, { exportedAt: EXPORTED_AT });
    const { data } = bundle;

    expect(data.schema).toBe(WORKSPACE_EXPORT_SCHEMA);
    expect(data.schema_version).toBe(WORKSPACE_EXPORT_SCHEMA_VERSION);
    expect(data.planner.schema_version).toBe(4);
    expect(data.planner).not.toHaveProperty("push_subscriptions");
    expect(data.exported_at).toBe(EXPORTED_AT);
    expect(data.workspace.display_name).toBe("备考空间");

    expect(data.settings.dailyReviewLimit).toBe(20);
    expect(data.planner.tasks).toHaveLength(2);
    expect(data.planner.tasks.map((task) => task.title)).toEqual(["刷矩阵真题", "复盘错题"]);
    expect(data.planner.lists.map((list) => list.name)).toContain("Inbox");
    expect(data.planner.calendars.map((calendar) => calendar.name)).toEqual(["个人日历", "学习里程碑"]);
    expect(data.planner.notes).toHaveLength(1);
    // ensureDay 造出来的空行不导出，只保留真正写过内容的日子。
    expect(data.planner.daily_entries.map((entry) => entry.date)).toEqual(["2026-07-17"]);
    expect(data.planner.legacy_tasks).toHaveLength(2);
    expect(data.planner.legacy_tasks[1]).toMatchObject({
      id: expect.any(Number),
      actual_minutes: 35,
      completion_output: "订正 3 题",
      verification_outcome: "improved",
    });

    expect(data.knowledge.subjects).toEqual([{ code: "M1", name: "线性代数", description: "", track: "written" }]);
    expect(data.knowledge.chapters).toHaveLength(1);
    expect(data.knowledge.points).toHaveLength(1);
    expect(data.knowledge.points[0]).toMatchObject({
      id: "kp1",
      title: "矩阵乘法",
      subject_code: "M1",
      self_confidence: 82,
    });

    expect(data.reviews.events).toHaveLength(1);
    expect(data.reviews.recovery_events).toHaveLength(1);
    expect(data.reviews.study_sessions).toHaveLength(1);
    expect(data.reviews.events[0]).toMatchObject({
      operation_id: "review-export-1",
      attempt_mode: "recall",
      pre_confidence: 3,
    });
    expect(data.reviews.study_sessions[0]).toMatchObject({
      task_id: expect.any(Number),
      source_type: "manual_capture",
      source_id: "study-export-1",
    });
    expect(data.learning.task_links).toEqual([
      expect.objectContaining({ task_id: plannerTaskId, knowledge_point_id: "kp1", version: 1 }),
    ]);
    expect(data.learning.evidence).toHaveLength(2);
    expect(data.learning.evidence.find((row) => row.id === originalEvidence.id)).toMatchObject({
      corrected_by: correction.id,
      void_reason: "由纠正记录替代",
      idempotency_key: "export-evidence-original",
    });
    expect(data.mistakes).toHaveLength(1);
    expect(data.mistakes[0]).toMatchObject({ title: "行列式符号搞反", knowledge_point_id: "kp1" });

    expect(data.mock_exams).toHaveLength(1);
    expect(data.mock_exams[0].breakdown).toMatchObject([{ label: "选择", score: 40, maxScore: 60 }]);
    expect(data.mock_exams[0]).not.toHaveProperty("breakdown_json");

    expect(data.library.folders).toEqual([expect.objectContaining({ path: "真题", name: "真题" })]);
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
    db.prepare(
      `
      INSERT INTO assets (workspace_id, day, original_name, safe_name, relative_path, mime_type, size)
      VALUES (?, '2026-07-17', 'their.png', 'their.png', ?, 'image/png', 1)
    `,
    ).run(theirs.workspaceId, `${encodeURIComponent(theirs.workspaceId)}/blobs/cd/${"cd".repeat(32)}`);

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

  it("round-trips learning evidence and all existing audit fields into a new workspace", () => {
    const sourceDb = createTestDb();
    const source = createTestWorkspace(sourceDb, { displayName: "证据源空间" });
    seedWorkspaceData(sourceDb, source.workspaceId);
    const exported = buildWorkspaceExport(sourceDb, source, { exportedAt: EXPORTED_AT }).data;

    const targetDb = createTestDb();
    const target = createTestWorkspace(targetDb, { displayName: "恢复目标" });
    const untouched = createTestWorkspace(targetDb, { displayName: "不应被覆盖" });
    saveDailyReviewLimit(targetDb, untouched, 33);
    targetDb.prepare(`
      INSERT INTO drafts
        (workspace_id, id, scope_type, scope_id, field, content, base_version, version, status)
      VALUES (?, 'stale-target-draft', 'day_entry', '2026-07-17', 'journal', '旧草稿', 0, 9, 'active')
    `).run(target.workspaceId);
    const result = restoreWorkspaceExport(targetDb, target, exported);
    expect(result).toMatchObject({
      schemaVersion: 4,
      plannerTasks: 2,
      legacyTasks: 2,
      learningTaskLinks: 1,
      learningEvidence: 2,
    });

    const restored = buildWorkspaceExport(targetDb, target, { exportedAt: "2026-07-19T00:00:00.000Z" }).data;
    expect(restored.workspace.display_name).toBe("证据源空间");
    expect(restored.planner.legacy_tasks).toEqual(exported.planner.legacy_tasks);
    expect(restored.learning).toEqual(exported.learning);
    expect(restored.knowledge.points[0].self_confidence).toBe(82);
    expect(restored.reviews.events).toEqual(exported.reviews.events);
    expect(restored.reviews.study_sessions).toEqual(exported.reviews.study_sessions);
    expect(restored.mock_exams).toEqual(exported.mock_exams);
    expect(targetDb.prepare("SELECT COUNT(*) AS count FROM drafts WHERE workspace_id = ?")
      .get(target.workspaceId)).toEqual({ count: 0 });
    expect(buildWorkspaceExport(targetDb, untouched, { exportedAt: EXPORTED_AT }).data.settings.dailyReviewLimit)
      .toBe(33);
  });

  it("restores v3 archives with missing v4 collections and fields using historical defaults", () => {
    const sourceDb = createTestDb();
    const source = createTestWorkspace(sourceDb);
    seedWorkspaceData(sourceDb, source.workspaceId);
    const legacy = structuredClone(buildWorkspaceExport(sourceDb, source, { exportedAt: EXPORTED_AT }).data) as
      WorkspaceExportV3Fixture;
    legacy.schema_version = 3;
    legacy.planner.schema_version = 3;
    delete legacy.planner.legacy_tasks;
    delete legacy.learning;
    for (const point of legacy.knowledge.points) delete point.self_confidence;
    for (const event of legacy.reviews.events) {
      delete event.operation_id;
      delete event.event_type;
      delete event.attempt_mode;
      delete event.attempt_text;
      delete event.attempt_duration_seconds;
      delete event.pre_confidence;
    }
    for (const session of legacy.reviews.study_sessions) {
      delete session.task_id;
      delete session.source_type;
      delete session.source_id;
    }

    const targetDb = createTestDb();
    const target = createTestWorkspace(targetDb);
    expect(restoreWorkspaceExport(targetDb, target, legacy)).toMatchObject({
      schemaVersion: 3,
      legacyTasks: 0,
      learningTaskLinks: 0,
      learningEvidence: 0,
    });
    const restored = buildWorkspaceExport(targetDb, target, { exportedAt: EXPORTED_AT }).data;
    expect(restored.learning).toEqual({ task_links: [], evidence: [] });
    expect(restored.planner.legacy_tasks).toEqual([]);
    expect(restored.knowledge.points[0].self_confidence).toBeNull();
    expect(restored.reviews.events[0]).toMatchObject({
      operation_id: null,
      event_type: "point_review",
      attempt_mode: "unknown",
      attempt_text: "",
      attempt_duration_seconds: 0,
      pre_confidence: null,
    });
    expect(restored.reviews.study_sessions[0]).toMatchObject({
      task_id: null,
      source_type: "",
      source_id: "",
    });
  });

  it("rejects cross-workspace id collisions before replacing the target", () => {
    const db = createTestDb();
    const source = createTestWorkspace(db, { displayName: "仍在使用的源空间" });
    const target = createTestWorkspace(db, { displayName: "不可清空的目标" });
    seedWorkspaceData(db, source.workspaceId);
    db.prepare(`
      INSERT INTO daily_entries (workspace_id, date, plan)
      VALUES (?, '2026-07-20', '目标原有计划')
    `).run(target.workspaceId);
    const exported = buildWorkspaceExport(db, source, { exportedAt: EXPORTED_AT }).data;

    expect(() => restoreWorkspaceExport(db, target, exported)).toThrow(/恢复 ID 已属于其他学习空间/);
    expect(db.prepare(`
      SELECT plan FROM daily_entries WHERE workspace_id = ? AND date = '2026-07-20'
    `).get(target.workspaceId)).toEqual({ plan: "目标原有计划" });
    expect(db.prepare("SELECT display_name FROM workspaces WHERE id = ?").get(target.workspaceId))
      .toEqual({ display_name: "不可清空的目标" });
  });

  it("rejects unknown workspaces", () => {
    const db = createTestDb();
    expect(() => buildWorkspaceExport(db, { workspaceId: "workspace:missing" }, { exportedAt: EXPORTED_AT })).toThrow(
      "学习空间不存在",
    );
  });
});

type WorkspaceExportV3Fixture = Omit<
  ReturnType<typeof buildWorkspaceExport>["data"],
  "learning" | "planner" | "knowledge" | "reviews"
> & {
  learning?: ReturnType<typeof buildWorkspaceExport>["data"]["learning"];
  planner: Omit<ReturnType<typeof buildWorkspaceExport>["data"]["planner"], "legacy_tasks"> & {
    legacy_tasks?: ReturnType<typeof buildWorkspaceExport>["data"]["planner"]["legacy_tasks"];
  };
  knowledge: Omit<ReturnType<typeof buildWorkspaceExport>["data"]["knowledge"], "points"> & {
    points: Array<Omit<ReturnType<typeof buildWorkspaceExport>["data"]["knowledge"]["points"][number], "self_confidence"> & {
      self_confidence?: number | null;
    }>;
  };
  reviews: Omit<ReturnType<typeof buildWorkspaceExport>["data"]["reviews"], "events" | "study_sessions"> & {
    events: Array<Partial<ReturnType<typeof buildWorkspaceExport>["data"]["reviews"]["events"][number]> &
      Pick<ReturnType<typeof buildWorkspaceExport>["data"]["reviews"]["events"][number], "id" | "day" | "score" | "note" | "created_at">>;
    study_sessions: Array<Partial<ReturnType<typeof buildWorkspaceExport>["data"]["reviews"]["study_sessions"][number]> &
      Pick<ReturnType<typeof buildWorkspaceExport>["data"]["reviews"]["study_sessions"][number], "id" | "day" | "title" | "duration_minutes" | "output" | "created_at">>;
  };
};
