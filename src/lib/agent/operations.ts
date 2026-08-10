import type Database from "better-sqlite3";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { getUploadRoot } from "../db";
import { assertDateKey, shiftDateKey, todayKey } from "../dates";
import { writeAuditLog } from "../audit";
import {
  createTask as createCanonicalTask,
  deleteTask as deleteCanonicalTask,
  restoreTask as restoreCanonicalTask,
  updateTask as updateCanonicalTask,
} from "../application/tasks/commands";
import { revealAlgorithmHint } from "../repo/algorithm-hints";
import {
  getAlgorithmLearningState,
  resolveAlgorithmErrorCase,
  saveAlgorithmReflection,
} from "../repo/algorithm-learning";
import {
  createAlgorithmProblem,
  getAlgorithmDashboard,
  recordAlgorithmAttempt,
} from "../repo/algorithms";
import { getDay, updateDayEntry } from "../repo/days";
import {
  createChapter,
  createPoint,
  createSubject,
  deleteChapter,
  deletePoint,
  deleteSubject,
  getSubjectDetail,
  getSubjectOverviews,
  getSubjects,
  renameChapter,
  renameSubject,
  reparentChapter,
  updatePoint,
} from "../repo/knowledge";
import {
  createAssetFromUpload,
  createFolder,
  deleteAsset,
  deleteFolder,
  getExplorer,
  getStorageUsage,
  moveAsset,
  moveFolder,
  renameAsset,
  renameFolder,
  searchAssets,
  updateAssetMetadata,
} from "../repo/library";
import { createMockExam, getMockExamDashboard } from "../repo/mock-exams";
import {
  addNote,
  addTask,
  deleteNote,
  deleteTask,
  listCalendarTasks,
  scheduleTask,
  toggleTask,
  updateNote,
  updateTask,
} from "../repo/planner";
import { ensurePlannerDefaults, plannerDefaultId } from "../repo/planner-defaults";
import { listPlannerCalendars } from "../repo/planner-calendars";
import {
  createCalendarEvent,
  listCalendarEventRange,
  softDeleteCalendarEvent,
  updateCalendarEvent,
} from "../repo/planner-events";
import { listTaskLists } from "../repo/planner-lists";
import {
  cancelPlannerReminder,
  createPlannerReminder,
  listEntityReminders,
} from "../repo/planner-reminders";
import { createTaskSeries } from "../repo/planner-series";
import {
  listTaskView,
} from "../repo/planner-tasks";
import { createMistake, createReviewEvent, createStudySession, getMistakeBook } from "../repo/reviews";
import { searchWorkspace } from "../repo/search";
import { getSettings } from "../repo/settings";
import { getHomeSnapshot, getLearningAnalytics, getWeeklyCapacity } from "../repo/stats";
import type { AgentContext } from "./context";

type JsonObject = Record<string, unknown>;
type OperationSchema = z.ZodType<JsonObject>;

export type AgentRuntime = {
  db: Database.Database;
  context: AgentContext;
};

export type AgentOperation = {
  id: string;
  title: string;
  description: string;
  schema: OperationSchema;
  readOnly: boolean;
  destructive?: boolean;
  asyncWrite?: boolean;
  entityType?: string;
  run: (runtime: AgentRuntime, input: JsonObject) => unknown | Promise<unknown>;
};

function defineOperation<Schema extends OperationSchema>(input: {
  id: string;
  title: string;
  description: string;
  schema: Schema;
  readOnly: boolean;
  destructive?: boolean;
  asyncWrite?: boolean;
  entityType?: string;
  run: (runtime: AgentRuntime, input: z.infer<Schema>) => unknown | Promise<unknown>;
}): AgentOperation {
  return input as unknown as AgentOperation;
}

function requireConfirmation(confirm: boolean | undefined, label: string): void {
  if (!confirm) throw new Error(`${label}属于破坏性操作；请明确传入 confirm=true`);
}

function ensureRange(from: string, to: string, maxDays = 366): void {
  assertDateKey(from);
  assertDateKey(to);
  if (to < from) throw new Error("to 不能早于 from");
  if (shiftDateKey(from, maxDays) < to) throw new Error(`查询范围不能超过 ${maxDays} 天`);
}

function resultEntityId(result: unknown, input: JsonObject): string | null {
  if (result && typeof result === "object") {
    const record = result as JsonObject;
    for (const key of ["id", "path", "code", "assetId", "eventId"]) {
      if (record[key] !== undefined && record[key] !== null) return String(record[key]);
    }
    if (record.entity && typeof record.entity === "object") {
      const entity = record.entity as JsonObject;
      if (entity.id !== undefined && entity.id !== null) return String(entity.id);
    }
  }
  for (const key of ["id", "path", "code", "assetId"]) {
    if (input[key] !== undefined && input[key] !== null) return String(input[key]);
  }
  return null;
}

function allowedImportRoots(): string[] {
  const configured = process.env.ASCEND_AGENT_IMPORT_ROOTS;
  const cwd = resolve(/* turbopackIgnore: true */ process.cwd());
  return (configured ? configured.split(",") : [cwd]).map((value) => resolve(value.trim())).filter(Boolean);
}

async function resolveImportPath(value: string): Promise<string> {
  const candidate = await realpath(isAbsolute(value) ? value : resolve(/* turbopackIgnore: true */ process.cwd(), value));
  const roots = await Promise.all(allowedImportRoots().map(async (root) => realpath(root).catch(() => root)));
  const allowed = roots.some((root) => {
    const child = relative(root, candidate);
    return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
  });
  if (!allowed) throw new Error("文件不在 ASCEND_AGENT_IMPORT_ROOTS 允许的目录中");
  const info = await stat(candidate);
  if (!info.isFile()) throw new Error("导入路径不是普通文件");
  return candidate;
}

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("日期，YYYY-MM-DD");
const tier = z.enum(["r", "y", "g"]);

