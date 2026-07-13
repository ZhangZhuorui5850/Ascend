import { describe, expect, it } from "vitest";
import { clampMastery, deriveStatus } from "./mastery";

describe("mastery helpers", () => {
  it("clamps to 0-100 and rounds", () => {
    expect(clampMastery(-5)).toBe(0);
    expect(clampMastery(160)).toBe(100);
    expect(clampMastery(72.6)).toBe(73);
  });

  it("derives status thresholds", () => {
    expect(deriveStatus(0)).toBe("未学");
    expect(deriveStatus(1)).toBe("学习中");
    expect(deriveStatus(79)).toBe("学习中");
    expect(deriveStatus(80)).toBe("已掌握");
  });
});
