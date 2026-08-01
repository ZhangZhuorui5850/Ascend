import { datetime, RRule } from "rrule";
import { assertDateOnly, assertIanaTimeZone, localDateTimeToUtc, utcToZonedDateTime } from "./time";

const MAX_OCCURRENCES = 500;
const ALLOWED_FREQUENCIES = new Set([
  RRule.DAILY,
  RRule.WEEKLY,
  RRule.MONTHLY,
  RRule.YEARLY,
]);

export type RecurrenceExpansionInput = {
  rrule: string;
  startDate: string;
  startTime?: string;
  timeZone: string;
  rangeStart: string;
  rangeEnd: string;
  excludedOccurrenceKeys?: ReadonlySet<string>;
  limit?: number;
};

export type RecurrenceOccurrence = {
  occurrenceKey: string;
  startAt: string;
  localDate: string;
  localTime: string;
};

export function nextRecurrenceOccurrence(input: {
  rrule: string;
  startDate: string;
  startTime?: string;
  timeZone: string;
  after: string;
}): RecurrenceOccurrence | null {
  const startDate = assertDateOnly(input.startDate);
  const startTime = input.startTime ?? "00:00:00";
  const timeZone = assertIanaTimeZone(input.timeZone);
  const [year, month, day] = startDate.split("-").map(Number);
  const [hour, minute, second = 0] = startTime.split(":").map(Number);
  const options = RRule.parseString(normalizeRRule(input.rrule));
  const rule = new RRule({
    ...options,
    dtstart: datetime(year, month, day, hour, minute, second),
  });
  const afterLocal = utcToZonedDateTime(input.after, timeZone);
  const floatingAfter = floatingDate(afterLocal.date, afterLocal.time, 0);
  const next = rule.after(floatingAfter, false);
  if (!next) return null;
  const localDate = [
    String(next.getUTCFullYear()).padStart(4, "0"),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
  const localTime = [
    String(next.getUTCHours()).padStart(2, "0"),
    String(next.getUTCMinutes()).padStart(2, "0"),
    String(next.getUTCSeconds()).padStart(2, "0"),
  ].join(":");
  const startAt = localDateTimeToUtc({ date: localDate, time: localTime, timeZone });
  return { occurrenceKey: startAt, startAt, localDate, localTime };
}

export function normalizeRRule(value: string): string {
  const normalized = value.trim().replace(/^RRULE:/i, "").toUpperCase();
  const options = RRule.parseString(normalized);
  if (options.freq === undefined || !ALLOWED_FREQUENCIES.has(options.freq)) {
    throw new Error("Unsupported recurrence frequency");
  }
  if (options.interval !== undefined && (options.interval < 1 || options.interval > 366)) {
    throw new Error("Recurrence interval must be between 1 and 366");
  }
  if (options.count != null && (options.count < 1 || options.count > MAX_OCCURRENCES)) {
    throw new Error(`Recurrence COUNT must be between 1 and ${MAX_OCCURRENCES}`);
  }
  return new RRule(options).toString().replace(/^RRULE:/, "");
}

export function expandRecurrence(input: RecurrenceExpansionInput): RecurrenceOccurrence[] {
  const startDate = assertDateOnly(input.startDate);
  const timeZone = assertIanaTimeZone(input.timeZone);
  const startTime = input.startTime ?? "00:00";
  const rangeStart = parseInstant(input.rangeStart);
  const rangeEnd = parseInstant(input.rangeEnd);
  if (rangeEnd <= rangeStart) throw new Error("Recurrence range end must follow start");
  const limit = Math.min(Math.max(input.limit ?? MAX_OCCURRENCES, 1), MAX_OCCURRENCES);
  const [year, month, day] = startDate.split("-").map(Number);
  const [hour, minute, second = 0] = startTime.split(":").map(Number);
  const options = RRule.parseString(normalizeRRule(input.rrule));
  const rule = new RRule({
    ...options,
    dtstart: datetime(year, month, day, hour, minute, second),
  });

  const localRangeStart = utcToZonedDateTime(rangeStart, timeZone);
  const localRangeEnd = utcToZonedDateTime(rangeEnd, timeZone);
  const floatingStart = floatingDate(localRangeStart.date, "00:00:00", -1);
  const floatingEnd = floatingDate(localRangeEnd.date, "23:59:59", 1);
  const occurrences: RecurrenceOccurrence[] = [];
  let overflow = false;
  rule.between(floatingStart, floatingEnd, true, (floating, index) => {
    if (index >= limit) {
      overflow = true;
      return false;
    }
    const localDate = [
      String(floating.getUTCFullYear()).padStart(4, "0"),
      String(floating.getUTCMonth() + 1).padStart(2, "0"),
      String(floating.getUTCDate()).padStart(2, "0"),
    ].join("-");
    const localTime = [
      String(floating.getUTCHours()).padStart(2, "0"),
      String(floating.getUTCMinutes()).padStart(2, "0"),
      String(floating.getUTCSeconds()).padStart(2, "0"),
    ].join(":");
    const startAt = localDateTimeToUtc({ date: localDate, time: localTime, timeZone });
    const occurrenceKey = startAt;
    if (
      new Date(startAt) >= rangeStart
      && new Date(startAt) < rangeEnd
      && !input.excludedOccurrenceKeys?.has(occurrenceKey)
    ) {
      occurrences.push({ occurrenceKey, startAt, localDate, localTime });
    }
    return true;
  });
  if (overflow) throw new Error(`Recurrence expansion exceeds ${limit} occurrences`);
  return occurrences;
}

function parseInstant(value: string): Date {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error(`Invalid instant: ${value}`);
  return instant;
}

function floatingDate(date: string, time: string, dayOffset: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  const value = datetime(year, month, day, hour, minute, second);
  value.setUTCDate(value.getUTCDate() + dayOffset);
  return value;
}
