import { describe, expect, it } from "vitest";
import { parseCaptureText } from "./parser";

describe("parseCaptureText", () => {
  it("parses explicit task date, time, and duration without hiding the preview", () => {
    expect(parseCaptureText({
      text: "任务：明天 20:00 红黑树删除练习 45 分钟",
      contextDay: "2026-08-10",
    })).toEqual({
      originalText: "任务：明天 20:00 红黑树删除练习 45 分钟",
      text: "红黑树删除练习",
      suggestedKind: "task",
      explicitKind: "task",
      date: "2026-08-11",
      time: "20:00",
      minutes: 45,
      warnings: [],
      preview: ["2026-08-11", "20:00", "45 分钟"],
    });
  });

  it("treats a time without a date as today", () => {
    expect(parseCaptureText({ text: "19:30 写总结", contextDay: "2026-08-10" })).toMatchObject({
      text: "写总结",
      date: "2026-08-10",
      time: "19:30",
    });
  });

  it("suggests study, mistake, and note intents but lets an explicit selection win", () => {
    expect(parseCaptureText({ text: "学习了 操作系统 30 分钟", contextDay: "2026-08-10" }).suggestedKind).toBe("study");
    expect(parseCaptureText({ text: "错题：边界条件写错", contextDay: "2026-08-10" }).suggestedKind).toBe("mistake");
    expect(parseCaptureText({ text: "记一下这个结论", contextDay: "2026-08-10" }).suggestedKind).toBe("note");
    expect(parseCaptureText({
      text: "做错了二分查找",
      contextDay: "2026-08-10",
      selectedKind: "task",
    }).suggestedKind).toBe("task");
  });

  it("preserves ambiguous time language instead of inventing a schedule", () => {
    expect(parseCaptureText({ text: "下周晚上复习矩阵", contextDay: "2026-08-10" })).toMatchObject({
      text: "下周晚上复习矩阵",
      date: null,
      time: null,
      warnings: ["包含模糊时间词，已保留原文，请确认后再安排具体时间"],
    });
  });

  it("rejects impossible explicit dates", () => {
    expect(() => parseCaptureText({ text: "2026-02-30 写作业", contextDay: "2026-08-10" }))
      .toThrow("Invalid date");
  });
});
