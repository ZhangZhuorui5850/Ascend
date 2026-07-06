import { describe, expect, it } from "vitest";
import { DEFAULT_VIEWS, applyViewFilters, getDefaultViewBySlug } from "./views";

describe("default views", () => {
  it("provides the eight Notion-style starter views", () => {
    expect(DEFAULT_VIEWS.map((view) => view.slug)).toEqual([
      "today-inbox",
      "week-calendar",
      "ten-week-timeline",
      "all-assets",
      "triage-board",
      "image-gallery",
      "mistake-review-calendar",
      "subject-matrix",
    ]);
  });

  it("finds a default view by slug", () => {
    expect(getDefaultViewBySlug("image-gallery")).toMatchObject({
      name: "图片截图库",
      type: "gallery",
      source: "assets",
    });
  });
});

describe("applyViewFilters", () => {
  const rows = [
    { id: 1, day: "2026-07-06", mime_type: "image/png", status: "待整理", subject_code: "M1" },
    { id: 2, day: "2026-07-07", mime_type: "application/pdf", status: "已归类", subject_code: "M2" },
    { id: 3, day: "2026-07-06", mime_type: "image/jpeg", status: "待整理", subject_code: "M1" },
  ];

  it("filters rows by equality and contains operators", () => {
    const filtered = applyViewFilters(rows, [
      { field: "day", operator: "equals", value: "2026-07-06" },
      { field: "mime_type", operator: "contains", value: "image" },
    ]);

    expect(filtered.map((row) => row.id)).toEqual([1, 3]);
  });
});
