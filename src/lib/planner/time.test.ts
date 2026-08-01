import { describe, expect, it } from "vitest";
import {
  addMinutesToInstant,
  assertDateOnly,
  localDateTimeToUtc,
  utcToZonedDateTime,
} from "./time";

describe("Planner time semantics", () => {
  it("round-trips a Shanghai local time through a UTC instant", () => {
    const instant = localDateTimeToUtc({
      date: "2026-07-31",
      time: "09:30",
      timeZone: "Asia/Shanghai",
    });
    expect(instant).toBe("2026-07-31T01:30:00.000Z");
    expect(utcToZonedDateTime(instant, "Asia/Shanghai")).toEqual({
      date: "2026-07-31",
      time: "09:30:00",
      timeZone: "Asia/Shanghai",
      offsetMinutes: 480,
    });
  });

  it("rejects a local time inside a DST gap", () => {
    expect(() => localDateTimeToUtc({
      date: "2026-03-08",
      time: "02:30",
      timeZone: "America/New_York",
    })).toThrow("does not exist");
  });

  it("selects either side of a DST fold explicitly", () => {
    const earlier = localDateTimeToUtc({
      date: "2026-11-01",
      time: "01:30",
      timeZone: "America/New_York",
      disambiguation: "earlier",
    });
    const later = localDateTimeToUtc({
      date: "2026-11-01",
      time: "01:30",
      timeZone: "America/New_York",
      disambiguation: "later",
    });
    expect(earlier).toBe("2026-11-01T05:30:00.000Z");
    expect(later).toBe("2026-11-01T06:30:00.000Z");
    expect(() => localDateTimeToUtc({
      date: "2026-11-01",
      time: "01:30",
      timeZone: "America/New_York",
      disambiguation: "reject",
    })).toThrow("ambiguous");
  });

  it("keeps an instant stable while the displayed local date changes by zone", () => {
    const instant = "2026-08-01T00:30:00.000Z";
    expect(utcToZonedDateTime(instant, "Asia/Shanghai").date).toBe("2026-08-01");
    expect(utcToZonedDateTime(instant, "America/Los_Angeles").date).toBe("2026-07-31");
  });

  it("adds elapsed minutes across midnight as an instant operation", () => {
    expect(addMinutesToInstant("2026-07-31T15:30:00.000Z", 90)).toBe("2026-07-31T17:00:00.000Z");
  });

  it("validates leap days and calendar dates", () => {
    expect(assertDateOnly("2028-02-29")).toBe("2028-02-29");
    expect(() => assertDateOnly("2026-02-29")).toThrow("Invalid date");
    expect(() => assertDateOnly("2026-13-01")).toThrow("Invalid date");
  });
});
