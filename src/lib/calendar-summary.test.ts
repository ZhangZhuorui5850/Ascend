import { describe, expect, it } from "vitest";
import { buildCalendarSummaries } from "./calendar-summary";

describe("buildCalendarSummaries", () => {
  it("summarizes assets, study minutes, reviews, mistakes, and summary state per day", () => {
    const summaries = buildCalendarSummaries({
      days: [
        { date: "2026-07-06", plan: "线代回炉", summary: "完成 A^n 复习" },
        { date: "2026-07-07", plan: "概率", summary: "" },
      ],
      assets: [
        { id: 1, day: "2026-07-06" },
        { id: 2, day: "2026-07-06" },
      ],
      studySessions: [
        { id: 1, day: "2026-07-06", durationMinutes: 50 },
        { id: 2, day: "2026-07-06", durationMinutes: 40 },
      ],
      reviewEvents: [{ id: 1, day: "2026-07-06" }],
      mistakes: [
        { id: 1, day: "2026-07-06" },
        { id: 2, day: "2026-07-07" },
      ],
    });

    expect(summaries).toEqual([
      {
        date: "2026-07-06",
        plan: "线代回炉",
        assetCount: 2,
        studyMinutes: 90,
        reviewCount: 1,
        mistakeCount: 1,
        hasSummary: true,
      },
      {
        date: "2026-07-07",
        plan: "概率",
        assetCount: 0,
        studyMinutes: 0,
        reviewCount: 0,
        mistakeCount: 1,
        hasSummary: false,
      },
    ]);
  });
});
