import { describe, expect, it } from "vitest";
import { weekRange } from "./dates";

describe("weekRange", () => {
  it("uses ISO Monday-to-Sunday boundaries", () => {
    expect(weekRange("2026-07-20")).toEqual({ start: "2026-07-20", end: "2026-07-26" });
    expect(weekRange("2026-07-25")).toEqual({ start: "2026-07-20", end: "2026-07-26" });
    expect(weekRange("2026-07-26")).toEqual({ start: "2026-07-20", end: "2026-07-26" });
  });
});