export const agentOperations: AgentOperation[] = [
  defineOperation({
    id: "status",
    title: "Ascend Agent 状态",
    description: "返回当前 Agent 身份、学习空间和运行配置，不返回凭据。",
    schema: z.object({}),
    readOnly: true,
    run: ({ context }) => ({
      user: { id: context.userId, email: context.email, displayName: context.displayName },
      workspaceId: context.workspaceId,
      today: todayKey(),
      dataRoot: process.env.ZGCA_DATA_ROOT || "./data",
      importRoots: allowedImportRoots(),
      operationCount: agentOperations.length,
    }),
  }),
  defineOperation({
    id: "dashboard.get",
    title: "获取学习仪表盘",
    description: "读取指定日期的首页快照、七日分析、日历周目标容量和资料容量。",
    schema: z.object({ date: date.optional() }),
    readOnly: true,
    run: ({ db, context }, input) => {
      const day = input.date || todayKey();
      const settings = getSettings(db, context);
      return {
        day,
        home: getHomeSnapshot(db, context, day),
        analytics: getLearningAnalytics(db, context, day),
        weeklyCapacity: getWeeklyCapacity(db, context, {
          today: day,
          targetMinutes: settings.weeklyMinutes,
        }),
        storage: getStorageUsage(db, context),
      };
    },
  }),
  defineOperation({
    id: "day.get",
    title: "获取某日工作区",
    description: "读取某日计划、日记、任务、随笔、复习、错题、资料与学习记录。",
    schema: z.object({ date: date.optional(), reviewLimit: z.number().int().min(1).max(100).optional() }),
    readOnly: true,
    run: ({ db, context }, input) => getDay(db, context, input.date || todayKey(), { reviewLimit: input.reviewLimit }),
  }),
  defineOperation({
    id: "day.update",
    title: "更新某日日志",
    description: "局部更新某日的计划、日记、总结、阻碍或明日计划；未提供字段保持不变。",
    schema: z.object({
      date,
      plan: z.string().optional(),
      diary: z.string().optional(),
      summary: z.string().optional(),
      blockers: z.string().optional(),
      tomorrow: z.string().optional(),
    }),
    readOnly: false,
    entityType: "daily_entry",
    run: ({ db, context }, input) => {
      const { date: day, ...fields } = input;
      if (!Object.keys(fields).length) throw new Error("至少提供一个要更新的字段");
      updateDayEntry(db, context, day, fields);
      return { date: day, updatedFields: Object.keys(fields) };
    },
  }),
  defineOperation({
    id: "task.list",
    title: "查询日程任务",
    description: "按日期范围查询日历任务；默认只查今天，最多 366 天、500 条。",
    schema: z.object({
      from: date.optional(),
      to: date.optional(),
      includeDone: z.boolean().optional().default(true),
    }),
    readOnly: true,
    run: ({ db, context }, input) => {
      const from = input.from || todayKey();
      const to = input.to || from;
      ensureRange(from, to);
      return listCalendarTasks(db, context, {
        from,
        to,
        includeDone: input.includeDone,
        limit: 500,
      });
    },
  }),
  defineOperation({
    id: "task.create",
    title: "创建日程任务",
    description: "在指定日期创建任务，可关联知识点、活动类型、完成标准和来源。",
    schema: z.object({
      day: date,
      title: z.string().min(1),
      subjectCode: z.string().optional(),
      priority: z.number().int().min(1).max(3).optional(),
      estimatedMinutes: z.number().int().min(5).max(480).optional(),
      scheduledStart: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .nullable()
        .optional(),
      notes: z.string().max(500).optional(),
      knowledgePointId: z.string().nullable().optional(),
      activityType: z
        .enum(["unspecified", "study", "practice", "recall", "review", "mock", "mixed"])
        .optional(),
      completionCriteria: z.string().max(500).optional(),
      sourceType: z.string().max(50).optional(),
      sourceId: z.union([z.string(), z.number()]).optional(),
      verificationMethod: z.string().max(200).optional(),
    }),
    readOnly: false,
    entityType: "task",
    run: ({ db, context }, input) => addTask(db, context, input),
  }),
  defineOperation({
    id: "task.update",
    title: "更新日程任务",
    description: "局部更新任务内容、完成状态或排期；传入 day 可跨日移动。",
    schema: z.object({
      id: z.number().int().positive(),
      title: z.string().min(1).optional(),
      subjectCode: z.string().nullable().optional(),
      priority: z.number().int().min(1).max(3).optional(),
      estimatedMinutes: z.number().int().min(5).max(480).optional(),
      scheduledStart: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .nullable()
        .optional(),
      notes: z.string().max(500).optional(),
      knowledgePointId: z.string().nullable().optional(),
      activityType: z
        .enum(["unspecified", "study", "practice", "recall", "review", "mock", "mixed"])
        .optional(),
      completionCriteria: z.string().max(500).optional(),
      plannedVerificationMethod: z.string().max(200).optional(),
      day: date.optional(),
      done: z.boolean().optional(),
      actualMinutes: z.number().int().min(1).max(1440).nullable().optional(),
      completionOutput: z.string().max(1000).optional(),
      verificationMethod: z.string().max(200).optional(),
      verificationResult: z.string().max(200).optional(),
      verificationOutcome: z.enum(["improved", "unchanged", "regressed", "unknown"]).optional(),
      recordAsStudy: z.boolean().optional(),
      scheduleRetestAfterDays: z.union([z.literal(1), z.literal(3), z.literal(7)]).optional(),
    }),
    readOnly: false,
    entityType: "task",
    run: ({ db, context }, input) => {
      const {
        id,
        day,
        done,
        actualMinutes,
        completionOutput,
        verificationMethod,
        verificationResult,
        verificationOutcome,
        recordAsStudy,
        scheduleRetestAfterDays,
        ...fields
      } = input;
      if (Object.keys(fields).length) updateTask(db, context, { id, ...fields });
      if (day)
        scheduleTask(db, context, {
          id,
          day,
          scheduledStart: input.scheduledStart,
          estimatedMinutes: input.estimatedMinutes,
        });
      if (done !== undefined) {
        toggleTask(db, context, {
          id,
          done,
          actualMinutes,
          completionOutput,
          verificationMethod,
          verificationResult,
          verificationOutcome,
          recordAsStudy,
          scheduleRetestAfterDays,
        });
      } else if (
        actualMinutes !== undefined
        || completionOutput !== undefined
        || verificationMethod !== undefined
        || verificationResult !== undefined
        || verificationOutcome !== undefined
        || recordAsStudy !== undefined
        || scheduleRetestAfterDays !== undefined
      ) {
        throw new Error("完成证据只能在 done=true 时写入");
      }
      if (!Object.keys(fields).length && !day && done === undefined) {
        throw new Error("至少提供一个要更新的字段");
      }
      return { id, updated: true };
    },
  }),
  defineOperation({
    id: "task.delete",
    title: "删除日程任务",
    description: "把一个任务移入 Planner 回收站，必须明确确认。",
    schema: z.object({ id: z.number().int().positive(), confirm: z.boolean() }),
    readOnly: false,
    destructive: true,
    entityType: "task",
    run: ({ db, context }, input) => {
      requireConfirmation(input.confirm, "删除任务");
      deleteTask(db, context, input.id);
      return { id: input.id, deleted: true };
    },
  }),
  defineOperation({
    id: "planner.task.list",
    title: "查询 Planner v2 任务",
    description: "按智能视图查询 Planner v2 任务，同时返回可用清单。任务包含独立到期、排期、层级、状态与 version。",
    schema: z.object({
      view: z.enum(["inbox", "today", "upcoming", "anytime", "overdue", "waiting", "completed", "trash", "all"])
        .optional()
        .default("inbox"),
      today: date.optional(),
      listId: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    readOnly: true,
    entityType: "planner_task",
    run: ({ db, context }, input) => {
      ensurePlannerDefaults(db, context);
      return {
        lists: listTaskLists(db, context),
        tasks: listTaskView(db, context, {
          view: input.view,
          today: input.today ?? todayKey(),
          listId: input.listId,
          limit: input.limit,
        }),
      };
    },
  }),
  defineOperation({
    id: "planner.task.create",
    title: "创建 Planner v2 任务",
    description: "幂等创建 Planner v2 任务；due 与 scheduled 字段保持独立，瞬时值使用 UTC ISO 8601。",
    schema: z.object({
      clientMutationId: z.string().min(1).max(200),
      listId: z.string().optional(),
      parentTaskId: z.string().nullable().optional(),
      title: z.string().min(1).max(500),
      notes: z.string().max(20_000).optional(),
      subjectCode: z.string().nullable().optional(),
      status: z.enum(["open", "waiting", "completed", "canceled"]).optional(),
      priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      dueDate: date.nullable().optional(),
      dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
      dueTimezone: z.string().nullable().optional(),
      scheduledStartAt: z.iso.datetime({ offset: true }).nullable().optional(),
      scheduledEndAt: z.iso.datetime({ offset: true }).nullable().optional(),
      scheduledTimezone: z.string().nullable().optional(),
      estimatedMinutes: z.number().int().min(5).max(1440).optional(),
    }),
    readOnly: false,
    entityType: "planner_task",
    run: ({ db, context }, input) => {
      ensurePlannerDefaults(db, context);
      return createCanonicalTask(db, context, {
        ...input,
        listId: input.listId ?? plannerDefaultId(context.workspaceId, "inbox"),
      });
    },
  }),
  defineOperation({
    id: "planner.task.update",
    title: "更新 Planner v2 任务",
    description: "按 expectedVersion 局部更新任务；版本冲突返回最新实体。",
    schema: z.object({
      id: z.string().min(1),
      expectedVersion: z.number().int().positive(),
      listId: z.string().optional(),
      parentTaskId: z.string().nullable().optional(),
      title: z.string().min(1).max(500).optional(),
      notes: z.string().max(20_000).optional(),
      subjectCode: z.string().nullable().optional(),
      status: z.enum(["open", "waiting", "completed", "canceled"]).optional(),
      priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      dueDate: date.nullable().optional(),
      dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
      dueTimezone: z.string().nullable().optional(),
      scheduledStartAt: z.iso.datetime({ offset: true }).nullable().optional(),
      scheduledEndAt: z.iso.datetime({ offset: true }).nullable().optional(),
      scheduledTimezone: z.string().nullable().optional(),
      estimatedMinutes: z.number().int().min(5).max(1440).optional(),
    }),
    readOnly: false,
    entityType: "planner_task",
    run: ({ db, context }, input) => updateCanonicalTask(db, context, input),
  }),
  defineOperation({
    id: "planner.task.delete",
    title: "移动 Planner v2 任务到回收站",
    description: "使用稳定 clientMutationId 软删除任务，必须明确确认。",
    schema: z.object({
      id: z.string().min(1),
      expectedVersion: z.number().int().positive(),
      clientMutationId: z.string().min(1).max(200),
      confirm: z.boolean(),
    }),
    readOnly: false,
    destructive: true,
    entityType: "planner_task",
    run: ({ db, context }, input) => {
      requireConfirmation(input.confirm, "删除 Planner 任务");
      return deleteCanonicalTask(db, context, input);
    },
  }),
  defineOperation({
    id: "planner.task.restore",
    title: "恢复 Planner v2 任务",
    description: "使用稳定 clientMutationId 从回收站恢复任务。",
    schema: z.object({
      id: z.string().min(1),
      expectedVersion: z.number().int().positive(),
      clientMutationId: z.string().min(1).max(200),
    }),
    readOnly: false,
    entityType: "planner_task",
    run: ({ db, context }, input) => restoreCanonicalTask(db, context, input),
  }),
  defineOperation({
    id: "planner.calendar.list",
    title: "查询 Planner 日历",
    description: "列出当前 workspace 的可用日历容器。",
    schema: z.object({}),
    readOnly: true,
    entityType: "planner_calendar",
    run: ({ db, context }) => {
      ensurePlannerDefaults(db, context);
      return listPlannerCalendars(db, context);
    },
  }),
  defineOperation({
    id: "planner.event.list",
    title: "查询 Planner 事件",
    description: "按日期范围查询独立日历事件，包含定时、全天与多日事件。",
    schema: z.object({ from: date, to: date }),
    readOnly: true,
    entityType: "calendar_event",
    run: ({ db, context }, input) => {
      ensureRange(input.from, input.to);
      const endDateExclusive = shiftDateKey(input.to, 1);
      return listCalendarEventRange(db, context, {
        start: `${input.from}T00:00:00.000Z`,
        end: `${endDateExclusive}T00:00:00.000Z`,
        startDate: input.from,
        endDateExclusive,
      });
    },
  }),
  defineOperation({
    id: "planner.event.create",
    title: "创建 Planner 事件",
    description: "使用稳定 clientMutationId 幂等创建定时或全天事件。",
    schema: z.discriminatedUnion("allDay", [
      z.object({
        clientMutationId: z.string().min(1).max(200),
        calendarId: z.string().min(1),
        title: z.string().min(1).max(500),
        description: z.string().max(20_000).optional(),
        location: z.string().max(500).optional(),
        url: z.union([z.literal(""), z.url()]).optional(),
        kind: z.enum(["event", "class", "exam", "meeting", "focus", "milestone"]).optional(),
        busyStatus: z.enum(["busy", "free"]).optional(),
        allDay: z.literal(true),
        startDate: date,
        endDateExclusive: date,
      }),
      z.object({
        clientMutationId: z.string().min(1).max(200),
        calendarId: z.string().min(1),
        title: z.string().min(1).max(500),
        description: z.string().max(20_000).optional(),
        location: z.string().max(500).optional(),
        url: z.union([z.literal(""), z.url()]).optional(),
        kind: z.enum(["event", "class", "exam", "meeting", "focus", "milestone"]).optional(),
        busyStatus: z.enum(["busy", "free"]).optional(),
        allDay: z.literal(false),
        startAt: z.iso.datetime({ offset: true }),
        endAt: z.iso.datetime({ offset: true }),
        timezone: z.string().min(1),
      }),
    ]),
    readOnly: false,
    entityType: "calendar_event",
    run: ({ db, context }, input) => createCalendarEvent(db, context, input),
  }),
  defineOperation({
    id: "planner.event.update",
    title: "更新 Planner 事件",
    description: "使用 expectedVersion 更新事件详情、日历、忙闲或时间范围。",
    schema: z.object({
      id: z.string().min(1),
      expectedVersion: z.number().int().positive(),
      calendarId: z.string().optional(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(20_000).optional(),
      location: z.string().max(500).optional(),
      url: z.union([z.literal(""), z.url()]).optional(),
      kind: z.enum(["event", "class", "exam", "meeting", "focus", "milestone"]).optional(),
      busyStatus: z.enum(["busy", "free"]).optional(),
      allDay: z.boolean().optional(),
      startAt: z.iso.datetime({ offset: true }).optional(),
      endAt: z.iso.datetime({ offset: true }).optional(),
      timezone: z.string().optional(),
      startDate: date.optional(),
      endDateExclusive: date.optional(),
    }),
    readOnly: false,
    entityType: "calendar_event",
    run: ({ db, context }, input) => updateCalendarEvent(db, context, input),
  }),
  defineOperation({
    id: "planner.event.delete",
    title: "删除 Planner 事件",
    description: "使用稳定 clientMutationId 软删除事件，必须明确确认。",
    schema: z.object({
      id: z.string().min(1),
      expectedVersion: z.number().int().positive(),
      clientMutationId: z.string().min(1).max(200),
      confirm: z.boolean(),
    }),
    readOnly: false,
    destructive: true,
    entityType: "calendar_event",
    run: ({ db, context }, input) => {
      requireConfirmation(input.confirm, "删除 Planner 事件");
      return softDeleteCalendarEvent(db, context, input);
    },
  }),
  defineOperation({
    id: "planner.task.series.create",
    title: "创建重复任务系列",
    description: "创建 fixed_schedule 或 after_completion 重复任务系列并生成首个实例。",
    schema: z.object({
      clientMutationId: z.string().min(1).max(200),
      rrule: z.string().min(1),
      timezone: z.string().min(1),
      generationMode: z.enum(["fixed_schedule", "after_completion"]),
      firstOccurrenceAt: z.iso.datetime({ offset: true }),
      listId: z.string().min(1),
      title: z.string().min(1).max(500),
      notes: z.string().max(20_000).optional(),
      subjectCode: z.string().nullable().optional(),
      priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      estimatedMinutes: z.number().int().min(5).max(1440).optional(),
    }),
    readOnly: false,
    entityType: "task_series",
    run: ({ db, context }, input) => {
      const {
        clientMutationId,
        rrule,
        timezone,
        generationMode,
        firstOccurrenceAt,
        ...template
      } = input;
      return createTaskSeries(db, context, {
        clientMutationId,
        rrule,
        timezone,
        generationMode,
        firstOccurrenceAt,
        template,
      });
    },
  }),
  defineOperation({
    id: "planner.reminder.list",
    title: "查询实体提醒",
    description: "查询指定任务或事件的提醒状态与下次尝试时间。",
    schema: z.object({
      entityType: z.enum(["task", "event"]),
      entityId: z.string().min(1),
    }),
    readOnly: true,
    entityType: "planner_reminder",
    run: ({ db, context }, input) => listEntityReminders(db, context, input),
  }),
  defineOperation({
    id: "planner.reminder.create",
    title: "创建 Planner 提醒",
    description: "使用稳定 clientMutationId 创建应用内或 Web Push 提醒。",
    schema: z.object({
      clientMutationId: z.string().min(1).max(200),
      entityType: z.enum(["task", "event"]),
      entityId: z.string().min(1),
      anchor: z.enum(["due", "scheduled_start", "event_start", "exact"]),
      offsetMinutes: z.number().int().min(-43_200).max(43_200).nullable().optional(),
      exactAt: z.iso.datetime({ offset: true }).nullable().optional(),
      channel: z.enum(["in_app", "web_push"]),
    }),
    readOnly: false,
    entityType: "planner_reminder",
    run: ({ db, context }, input) => createPlannerReminder(db, context, input),
  }),
  defineOperation({
    id: "planner.reminder.cancel",
    title: "取消 Planner 提醒",
    description: "取消 workspace 内指定提醒。",
    schema: z.object({ id: z.string().min(1) }),
    readOnly: false,
    entityType: "planner_reminder",
    run: ({ db, context }, input) => cancelPlannerReminder(db, context, input.id),
  }),
  defineOperation({
    id: "note.manage",
    title: "管理每日随笔",
    description: "创建、更新或删除某日随笔；读取随笔请使用 day.get，删除必须明确确认。",
    schema: z.discriminatedUnion("action", [
      z.object({ action: z.literal("create"), day: date, content: z.string().min(1) }),
      z.object({ action: z.literal("update"), id: z.number().int().positive(), content: z.string().min(1) }),
      z.object({ action: z.literal("delete"), id: z.number().int().positive(), confirm: z.boolean() }),
    ]),
    readOnly: false,
    destructive: true,
    entityType: "day_note",
    run: ({ db, context }, input) => {
      if (input.action === "create") return addNote(db, context, input);
      if (input.action === "update") {
        updateNote(db, context, input);
        return { id: input.id, updated: true };
      }
      requireConfirmation(input.confirm, "删除随笔");
      deleteNote(db, context, input.id);
      return { id: input.id, deleted: true };
    },
  }),
  defineOperation({
    id: "subject.list",
    title: "查询科目",
    description: "列出科目；可附带指定日期的掌握度、到期复习、资料和错题统计。",
    schema: z.object({ withStats: z.boolean().optional().default(true), date: date.optional() }),
    readOnly: true,
    run: ({ db, context }, input) =>
      input.withStats ? getSubjectOverviews(db, context, input.date || todayKey()) : getSubjects(db, context),
  }),
  defineOperation({
    id: "subject.get",
    title: "获取科目详情",
    description: "读取一个科目的章节树、知识点、资料和错题。",
    schema: z.object({ code: z.string().min(1) }),
    readOnly: true,
    run: ({ db, context }, input) => {
      const result = getSubjectDetail(db, context, input.code);
      if (!result) throw new Error("科目不存在");
      return result;
    },
  }),
  defineOperation({
    id: "subject.manage",
    title: "管理科目",
    description: "创建或更新科目；删除会级联删除章节和知识点，必须明确确认。",
    schema: z.discriminatedUnion("action", [
      z.object({
        action: z.literal("upsert"),
        code: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        track: z.enum(["written", "machine"]).optional(),
      }),
      z.object({
        action: z.literal("update"),
        code: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        track: z.enum(["written", "machine"]).optional(),
      }),
      z.object({ action: z.literal("delete"), code: z.string().min(1), confirm: z.boolean() }),
    ]),
    readOnly: false,
    destructive: true,
    entityType: "subject",
    run: ({ db, context }, input) => {
      if (input.action === "upsert") return createSubject(db, context, input);
      if (input.action === "update") {
        renameSubject(db, context, input);
        return { code: input.code, updated: true };
      }
      requireConfirmation(input.confirm, "删除科目");
      deleteSubject(db, context, input.code);
      return { code: input.code, deleted: true };
    },
  }),
  defineOperation({
    id: "chapter.manage",
    title: "管理章节",
    description: "创建、重命名、调整父章节或删除章节；删除必须明确确认。",
    schema: z.discriminatedUnion("action", [
      z.object({
        action: z.literal("create"),
        subjectCode: z.string().min(1),
        title: z.string().min(1),
        parentId: z.string().nullable().optional(),
      }),
      z.object({
        action: z.literal("update"),
        id: z.string().min(1),
        title: z.string().min(1).optional(),
        parentId: z.string().nullable().optional(),
      }),
      z.object({ action: z.literal("delete"), id: z.string().min(1), confirm: z.boolean() }),
    ]),
    readOnly: false,
    destructive: true,
    entityType: "chapter",
    run: ({ db, context }, input) => {
      if (input.action === "create") return createChapter(db, context, input);
      if (input.action === "update") {
        if (input.title !== undefined) renameChapter(db, context, { id: input.id, title: input.title });
        if (input.parentId !== undefined) reparentChapter(db, context, { id: input.id, parentId: input.parentId });
        if (input.title === undefined && input.parentId === undefined) throw new Error("至少提供 title 或 parentId");
        return { id: input.id, updated: true };
      }
      requireConfirmation(input.confirm, "删除章节");
      deleteChapter(db, context, input.id);
      return { id: input.id, deleted: true };
    },
  }),
  defineOperation({
    id: "knowledge.manage",
    title: "管理知识点",
    description: "创建或更新知识点；selfConfidence 是主观信心，不会覆盖系统证据状态；删除会级联删除子知识点，必须明确确认。",
    schema: z.discriminatedUnion("action", [
      z.object({
        action: z.literal("create"),
        chapterId: z.string().nullable().optional(),
        parentPointId: z.string().nullable().optional(),
        title: z.string().min(1),
        tier: tier.optional(),
        exam: z.boolean().optional(),
      }),
      z.object({
        action: z.literal("update"),
        id: z.string().min(1),
        title: z.string().optional(),
        tier: tier.optional(),
        exam: z.boolean().optional(),
        selfConfidence: z.number().min(0).max(100).nullable().optional(),
        /** @deprecated 兼容旧客户端；现在写入主观信心，不再覆盖系统证据指数。 */
        mastery: z.number().min(0).max(100).optional(),
        prompt: z.string().optional(),
        answer: z.string().optional(),
      }),
      z.object({ action: z.literal("delete"), id: z.string().min(1), confirm: z.boolean() }),
    ]),
    readOnly: false,
    destructive: true,
    entityType: "knowledge_point",
    run: ({ db, context }, input) => {
      if (input.action === "create") return createPoint(db, context, input);
      if (input.action === "update") {
        updatePoint(db, context, {
          ...input,
          selfConfidence: input.selfConfidence !== undefined ? input.selfConfidence : input.mastery,
        });
        return { id: input.id, updated: true };
      }
      requireConfirmation(input.confirm, "删除知识点");
      deletePoint(db, context, input.id);
      return { id: input.id, deleted: true };
    },
  }),
  defineOperation({
    id: "search.all",
    title: "全局搜索",
    description: "跨知识点、错题、任务、随笔和资料搜索当前学习空间，返回分组与深链。",
    schema: z.object({
      query: z.string().trim().min(1).max(80),
      perKindLimit: z.number().int().min(1).max(10).optional(),
    }),
    readOnly: true,
    run: ({ db, context }, input) => searchWorkspace(db, context, input.query, {
      perKindLimit: input.perKindLimit,
    }),
  }),
  defineOperation({
    id: "library.list",
    title: "浏览资料库",
    description: "像文件管理器一样读取指定文件夹、子文件夹、分页文件和目录树。",
    schema: z.object({
      path: z.string().optional().default(""),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(200).optional(),
    }),
    readOnly: true,
    run: ({ db, context }, input) => getExplorer(db, context, input.path, {
      page: input.page,
      pageSize: input.pageSize,
    }),
  }),
  defineOperation({
    id: "library.search",
    title: "搜索资料库",
    description: "按文件名、备注、分类、目录、科目、章节或知识点搜索资料，最多 100 条。",
    schema: z.object({ query: z.string().min(1) }),
    readOnly: true,
    run: ({ db, context }, input) => searchAssets(db, context, input.query),
  }),
  defineOperation({
    id: "folder.manage",
    title: "管理资料文件夹",
    description: "创建、重命名、移动或删除空文件夹；删除必须明确确认。",
    schema: z.discriminatedUnion("action", [
      z.object({ action: z.literal("create"), parentPath: z.string().optional().default(""), name: z.string().min(1) }),
      z.object({ action: z.literal("rename"), path: z.string().min(1), name: z.string().min(1) }),
      z.object({ action: z.literal("move"), path: z.string().min(1), newParentPath: z.string() }),
      z.object({ action: z.literal("delete"), path: z.string().min(1), confirm: z.boolean() }),
    ]),
    readOnly: false,
    destructive: true,
    entityType: "folder",
    run: ({ db, context }, input) => {
      if (input.action === "create") return { path: createFolder(db, context, input) };
      if (input.action === "rename") return { path: renameFolder(db, context, input) };
      if (input.action === "move") return { path: moveFolder(db, context, input) };
      requireConfirmation(input.confirm, "删除文件夹");
      deleteFolder(db, context, input.path);
      return { path: input.path, deleted: true };
    },
  }),
  defineOperation({
    id: "asset.import",
    title: "导入本地资料",
    description: "从允许目录导入本地文件；允许目录由 ASCEND_AGENT_IMPORT_ROOTS 控制。",
    schema: z.object({
      localPath: z.string().min(1),
      day: date.optional(),
      folderPath: z.string().optional(),
      category: z.string().optional(),
      note: z.string().optional(),
      subjectCode: z.string().optional(),
      chapterId: z.string().optional(),
      knowledgePointIds: z.array(z.string()).max(100).optional(),
    }),
    readOnly: false,
    asyncWrite: true,
    entityType: "asset",
    run: async ({ db, context }, input) => {
      const filePath = await resolveImportPath(input.localPath);
      const bytes = await readFile(filePath);
      const file = new File([bytes], basename(filePath));
      return createAssetFromUpload(db, context, { ...input, file, uploadRoot: getUploadRoot() });
    },
  }),
  defineOperation({
    id: "asset.manage",
    title: "管理资料",
    description: "重命名、移动、更新资料元数据或删除资料；删除必须明确确认。",
    schema: z.discriminatedUnion("action", [
      z.object({ action: z.literal("rename"), assetId: z.number().int().positive(), name: z.string().min(1) }),
      z.object({ action: z.literal("move"), assetId: z.number().int().positive(), folderPath: z.string() }),
      z.object({
        action: z.literal("metadata"),
        assetId: z.number().int().positive(),
        day: date,
        category: z.string(),
        note: z.string(),
        subjectCode: z.string().optional(),
        chapterId: z.string().optional(),
        knowledgePointIds: z.array(z.string()).max(100).optional(),
      }),
      z.object({ action: z.literal("delete"), assetId: z.number().int().positive(), confirm: z.boolean() }),
    ]),
    readOnly: false,
    destructive: true,
    entityType: "asset",
    run: ({ db, context }, input) => {
      if (input.action === "rename") renameAsset(db, context, input);
      else if (input.action === "move") moveAsset(db, context, input);
      else if (input.action === "metadata") updateAssetMetadata(db, context, input);
      else {
        requireConfirmation(input.confirm, "删除资料");
        deleteAsset(db, context, input.assetId);
        return { assetId: input.assetId, deleted: true };
      }
      return { assetId: input.assetId, updated: true };
    },
  }),
  defineOperation({
    id: "activity.record",
    title: "记录学习活动",
    description: "记录学习时段、错题、复习或模考；模考题组证据与主观考后感受使用不同证据类型。",
    schema: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("study"),
        day: date,
        title: z.string().min(1),
        durationMinutes: z.number().int().min(0).optional(),
        subjectCode: z.string().optional(),
        knowledgePointId: z.string().optional(),
        output: z.string().optional(),
      }),
      z.object({
        kind: z.literal("mistake"),
        day: date,
        title: z.string().min(1),
        cause: z.string().optional(),
        causeCategory: z.string().optional(),
        subjectCode: z.string().optional(),
        knowledgePointId: z.string().optional(),
      }),
      z.object({
        kind: z.literal("review"),
        day: date,
        knowledgePointId: z.string().optional(),
        score: z.number().int().min(0).max(3),
        note: z.string().optional(),
        operationId: z.string().optional(),
        attemptMode: z.enum(["typed", "paper", "oral"]).optional(),
        attemptText: z.string().max(1000).optional(),
        attemptDurationSeconds: z.number().int().min(0).max(86400).optional(),
        preConfidence: z.number().int().min(0).max(3).optional(),
      }),
      z.object({
        kind: z.literal("mockExam"),
        day: date,
        name: z.string().min(1),
        subjectCode: z.string().optional(),
        score: z.number().min(0),
        maxScore: z.number().positive(),
        durationMinutes: z.number().int().min(0).optional(),
        scopeLabel: z.string().max(80).optional(),
        difficulty: z.enum(["foundation", "standard", "challenge"]).optional(),
        notes: z.string().optional(),
        breakdown: z
          .array(z.object({
            label: z.string().min(1).max(40),
            score: z.number().min(0),
            maxScore: z.number().positive(),
            evidenceType: z.enum(["group", "self_assessment"]).optional(),
            knowledgePointId: z.string().max(120).nullable().optional(),
            questionType: z.string().max(60).optional(),
            durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
            causeCategory: z.string().max(60).optional(),
            guessedCorrect: z.boolean().nullable().optional(),
          }))
          .optional(),
        diagnosisComplete: z.boolean().optional(),
        evidenceComplete: z.boolean().optional(),
      }),
    ]),
    readOnly: false,
    entityType: "learning_activity",
    run: ({ db, context }, input) => {
      if (input.kind === "study") {
        createStudySession(db, context, input);
        return { recorded: true, kind: input.kind };
      }
      if (input.kind === "mistake") return { kind: input.kind, ...createMistake(db, context, input) };
      if (input.kind === "review") return { kind: input.kind, ...createReviewEvent(db, context, input) };
      return { kind: input.kind, ...createMockExam(db, context, input) };
    },
  }),
  defineOperation({
    id: "algorithm.dashboard",
    title: "读取算法训练",
    description: "读取算法题、有效尝试、到期复测与证据状态；扩展未启用时拒绝。",
    schema: z.object({ date: date.optional() }),
    readOnly: true,
    run: ({ db, context }, input) => getAlgorithmDashboard(
      db,
      context,
      input.date || todayKey(),
    ),
  }),
  defineOperation({
    id: "algorithm.problem.create",
    title: "收录外部算法题",
    description: "保存用户提供的 HTTP(S) 题目链接和元数据；不抓取题面、账号或提交历史。",
    schema: z.object({
      sourceUrl: z.string().url().max(2_000),
      title: z.string().min(1).max(160),
      externalProblemId: z.string().max(120).optional(),
      difficultyBand: z.enum(["foundation", "standard", "challenge"]).optional(),
      tags: z.array(z.string().max(40)).max(12).optional(),
      notes: z.string().max(2_000).optional(),
    }),
    readOnly: false,
    entityType: "algorithm_problem",
    run: ({ db, context }, input) => createAlgorithmProblem(db, context, input),
  }),
  defineOperation({
    id: "algorithm.attempt.record",
    title: "记录外部算法结果",
    description: "记录用户主动报告的外部平台结果；不会标记为 provider 验证。",
    schema: z.object({
      problemId: z.number().int().positive(),
      day: date,
      verdict: z.enum(["AC", "WA", "CE", "TLE", "MLE", "RE", "OTHER"]),
      durationMinutes: z.number().int().min(0).max(1_440).optional(),
      maxHintLevel: z.number().int().min(0).max(4).optional(),
      preConfidence: z.number().int().min(0).max(3).nullable().optional(),
      reviewKind: z.enum(["initial", "original_retest", "isomorphic_variant", "unseen_variant"]).optional(),
      transferSourceProblemId: z.number().int().positive().nullable().optional(),
      errorCategory: z.string().max(80).optional(),
      reflection: z.string().max(2_000).optional(),
    }),
    readOnly: false,
    entityType: "algorithm_attempt",
    run: ({ db, context }, input) => recordAlgorithmAttempt(db, context, input),
  }),
  defineOperation({
    id: "algorithm.hint.reveal",
    title: "揭示算法提示",
    description: "按 L1-L4 顺序揭示一个提示并写入权威提示证据；高阶提示会影响独立完成判定。",
    schema: z.object({
      problemId: z.number().int().positive(),
      sessionId: z.string().regex(/^[A-Za-z0-9:_-]{8,160}$/),
      level: z.number().int().min(1).max(4),
    }),
    readOnly: false,
    entityType: "algorithm_hint",
    run: ({ db, context }, input) => revealAlgorithmHint(db, context, input),
  }),
  defineOperation({
    id: "algorithm.learning.get",
    title: "读取算法复盘",
    description: "读取一次正式训练的结构化复盘和聚合错误案例，不返回源码。",
    schema: z.object({ attemptId: z.number().int().positive() }),
    readOnly: true,
    run: ({ db, context }, input) => getAlgorithmLearningState(db, context, input.attemptId),
  }),
  defineOperation({
    id: "algorithm.reflection.save",
    title: "保存算法复盘",
    description: "保存错误类别、纠正规则、时空复杂度与迁移要点，不读取或记录源码。",
    schema: z.object({
      attemptId: z.number().int().positive(),
      errorCategory: z.string().max(80).optional(),
      correctionRule: z.string().max(2_000).optional(),
      complexityTime: z.string().max(120).optional(),
      complexitySpace: z.string().max(120).optional(),
      takeaway: z.string().max(2_000).optional(),
    }),
    readOnly: false,
    entityType: "algorithm_reflection",
    run: ({ db, context }, input) => saveAlgorithmReflection(db, context, input),
  }),
  defineOperation({
    id: "algorithm.error-case.resolve",
    title: "处理算法错误案例",
    description: "把同一会话聚合后的候选错误案例确认进入错题本，或明确忽略；确认前必须已有纠正规则。",
    schema: z.object({
      attemptId: z.number().int().positive(),
      decision: z.enum(["confirm", "dismiss"]),
    }),
    readOnly: false,
    entityType: "algorithm_error_case",
    run: ({ db, context }, input) => resolveAlgorithmErrorCase(db, context, input),
  }),
  defineOperation({
    id: "mistake.list",
    title: "查询错题本",
    description: "按指定日期划分到期、待处理和已毕业错题。",
    schema: z.object({ date: date.optional() }),
    readOnly: true,
    run: ({ db, context }, input) => getMistakeBook(db, context, input.date || todayKey()),
  }),
  defineOperation({
    id: "mock-exam.list",
    title: "查询模考",
    description: "读取模考记录、平均分、最好成绩、变化与薄弱项。",
    schema: z.object({}),
    readOnly: true,
    run: ({ db, context }) => getMockExamDashboard(db, context),
  }),
];

