import { describe, expect, it } from "vitest";
import { runMigrations } from "../migrations";
import Database from "better-sqlite3";
import { initializeDatabase } from "../db";
import {
  addNote,
  addTask,
  carryOverTasks,
  deleteNote,
  deleteTask,
  listNotes,
  listCalendarTasks,
  listTasks,
  scheduleTask,
  toggleTask,
  updateNote,
  updateTask,
} from "./planner";
import { getSettings, saveDailyReviewLimit, saveExamCountdowns } from "./settings";
import { getStudyStreak } from "./stats";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "./testing";
import { LEGACY_WORKSPACE_ID } from "./workspaces";

const legacyScope = { workspaceId: LEGACY_WORKSPACE_ID };

describe("workspace planning isolation", () => {
  it("keeps tasks, notes, settings, and streaks inside one workspace", () => {
    const db = createTestDb();
    const a = createTestWorkspace(db, { userId: "user-a", email: "a@example.com" });
    const b = createTestWorkspace(db, { userId: "user-b", email: "b@example.com" });

    const aTask = addTask(db, a, { day: "2026-07-09", title: "A 的任务" });
    addTask(db, b, { day: "2026-07-09", title: "B 的任务" });
    addNote(db, a, { day: "2026-07-09", content: "A 的随笔" });
    addNote(db, b, { day: "2026-07-09", content: "B 的随笔" });
    saveDailyReviewLimit(db, a, 8);
    saveDailyReviewLimit(db, b, 20);

    expect(listTasks(db, a, "2026-07-09").map((task) => task.title)).toEqual(["A 的任务"]);
    expect(listNotes(db, a, "2026-07-09").map((note) => note.content)).toEqual(["A 的随笔"]);
    expect(getSettings(db, a).dailyReviewLimit).toBe(8);
    expect(getSettings(db, b).dailyReviewLimit).toBe(20);
    expect(() => toggleTask(db, b, { id: aTask.id, done: true })).toThrow("任务不存在");
  });
});

describe("day tasks", () => {
  it("adds, toggles, edits and deletes tasks", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    const task = addTask(db, legacyScope, { day: "2026-07-09", title: "特征值 20 题", subjectCode: "M1" });
    expect(task).toMatchObject({
      title: "特征值 20 题",
      subject_code: "M1",
      done: 0,
      sort_order: 1,
      priority: 2,
      estimated_minutes: 30,
      scheduled_start: null,
      notes: "",
    });

    toggleTask(db, legacyScope, { id: task.id, done: true });
    expect(listTasks(db, legacyScope, "2026-07-09")[0].done).toBe(1);

    updateTask(db, legacyScope, { id: task.id, title: "特征值 30 题", subjectCode: null });
    expect(listTasks(db, legacyScope, "2026-07-09")[0]).toMatchObject({ title: "特征值 30 题", subject_code: null });

    deleteTask(db, legacyScope, task.id);
    expect(listTasks(db, legacyScope, "2026-07-09")).toHaveLength(0);
  });

  it("stores task priority, time budget, schedule and notes", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    const task = addTask(db, legacyScope, {
      day: "2026-07-09",
      title: "线性代数专项",
      subjectCode: "M1",
      priority: 1,
      estimatedMinutes: 90,
      scheduledStart: "09:30",
      notes: "完成矩阵与特征值两组题",
    });

    expect(task).toMatchObject({
      priority: 1,
      estimated_minutes: 90,
      scheduled_start: "09:30",
      notes: "完成矩阵与特征值两组题",
    });

    updateTask(db, legacyScope, {
      id: task.id,
      priority: 3,
      estimatedMinutes: 45,
      scheduledStart: null,
      notes: "调整后的训练",
    });
    expect(listTasks(db, legacyScope, "2026-07-09")[0]).toMatchObject({
      priority: 3,
      estimated_minutes: 45,
      scheduled_start: null,
      notes: "调整后的训练",
    });
    expect(() => updateTask(db, legacyScope, { id: task.id, scheduledStart: "25:90" })).toThrow("开始时间格式");
    expect(() => updateTask(db, legacyScope, { id: task.id, estimatedMinutes: 2 })).toThrow("预计时长");
  });

  it("reschedules tasks across days and exposes the calendar projection", () => {
    const db = createTestDb();
    const task = addTask(db, legacyScope, { day: "2026-07-09", title: "专项训练" });

    const result = scheduleTask(db, legacyScope, {
      id: task.id,
      day: "2026-07-10",
      scheduledStart: "14:00",
      estimatedMinutes: 60,
    });

    expect(result).toEqual({ previousDay: "2026-07-09", day: "2026-07-10" });
    expect(listTasks(db, legacyScope, "2026-07-09")).toHaveLength(0);
    expect(listTasks(db, legacyScope, "2026-07-10")[0]).toMatchObject({
      scheduled_start: "14:00",
      estimated_minutes: 60,
    });
    expect(listCalendarTasks(db, legacyScope).map((item) => item.id)).toContain(task.id);
  });

  it("keeps task positions stable when completion changes", () => {
    const db = createTestDb();
    const a = addTask(db, legacyScope, { day: "2026-07-09", title: "A" });
    addTask(db, legacyScope, { day: "2026-07-09", title: "B" });
    toggleTask(db, legacyScope, { id: a.id, done: true });

    expect(listTasks(db, legacyScope, "2026-07-09").map((task) => task.title)).toEqual(["A", "B"]);
  });

  it("carries open tasks over to another day", () => {
    const db = createTestDb();
    const a = addTask(db, legacyScope, { day: "2026-07-08", title: "未完成" });
    const b = addTask(db, legacyScope, { day: "2026-07-08", title: "已完成" });
    toggleTask(db, legacyScope, { id: b.id, done: true });
    addTask(db, legacyScope, { day: "2026-07-09", title: "已有任务" });

    const moved = carryOverTasks(db, legacyScope, { fromDay: "2026-07-08", toDay: "2026-07-09" });

    expect(moved).toBe(1);
    expect(listTasks(db, legacyScope, "2026-07-08").map((task) => task.title)).toEqual(["已完成"]);
    const today = listTasks(db, legacyScope, "2026-07-09");
    expect(today.map((task) => task.title)).toEqual(["已有任务", "未完成"]);
    expect(today.find((task) => task.id === a.id)?.sort_order).toBe(2);
  });

  it("rejects empty titles", () => {
    const db = createTestDb();
    expect(() => addTask(db, legacyScope, { day: "2026-07-09", title: "  " })).toThrow();
  });
});

