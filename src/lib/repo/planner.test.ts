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
  listTasks,
  toggleTask,
  updateNote,
  updateTask,
} from "./planner";
import { getSettings, saveDailyReviewLimit, saveExamCountdowns } from "./settings";
import { getStudyStreak } from "./stats";
import { createTestDb } from "./testing";

describe("day tasks", () => {
  it("adds, toggles, edits and deletes tasks", () => {
    const db = createTestDb();
    const task = addTask(db, { day: "2026-07-09", title: "特征值 20 题", subjectCode: "M1" });
    expect(task).toMatchObject({ title: "特征值 20 题", subject_code: "M1", done: 0, sort_order: 1 });

    toggleTask(db, { id: task.id, done: true });
    expect(listTasks(db, "2026-07-09")[0].done).toBe(1);

    updateTask(db, { id: task.id, title: "特征值 30 题", subjectCode: null });
    expect(listTasks(db, "2026-07-09")[0]).toMatchObject({ title: "特征值 30 题", subject_code: null });

    deleteTask(db, task.id);
    expect(listTasks(db, "2026-07-09")).toHaveLength(0);
  });

  it("orders open tasks before done ones", () => {
    const db = createTestDb();
    const a = addTask(db, { day: "2026-07-09", title: "A" });
    addTask(db, { day: "2026-07-09", title: "B" });
    toggleTask(db, { id: a.id, done: true });

    expect(listTasks(db, "2026-07-09").map((task) => task.title)).toEqual(["B", "A"]);
  });

  it("carries open tasks over to another day", () => {
    const db = createTestDb();
    const a = addTask(db, { day: "2026-07-08", title: "未完成" });
    const b = addTask(db, { day: "2026-07-08", title: "已完成" });
    toggleTask(db, { id: b.id, done: true });
    addTask(db, { day: "2026-07-09", title: "已有任务" });

    const moved = carryOverTasks(db, { fromDay: "2026-07-08", toDay: "2026-07-09" });

    expect(moved).toBe(1);
    expect(listTasks(db, "2026-07-08").map((task) => task.title)).toEqual(["已完成"]);
    const today = listTasks(db, "2026-07-09");
    expect(today.map((task) => task.title)).toEqual(["已有任务", "未完成"]);
    expect(today.find((task) => task.id === a.id)?.sort_order).toBe(2);
  });

  it("rejects empty titles", () => {
    const db = createTestDb();
    expect(() => addTask(db, { day: "2026-07-09", title: "  " })).toThrow();
  });
});

describe("day notes", () => {
  it("adds, edits and deletes notes", () => {
    const db = createTestDb();
    const note = addNote(db, { day: "2026-07-09", content: "贝叶斯先验的直觉" });
    expect(listNotes(db, "2026-07-09")).toHaveLength(1);

    updateNote(db, { id: note.id, content: "更新后的想法" });
    expect(listNotes(db, "2026-07-09")[0].content).toBe("更新后的想法");

    deleteNote(db, note.id);
    expect(listNotes(db, "2026-07-09")).toHaveLength(0);
  });
});

describe("settings", () => {
  it("stores exam countdowns and review limit with defaults", () => {
    const db = createTestDb();
    expect(getSettings(db)).toEqual({ examCountdowns: [], dailyReviewLimit: 12 });

    saveExamCountdowns(db, [{ name: "笔试", date: "2026-09-01" }, { name: "", date: "2026-09-02" }]);
    saveDailyReviewLimit(db, 8);

    expect(getSettings(db)).toEqual({
      examCountdowns: [{ name: "笔试", date: "2026-09-01" }],
      dailyReviewLimit: 8,
    });
    expect(() => saveDailyReviewLimit(db, 0)).toThrow();
    expect(() => saveExamCountdowns(db, [{ name: "坏日期", date: "not-a-date" }])).toThrow();
  });
});

describe("study streak", () => {
  it("counts consecutive active days and tolerates an idle today", () => {
    const db = createTestDb();
    db.prepare("INSERT INTO study_sessions (day, title, duration_minutes) VALUES ('2026-07-08', 'a', 30)").run();
    db.prepare("INSERT INTO review_events (day, score) VALUES ('2026-07-07', 2)").run();
    const doneTask = addTask(db, { day: "2026-07-06", title: "task" });
    toggleTask(db, { id: doneTask.id, done: true });

    // 今天没学：从昨天起连续 3 天。
    expect(getStudyStreak(db, "2026-07-09")).toBe(3);

    db.prepare("INSERT INTO study_sessions (day, title, duration_minutes) VALUES ('2026-07-09', 'b', 10)").run();
    expect(getStudyStreak(db, "2026-07-09")).toBe(4);

    // 断档一天则重新计数。
    expect(getStudyStreak(db, "2026-07-11")).toBe(0);
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

    expect(listTasks(db, "2026-07-01").map((task) => task.title)).toEqual(["线代 20 题", "复盘错题"]);
    expect(listNotes(db, "2026-07-01").map((note) => note.content)).toEqual(["今天状态不错"]);
  });
});