export function getAgentOperation(id: string): AgentOperation {
  const operation = agentOperations.find((item) => item.id === id);
  if (!operation) throw new Error(`未知操作：${id}`);
  return operation;
}

export async function executeAgentOperation(
  runtime: AgentRuntime,
  operation: AgentOperation,
  rawInput: unknown,
): Promise<unknown> {
  const input = operation.schema.parse(rawInput ?? {});
  if (operation.readOnly) return operation.run(runtime, input);

  if (operation.asyncWrite) {
    const result = await operation.run(runtime, input);
    writeAuditLog(runtime.db, {
      actorUserId: runtime.context.userId,
      targetUserId: runtime.context.userId,
      action: `agent.${operation.id}`,
      entityType: operation.entityType || "agent_operation",
      entityId: resultEntityId(result, input),
    });
    return result;
  }

  return runtime.db.transaction(() => {
    const result = operation.run(runtime, input);
    if (result instanceof Promise) throw new Error(`操作 ${operation.id} 被错误标记为同步写操作`);
    writeAuditLog(runtime.db, {
      actorUserId: runtime.context.userId,
      targetUserId: runtime.context.userId,
      action: `agent.${operation.id}`,
      entityType: operation.entityType || "agent_operation",
      entityId: resultEntityId(result, input),
    });
    return result;
  })();
}

export function operationManifest(operations: AgentOperation[] = agentOperations): Array<
  Pick<AgentOperation, "id" | "title" | "description" | "readOnly" | "destructive">
> {
  return operations.map(({ id, title, description, readOnly, destructive }) => ({
    id,
    title,
    description,
    readOnly,
    destructive: Boolean(destructive),
  }));
}
