export function todayKey(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

export function assertDateKey(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date key: ${date}`);
  }
  return date;
}

export function shiftDateKey(date: string, days: number): string {
  const value = new Date(`${assertDateKey(date)}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function monthRange(centerDate = todayKey()): { start: string; end: string } {
  const date = new Date(`${centerDate}T00:00:00.000Z`);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** ISO 周（周一至周日），用于周目标与容量，不与滚动 7 天分析混用。 */
export function weekRange(centerDate = todayKey()): { start: string; end: string } {
  const date = new Date(`${assertDateKey(centerDate)}T00:00:00.000Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const start = shiftDateKey(centerDate, -daysSinceMonday);
  return { start, end: shiftDateKey(start, 6) };
}
