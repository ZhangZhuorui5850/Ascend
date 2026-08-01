import { tzOffset } from "@date-fns/tz";

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export type LocalDateTime = {
  date: string;
  time: string;
  timeZone: string;
  disambiguation?: "earlier" | "later" | "reject";
};

export type ZonedDateTimeParts = {
  date: string;
  time: string;
  timeZone: string;
  offsetMinutes: number;
};

export function assertIanaTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return timeZone;
  } catch {
    throw new Error(`Invalid IANA time zone: ${timeZone}`);
  }
}

export function assertDateOnly(value: string): string {
  const match = DATE_KEY.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const [, year, month, day] = match;
  const instant = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    instant.getUTCFullYear() !== Number(year)
    || instant.getUTCMonth() + 1 !== Number(month)
    || instant.getUTCDate() !== Number(day)
  ) {
    throw new Error(`Invalid date: ${value}`);
  }
  return value;
}

export function localDateTimeToUtc(input: LocalDateTime): string {
  const date = assertDateOnly(input.date);
  const timeMatch = LOCAL_TIME.exec(input.time);
  if (!timeMatch) throw new Error(`Invalid local time: ${input.time}`);
  const timeZone = assertIanaTimeZone(input.timeZone);
  const [year, month, day] = date.split("-").map(Number);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? 0);
  const floating = Date.UTC(year, month - 1, day, hour, minute, second);
  const probeInstants = [
    new Date(floating - 36 * 60 * 60 * 1000),
    new Date(floating),
    new Date(floating + 36 * 60 * 60 * 1000),
  ];
  const offsets = [...new Set(probeInstants.map((instant) => tzOffset(timeZone, instant)))];
  const candidates = offsets
    .map((offset) => new Date(floating - offset * 60_000))
    .filter((candidate) => sameLocalParts(candidate, timeZone, { year, month, day, hour, minute, second }))
    .sort((a, b) => a.getTime() - b.getTime());

  if (!candidates.length) {
    throw new Error(`Local time does not exist in ${timeZone}: ${date} ${input.time}`);
  }
  if (candidates.length > 1 && input.disambiguation === "reject") {
    throw new Error(`Local time is ambiguous in ${timeZone}: ${date} ${input.time}`);
  }
  const selected = input.disambiguation === "later" ? candidates.at(-1)! : candidates[0];
  return selected.toISOString();
}

export function utcToZonedDateTime(instantValue: string | Date, timeZoneValue: string): ZonedDateTimeParts {
  const timeZone = assertIanaTimeZone(timeZoneValue);
  const instant = instantValue instanceof Date ? instantValue : new Date(instantValue);
  if (Number.isNaN(instant.getTime())) throw new Error(`Invalid instant: ${String(instantValue)}`);
  const parts = localParts(instant, timeZone);
  return {
    date: formatDate(parts),
    time: `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`,
    timeZone,
    offsetMinutes: tzOffset(timeZone, instant),
  };
}

export function addMinutesToInstant(instant: string, minutes: number): string {
  const value = new Date(instant);
  if (Number.isNaN(value.getTime())) throw new Error(`Invalid instant: ${instant}`);
  return new Date(value.getTime() + minutes * 60_000).toISOString();
}

export function dateKeyInTimeZone(instant: string | Date, timeZone: string): string {
  return utcToZonedDateTime(instant, timeZone).date;
}

function sameLocalParts(
  instant: Date,
  timeZone: string,
  expected: { year: number; month: number; day: number; hour: number; minute: number; second: number },
): boolean {
  const actual = localParts(instant, timeZone);
  return Object.entries(expected).every(([key, value]) => actual[key as keyof typeof actual] === value);
}

function localParts(instant: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function formatDate(parts: { year: number; month: number; day: number }): string {
  return `${String(parts.year).padStart(4, "0")}-${pad(parts.month)}-${pad(parts.day)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
