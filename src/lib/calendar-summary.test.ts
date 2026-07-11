import { describe, expect, it } from "vitest";
import { buildCalendarSummaries } from "./calendar-summary";

describe("buildCalendarSummaries", () => {
  it("merges pre-aggregated per-day rows into calendar summaries", () => {
    const summaries = buildCalendarSummaries({
      days: [
        { date: "2026-07-07", plan: "概率", summary: "" },
        { date: "2026-07-06", plan: "线代回炉", summary: "完成 A^n 复习" },
      ],
      assetCounts: [{ day: "2026-07-06", count: 2 }],
      studyMinutes: [{ day: "2026-07-06", minutes: 90 }],
      reviewCounts: [{ day: "2026-07-06", count: 1 }],
      mistakeCounts: [
        { day: "2026-07-06", count: 1 },
        { day: "2026-07-07", count: 1 },
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

  it("ignores aggregated rows for days without a daily entry", () => {
    const summaries = buildCalendarSummaries({
      days: [{ date: "2026-07-06", plan: "", summary: null }],
      assetCounts: [{ day: "2026-07-05", count: 4 }],
      studyMinutes: [{ day: "2026-07-05", minutes: 30 }],
      reviewCounts: [],
      mistakeCounts: [],
    });

    expect(summaries).toEqual([
      {
        date: "2026-07-06",
        plan: "",
        assetCount: 0,
        studyMinutes: 0,
        reviewCount: 0,
        mistakeCount: 0,
        hasSummary: false,
      },
    ]);
  });
});
