import { z } from "zod";
import { normalizeRRule } from "./recurrence";
import { assertDateOnly, assertIanaTimeZone } from "./time";

const dateOnlySchema = z.string().refine((value) => {
  try {
    assertDateOnly(value);
    return true;
  } catch {
    return false;
  }
}, "日期格式需为 YYYY-MM-DD");

const instantSchema = z.iso.datetime({ offset: true });

const timeZoneSchema = z.string().refine((value) => {
  try {
    assertIanaTimeZone(value);
    return true;
  } catch {
    return false;
  }
}, "时区需为有效 IANA 标识");

export const plannerTaskDraftSchema = z.object({
  title: z.string().trim().min(1).max(500),
  listId: z.string().min(1),
  parentTaskId: z.string().nullable().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  status: z.enum(["open", "waiting", "completed", "canceled"]).default("open"),
  notes: z.string().max(20_000).default(""),
  subjectCode: z.string().trim().min(1).nullable().optional(),
  dueDate: dateOnlySchema.nullable().optional(),
  dueAt: instantSchema.nullable().optional(),
  dueTimezone: timeZoneSchema.nullable().optional(),
  scheduledStartAt: instantSchema.nullable().optional(),
  scheduledEndAt: instantSchema.nullable().optional(),
  scheduledTimezone: timeZoneSchema.nullable().optional(),
  scheduledAllDay: z.boolean().default(false),
  estimatedMinutes: z.number().int().min(5).max(1440).default(30),
}).superRefine((value, context) => {
  if (value.dueDate && value.dueAt) {
    context.addIssue({ code: "custom", message: "到期日期与到期瞬时值互斥", path: ["dueDate"] });
  }
  if (value.dueAt && !value.dueTimezone) {
    context.addIssue({ code: "custom", message: "定时到期需携带时区", path: ["dueTimezone"] });
  }
  const hasScheduledStart = Boolean(value.scheduledStartAt);
  const hasScheduledEnd = Boolean(value.scheduledEndAt);
  if (hasScheduledStart !== hasScheduledEnd) {
    context.addIssue({ code: "custom", message: "计划开始和结束需成对提供", path: ["scheduledEndAt"] });
  }
  if (hasScheduledStart && !value.scheduledTimezone) {
    context.addIssue({ code: "custom", message: "计划时间需携带时区", path: ["scheduledTimezone"] });
  }
  if (
    value.scheduledStartAt
    && value.scheduledEndAt
    && new Date(value.scheduledEndAt) <= new Date(value.scheduledStartAt)
  ) {
    context.addIssue({ code: "custom", message: "计划结束需晚于开始", path: ["scheduledEndAt"] });
  }
});

const eventBaseSchema = z.object({
  calendarId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(20_000).default(""),
  location: z.string().max(500).default(""),
  url: z.union([z.literal(""), z.url()]).default(""),
  subjectCode: z.string().trim().min(1).nullable().optional(),
  kind: z.enum(["event", "class", "exam", "meeting", "focus", "milestone"]).default("event"),
  busyStatus: z.enum(["busy", "free"]).default("busy"),
  recurrenceRule: z.string().transform((value, context) => {
    try {
      return normalizeRRule(value);
    } catch (error) {
      context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "重复规则无效" });
      return z.NEVER;
    }
  }).nullable().optional(),
});

export const calendarEventDraftSchema = z.discriminatedUnion("allDay", [
  eventBaseSchema.extend({
    allDay: z.literal(true),
    startDate: dateOnlySchema,
    endDateExclusive: dateOnlySchema,
  }).refine((value) => value.endDateExclusive > value.startDate, {
    message: "全天结束日期需晚于开始日期",
    path: ["endDateExclusive"],
  }),
  eventBaseSchema.extend({
    allDay: z.literal(false),
    startAt: instantSchema,
    endAt: instantSchema,
    timezone: timeZoneSchema,
  }).refine((value) => new Date(value.endAt) > new Date(value.startAt), {
    message: "事件结束需晚于开始",
    path: ["endAt"],
  }),
]);

export const plannerReminderDraftSchema = z.object({
  entityType: z.enum(["task", "event"]),
  entityId: z.string().min(1),
  anchor: z.enum(["due", "scheduled_start", "event_start", "exact"]),
  offsetMinutes: z.number().int().min(-43_200).max(43_200).nullable().optional(),
  exactAt: instantSchema.nullable().optional(),
  channel: z.enum(["in_app", "web_push"]),
}).superRefine((value, context) => {
  if (value.anchor === "exact" && !value.exactAt) {
    context.addIssue({ code: "custom", message: "精确提醒需提供触发瞬时值", path: ["exactAt"] });
  }
  if (value.anchor !== "exact" && value.offsetMinutes === undefined) {
    context.addIssue({ code: "custom", message: "相对提醒需提供偏移分钟数", path: ["offsetMinutes"] });
  }
});
