import { describe, expect, it } from "vitest";
import {
  findPlannerMotionLiteralViolations,
  resolveOverlayDismissal,
  resolveTaskWorkspace,
  settleTaskMutation,
  type PlannerListItem,
} from "./planner-view-model";

const ITEMS: PlannerListItem[] = [
  { id: "a", status: "open" },
  { id: "b", status: "open" },
  { id: "c", status: "open" },
];

describe("Planner responsive and recovery contracts", () => {
  it("uses the inline inspector only for the desktop three-column workspace", () => {
    expect(resolveTaskWorkspace(1440)).toEqual({
      columns: 3,
      navigation: "sidebar",
      inspector: "inline",
    });
    expect(resolveTaskWorkspace(900)).toEqual({
      columns: 2,
      navigation: "sidebar",
      inspector: "drawer",
    });
  });

  it("uses segmented navigation and a bottom sheet at 390px", () => {
    expect(resolveTaskWorkspace(390)).toEqual({
      columns: 1,
      navigation: "segmented",
      inspector: "sheet",
    });
  });

  it("restores a failed completion at its original position and selection", () => {
    const optimistic = ITEMS.filter((item) => item.id !== "b");
    const result = settleTaskMutation({
      current: optimistic,
      previous: ITEMS,
      selectedId: "b",
      ok: false,
    });

    expect(result.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(result.selectedId).toBe("b");
    expect(result.status).toBe("restored");
  });

  it("closes overlays with Escape and restores focus to the trigger", () => {
    expect(resolveOverlayDismissal("escape")).toEqual({
      close: true,
      restoreFocus: true,
    });
    expect(resolveOverlayDismissal("programmatic")).toEqual({
      close: true,
      restoreFocus: true,
    });
  });

  it("flags literal motion durations and accepts project motion tokens", () => {
    expect(findPlannerMotionLiteralViolations(
      ".row { transition: transform 180ms ease; }",
    )).toEqual(["180ms"]);
    expect(findPlannerMotionLiteralViolations(
      ".row { transition: transform var(--motion-base) var(--motion-ease-standard); }",
    )).toEqual([]);
  });
});
