import { describe, expect, it } from "vitest";
import { nextReviewDate } from "./review-schedule";

describe("nextReviewDate", () => {
  it("uses the 1/3/7/16/30 day review ladder and caps at 30 days", () => {
    expect(nextReviewDate("2026-07-06", 0)).toBe("2026-07-07");
    expect(nextReviewDate("2026-07-06", 1)).toBe("2026-07-09");
    expect(nextReviewDate("2026-07-06", 2)).toBe("2026-07-13");
    expect(nextReviewDate("2026-07-06", 3)).toBe("2026-07-22");
    expect(nextReviewDate("2026-07-06", 4)).toBe("2026-08-05");
    expect(nextReviewDate("2026-07-06", 9)).toBe("2026-08-05");
  });
});
