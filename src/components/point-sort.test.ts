import { describe, expect, it } from "vitest";
import type { PointRow } from "@/lib/repo/knowledge";
import { sortPointsForView } from "./point-sort";

function point(partial: Partial<PointRow> & { id: string }): PointRow {
  return {
    chapter_id: "c1",
    subject_code: "M1",
    title: partial.id,
    tier: "g",
    tier_name: "了解",
    status: "未学",
    mastery: 0,
    exam: 0,
    reviews: 0,
    last_review: null,
    next_review: null,
    created_at: "2026-07-01 00:00:00",
    asset_count: 0,
    mistake_count: 0,
    ...partial,
  } as PointRow;
}

describe("sortPointsForView", () => {
  const manual = [
    point({ id: "a", tier: "g", created_at: "2026-07-02 08:00:00" }),
    point({ id: "b", tier: "r", created_at: "2026-07-01 08:00:00" }),
    point({ id: "c", tier: "y", created_at: "2026-07-03 08:00:00" }),
  ];

  it("manual mode keeps server order and returns the same array", () => {
    expect(sortPointsForView(manual, "manual")).toBe(manual);
  });

  it("time mode sorts newest first without mutating input", () => {
    const sorted = sortPointsForView(manual, "time");
    expect(sorted.map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(manual.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("importance mode sorts r > y > g, stable within tier", () => {
    const sorted = sortPointsForView(manual, "importance");
    expect(sorted.map((p) => p.id)).toEqual(["b", "c", "a"]);
  });
});