describe("day notes", () => {
  it("adds, edits and deletes notes", () => {
    const db = createTestDb();
    const note = addNote(db, legacyScope, { day: "2026-07-09", content: "贝叶斯先验的直觉" });
    expect(listNotes(db, legacyScope, "2026-07-09")).toHaveLength(1);

    updateNote(db, legacyScope, { id: note.id, content: "更新后的想法" });
    expect(listNotes(db, legacyScope, "2026-07-09")[0].content).toBe("更新后的想法");

    deleteNote(db, legacyScope, note.id);
    expect(listNotes(db, legacyScope, "2026-07-09")).toHaveLength(0);
  });
});

describe("settings", () => {
  it("stores exam countdowns and review limit with defaults", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    expect(getSettings(db, legacyScope)).toMatchObject({ examCountdowns: [], dailyReviewLimit: 12 });

    saveExamCountdowns(db, legacyScope, [{ name: "笔试", date: "2026-09-01", subjectCode: "M1", targetScore: 120 }, { name: "", date: "2026-09-02" }]);
    saveDailyReviewLimit(db, legacyScope, 8);

    expect(getSettings(db, legacyScope)).toMatchObject({
      examCountdowns: [{ name: "笔试", date: "2026-09-01", subjectCode: "M1", targetScore: 120 }],
      dailyReviewLimit: 8,
    });
    expect(() => saveDailyReviewLimit(db, legacyScope, 0)).toThrow();
    expect(() => saveExamCountdowns(db, legacyScope, [{ name: "坏日期", date: "not-a-date" }])).toThrow();
  });
});

describe("study streak", () => {
  it("counts consecutive active days and tolerates an idle today", () => {
    const db = createTestDb();
    db.prepare("INSERT INTO study_sessions (day, title, duration_minutes) VALUES ('2026-07-08', 'a', 30)").run();
    db.prepare("INSERT INTO review_events (day, score) VALUES ('2026-07-07', 2)").run();
    const doneTask = addTask(db, legacyScope, { day: "2026-07-06", title: "task" });
    toggleTask(db, legacyScope, { id: doneTask.id, done: true });

    // 今天没学：从昨天起连续 3 天。
    expect(getStudyStreak(db, legacyScope, "2026-07-09")).toBe(3);

    db.prepare("INSERT INTO study_sessions (day, title, duration_minutes) VALUES ('2026-07-09', 'b', 10)").run();
    expect(getStudyStreak(db, legacyScope, "2026-07-09")).toBe(4);

    // 断档一天则重新计数。
    expect(getStudyStreak(db, legacyScope, "2026-07-11")).toBe(0);
  });
});

describe("migration backfill from daily_entries", () => {
  it("splits legacy plan text into tasks and diary into a note", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    db.prepare(`
      INSERT INTO daily_entries (date, plan, diary)
      VALUES ('2026-07-01', '- 线代 20 题' || char(10) || '2. 复盘错题', '今天状态不错')
    `).run();

    runMigrations(db);

    expect(listTasks(db, legacyScope, "2026-07-01").map((task) => task.title)).toEqual(["线代 20 题", "复盘错题"]);
    expect(listNotes(db, legacyScope, "2026-07-01").map((note) => note.content)).toEqual(["今天状态不错"]);
  });
});
