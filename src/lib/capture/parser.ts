import { assertDateKey, shiftDateKey } from "../dates";

export type CaptureKind = "task" | "study" | "mistake" | "note" | "asset";

export type CaptureParseResult = {
  originalText: string;
  text: string;
  suggestedKind: Exclude<CaptureKind, "asset">;
  explicitKind: Exclude<CaptureKind, "asset"> | null;
  date: string | null;
  time: string | null;
  minutes: number | null;
  warnings: string[];
  preview: string[];
};

const KIND_PREFIXES: Array<{
  kind: Exclude<CaptureKind, "asset">;
  pattern: RegExp;
}> = [
  { kind: "task", pattern: /^\s*(?:任务|待办)\s*[:：]\s*/i },
  { kind: "study", pattern: /^\s*(?:学习|学习记录)\s*[:：]\s*/i },
  { kind: "mistake", pattern: /^\s*(?:错题|错误)\s*[:：]\s*/i },
  { kind: "note", pattern: /^\s*(?:笔记|随笔|记录)\s*[:：]\s*/i },
];

const AMBIGUOUS_TIME = /(?:下周|周末|月底|稍后|有空时|早上|上午|中午|下午|傍晚|晚上|今晚|明早|明晚)/;

/** Pure deterministic parser shared by the preview and server write path. */
export function parseCaptureText(input: {
  text: string;
  contextDay: string;
  selectedKind?: Exclude<CaptureKind, "asset">;
}): CaptureParseResult {
  const contextDay = assertCalendarDay(assertDateKey(input.contextDay));
  const originalText = input.text.trim();
  let working = originalText;
  const prefix = KIND_PREFIXES.find((candidate) => candidate.pattern.test(working));
  if (prefix) working = working.replace(prefix.pattern, "");
  const explicitKind = prefix?.kind ?? null;
  const suggestedKind = input.selectedKind ?? explicitKind ?? inferKind(working);
  const warnings: string[] = [];
  const preview: string[] = [];

  const dateToken = parseDateToken(working, contextDay);
  if (dateToken) {
    working = removeRange(working, dateToken.index, dateToken.length);
    preview.push(dateToken.day === contextDay ? "今天" : dateToken.day);
  }
  const timeToken = parseTimeToken(working);
  if (timeToken) {
    working = removeRange(working, timeToken.index, timeToken.length);
    preview.push(timeToken.time);
  }
  const durationToken = parseDurationToken(working);
  if (durationToken) {
    working = removeRange(working, durationToken.index, durationToken.length);
    preview.push(`${durationToken.minutes} 分钟`);
  }
  if (AMBIGUOUS_TIME.test(working)) {
    warnings.push("包含模糊时间词，已保留原文，请确认后再安排具体时间");
  }
  const text = normalizeWhitespace(working) || originalText;
  return {
    originalText,
    text,
    suggestedKind,
    explicitKind,
    date: dateToken?.day ?? (timeToken ? contextDay : null),
    time: timeToken?.time ?? null,
    minutes: durationToken?.minutes ?? null,
    warnings,
    preview,
  };
}

function inferKind(text: string): Exclude<CaptureKind, "asset"> {
  if (/(?:错题|做错|错因|误判|失分)/.test(text)) return "mistake";
  if (/(?:学习了|复习了|练习了|读完|背完)/.test(text)) return "study";
  if (/(?:想法|笔记|记一下|结论)/.test(text)) return "note";
  return "task";
}

function parseDateToken(text: string, contextDay: string): { day: string; index: number; length: number } | null {
  const relative = /(?:^|\s)(今天|明天|后天)(?=\s|$)/.exec(text);
  if (relative) {
    const offset = relative[1] === "明天" ? 1 : relative[1] === "后天" ? 2 : 0;
    const index = relative.index + relative[0].indexOf(relative[1]);
    return { day: shiftDateKey(contextDay, offset), index, length: relative[1].length };
  }
  const iso = /(?:^|\s)(\d{4}-\d{2}-\d{2})(?=\s|$)/.exec(text);
  if (iso) {
    const day = assertCalendarDay(assertDateKey(iso[1]));
    const index = iso.index + iso[0].indexOf(iso[1]);
    return { day, index, length: iso[1].length };
  }
  const monthDay = /(?:^|\s)(\d{1,2})月(\d{1,2})日?(?=\s|$)/.exec(text);
  if (!monthDay) return null;
  const year = Number(contextDay.slice(0, 4));
  const month = Number(monthDay[1]);
  const dayOfMonth = Number(monthDay[2]);
  const candidate = `${year}-${pad(month)}-${pad(dayOfMonth)}`;
  assertCalendarDay(assertDateKey(candidate));
  const token = monthDay[0].trim();
  return { day: candidate, index: monthDay.index + monthDay[0].indexOf(token), length: token.length };
}

function parseTimeToken(text: string): { time: string; index: number; length: number } | null {
  const match = /(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?=\s|$)/.exec(text);
  if (!match) return null;
  const token = `${match[1]}:${match[2]}`;
  return {
    time: `${pad(Number(match[1]))}:${match[2]}`,
    index: match.index + match[0].indexOf(token),
    length: token.length,
  };
}

function parseDurationToken(text: string): { minutes: number; index: number; length: number } | null {
  const match = /(?:^|\s)(\d+(?:\.\d+)?)\s*(分钟|分|min|小时|h)(?=\s|$)/i.exec(text);
  if (!match) return null;
  const amount = Number(match[1]);
  const minutes = Math.round(amount * (/小时|h/i.test(match[2]) ? 60 : 1));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1_440) return null;
  const token = match[0].trim();
  return { minutes, index: match.index + match[0].indexOf(token), length: token.length };
}

function removeRange(text: string, index: number, length: number): string {
  return `${text.slice(0, index)} ${text.slice(index + length)}`;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function assertCalendarDay(day: string): string {
  const value = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== day) {
    throw new Error(`Invalid date: ${day}`);
  }
  return day;
}
