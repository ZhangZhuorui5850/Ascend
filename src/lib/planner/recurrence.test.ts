import { describe, expect, it } from "vitest";
import { expandRecurrence, nextRecurrenceOccurrence, normalizeRRule } from "./recurrence";

const fullRange = {
  rangeStart: "2026-01-01T00:00:00.000Z",
  rangeEnd: "2033-01-01T00:00:00.000Z",
};

describe("RFC 5545 recurrence expansion", () => {
  it("finds the next occurrence without materializing a long series", () => {
    expect(nextRecurrenceOccurrence({
      rrule: "FREQ=YEARLY;INTERVAL=2;COUNT=3",
      startDate: "2024-02-29",
      startTime: "09:00",
      timeZone: "Asia/Shanghai",
      after: "2024-02-29T01:00:00.000Z",
    })).toMatchObject({
      localDate: "2028-02-29",
      startAt: "2028-02-29T01:00:00.000Z",
    });
  });

  it("preserves local wall time across DST", () => {
    const occurrences = expandRecurrence({
      rrule: "FREQ=DAILY;COUNT=3",
      startDate: "2026-03-07",
      startTime: "09:00",
      timeZone: "America/New_York",
      rangeStart: "2026-03-06T00:00:00.000Z",
      rangeEnd: "2026-03-11T00:00:00.000Z",
    });
    expect(occurrences.map((item) => item.localTime)).toEqual(["09:00:00", "09:00:00", "09:00:00"]);
    expect(occurrences.map((item) => item.startAt)).toEqual([
      "2026-03-07T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
      "2026-03-09T13:00:00.000Z",
    ]);
  });

  it("uses RFC month-end semantics", () => {
    const occurrences = expandRecurrence({
      rrule: "FREQ=MONTHLY;COUNT=4",
      startDate: "2026-01-31",
      startTime: "10:00",
      timeZone: "Asia/Shanghai",
      ...fullRange,
    });
    expect(occurrences.map((item) => item.localDate)).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
      "2026-07-31",
    ]);
  });

  it("skips non-leap years for a February 29 yearly rule", () => {
    const occurrences = expandRecurrence({
      rrule: "FREQ=YEARLY;COUNT=3",
      startDate: "2024-02-29",
      timeZone: "UTC",
      rangeStart: "2024-01-01T00:00:00.000Z",
      rangeEnd: "2033-01-01T00:00:00.000Z",
    });
    expect(occurrences.map((item) => item.localDate)).toEqual([
      "2024-02-29",
      "2028-02-29",
      "2032-02-29",
    ]);
  });

  it("honors COUNT and UNTIL", () => {
    expect(expandRecurrence({
      rrule: "FREQ=DAILY;COUNT=2",
      startDate: "2026-07-01",
      timeZone: "UTC",
      rangeStart: "2026-07-01T00:00:00.000Z",
      rangeEnd: "2026-07-10T00:00:00.000Z",
    })).toHaveLength(2);
    expect(expandRecurrence({
      rrule: "FREQ=DAILY;UNTIL=20260703T000000Z",
      startDate: "2026-07-01",
      timeZone: "UTC",
      rangeStart: "2026-07-01T00:00:00.000Z",
      rangeEnd: "2026-07-10T00:00:00.000Z",
    }).map((item) => item.localDate)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
  });

  it("supports weekdays and exception occurrence keys", () => {
    const base = {
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4",
      startDate: "2026-07-06",
      startTime: "08:00",
      timeZone: "Asia/Shanghai",
      rangeStart: "2026-07-01T00:00:00.000Z",
      rangeEnd: "2026-07-31T00:00:00.000Z",
    };
    const all = expandRecurrence(base);
    const filtered = expandRecurrence({
      ...base,
      excludedOccurrenceKeys: new Set([all[1].occurrenceKey]),
    });
    expect(all.map((item) => item.localDate)).toEqual([
      "2026-07-06",
      "2026-07-08",
      "2026-07-13",
      "2026-07-15",
    ]);
    expect(filtered.map((item) => item.localDate)).toEqual(["2026-07-06", "2026-07-13", "2026-07-15"]);
  });

  it("caps expansion and validates frequency, interval, and count", () => {
    expect(() => expandRecurrence({
      rrule: "FREQ=DAILY",
      startDate: "2026-01-01",
      timeZone: "UTC",
      rangeStart: "2026-01-01T00:00:00.000Z",
      rangeEnd: "2026-12-31T00:00:00.000Z",
      limit: 10,
    })).toThrow("exceeds 10");
    expect(() => normalizeRRule("FREQ=HOURLY;COUNT=2")).toThrow("frequency");
    expect(() => normalizeRRule("FREQ=DAILY;INTERVAL=367;COUNT=2")).toThrow("interval");
    expect(() => normalizeRRule("FREQ=DAILY;COUNT=501")).toThrow("COUNT");
  });
});
