import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../../access-context";
import { shiftDateKey } from "../../dates";
import type { CalendarEvent, PlannerTask } from "../../planner/types";
import { localDateTimeToUtc, utcToZonedDateTime } from "../../planner/time";
import { listCalendarEventRange } from "../../repo/planner-events";
import { listPlannerTasks } from "../../repo/planner-tasks";
import { getSettings } from "../../repo/settings";
import {
  getTodayReviewSummary,
  getWorkspaceTimeZone,
  listDueKnowledgeReviews,
  listDueMistakeRetests,
  type TodayReviewSummary,
} from "../../repo/today";
import {
  selectNextAction,
  type NextActionCandidate,
  type RankedNextAction,
} from "./next-action";

export type TodayTaskItem = {
  kind: "task";
  id: string;
  version: number;
  title: string;
  subjectCode: string | null;
  priority: 1 | 2 | 3;
  estimatedMinutes: number;
  done: boolean;
  scheduled: boolean;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
};

export type TodayEventItem = {
  kind: "event";
  id: string;
  title: string;
  subjectCode: string | null;
  eventKind: CalendarEvent["kind"];
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
};

export type TodayTimelineItem = TodayTaskItem | TodayEventItem;

export type TodayReadModel = {
  day: string;
  timeZone: string;
  nextAction: RankedNextAction | null;
  scheduledItems: TodayTimelineItem[];
  unscheduledTasks: TodayTaskItem[];
  review: TodayReviewSummary;
};

export function getTodayReadModel(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { day: string; now: string; availableMinutes?: number },
): TodayReadModel {
  const timeZone = getWorkspaceTimeZone(db, scope);
  const tasks = listPlannerTasks(db, scope);
  const dueReviews = listDueKnowledgeReviews(db, scope, input.day);
  const dueMistakes = listDueMistakeRetests(db, scope, input.day);
  const settings = getSettings(db, scope);
  const candidates: NextActionCandidate[] = [
    ...tasks
      .filter((task) => task.status === "open")
      .map((task) => toTaskCandidate(task, input.day, timeZone)),
    ...dueReviews.map((review) => ({
      kind: "review" as const,
      id: review.id,
      title: review.title,
      subjectCode: review.subject_code,
      dueDay: review.next_review,
      estimatedMinutes: 5,
      href: `/review?point=${encodeURIComponent(review.id)}`,
    })),
    ...dueMistakes.map((mistake) => ({
      kind: "mistake_retest" as const,
      id: String(mistake.id),
      title: mistake.title,
      subjectCode: mistake.subject_code,
      dueDay: mistake.next_review,
      estimatedMinutes: 8,
      href: `/review?mistake=${mistake.id}`,
    })),
  ];
  const dayEnd = shiftDateKey(input.day, 1);
  const events = listCalendarEventRange(db, scope, {
    start: localDateTimeToUtc({ date: input.day, time: "00:00", timeZone }),
    end: localDateTimeToUtc({ date: dayEnd, time: "00:00", timeZone }),
    startDate: input.day,
    endDateExclusive: dayEnd,
  });
  const timeline = [
    ...tasks.flatMap((task) => toTodayTask(task, input.day, timeZone)),
    ...events.map((event) => toTodayEvent(event, timeZone)),
  ];
  const availableMinutes = input.availableMinutes ?? inferAvailableMinutes(
    input.now,
    localDateTimeToUtc({ date: dayEnd, time: "00:00", timeZone }),
    tasks,
    events,
  );
  return {
    day: input.day,
    timeZone,
    nextAction: selectNextAction(candidates, {
      ...input,
      availableMinutes,
      exams: settings.examCountdowns.map((exam) => ({
        day: exam.date,
        subjectCode: exam.subjectCode ?? null,
      })),
    }),
    scheduledItems: timeline.filter((item) => item.kind === "event" || item.scheduled)
      .sort(compareTimelineItems),
    unscheduledTasks: timeline
      .filter((item): item is TodayTaskItem => item.kind === "task" && !item.scheduled)
      .sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title) || left.id.localeCompare(right.id)),
    review: getTodayReviewSummary(db, scope, input.day),
  };
}

function toTaskCandidate(task: PlannerTask, day: string, workspaceTimeZone: string): NextActionCandidate {
  return {
    kind: "task",
    id: task.id,
    title: task.title,
    version: task.version,
    priority: task.priority,
    estimatedMinutes: task.estimated_minutes,
    subjectCode: task.subject_code,
    dueDay: taskDueDay(task, workspaceTimeZone),
    scheduledStartAt: task.scheduled_all_day ? null : task.scheduled_start_at,
    scheduledEndAt: task.scheduled_all_day ? null : task.scheduled_end_at,
    href: taskOccursOnDay(task, day, workspaceTimeZone) ? `/#today-task-${task.id}` : "/tasks",
  };
}

function toTodayTask(task: PlannerTask, day: string, workspaceTimeZone: string): TodayTaskItem[] {
  if (task.status === "canceled") return [];
  const scheduled = taskSchedule(task, workspaceTimeZone);
  const dueDay = taskDueDay(task, workspaceTimeZone);
  if (scheduled?.day !== day && dueDay !== day) return [];
  const occursBySchedule = scheduled?.day === day;
  return [{
    kind: "task",
    id: task.id,
    version: task.version,
    title: task.title,
    subjectCode: task.subject_code,
    priority: task.priority,
    estimatedMinutes: task.estimated_minutes,
    done: task.status === "completed",
    scheduled: occursBySchedule,
    allDay: occursBySchedule && task.scheduled_all_day === 1,
    startTime: occursBySchedule && task.scheduled_all_day === 0 ? scheduled.startTime : null,
    endTime: occursBySchedule && task.scheduled_all_day === 0 ? scheduled.endTime : null,
  }];
}

function toTodayEvent(event: CalendarEvent, workspaceTimeZone: string): TodayEventItem {
  const timeZone = event.timezone ?? workspaceTimeZone;
  const start = event.start_at ? utcToZonedDateTime(event.start_at, timeZone).time.slice(0, 5) : null;
  const end = event.end_at ? utcToZonedDateTime(event.end_at, timeZone).time.slice(0, 5) : null;
  return {
    kind: "event",
    id: event.id,
    title: event.title,
    subjectCode: event.subject_code,
    eventKind: event.kind,
    allDay: event.all_day === 1,
    startTime: start,
    endTime: end,
  };
}

function taskOccursOnDay(task: PlannerTask, day: string, workspaceTimeZone: string): boolean {
  return taskSchedule(task, workspaceTimeZone)?.day === day || taskDueDay(task, workspaceTimeZone) === day;
}

function taskSchedule(
  task: PlannerTask,
  workspaceTimeZone: string,
): { day: string; startTime: string | null; endTime: string | null } | null {
  if (!task.scheduled_start_at) return null;
  const timeZone = task.scheduled_timezone ?? workspaceTimeZone;
  const start = utcToZonedDateTime(task.scheduled_start_at, timeZone);
  const end = task.scheduled_end_at ? utcToZonedDateTime(task.scheduled_end_at, timeZone) : null;
  return {
    day: start.date,
    startTime: task.scheduled_all_day ? null : start.time.slice(0, 5),
    endTime: task.scheduled_all_day ? null : end?.time.slice(0, 5) ?? null,
  };
}

function taskDueDay(task: PlannerTask, workspaceTimeZone: string): string | null {
  if (task.due_date) return task.due_date;
  if (!task.due_at) return null;
  return utcToZonedDateTime(task.due_at, task.due_timezone ?? workspaceTimeZone).date;
}

function compareTimelineItems(left: TodayTimelineItem, right: TodayTimelineItem): number {
  if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
  return (left.startTime ?? "00:00").localeCompare(right.startTime ?? "00:00")
    || (left.kind === right.kind ? 0 : left.kind === "event" ? -1 : 1)
    || left.id.localeCompare(right.id);
}

function inferAvailableMinutes(
  now: string,
  dayEnd: string,
  tasks: PlannerTask[],
  events: CalendarEvent[],
): number | undefined {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return undefined;
  const futureStarts = [
    ...tasks.flatMap((task) => task.status === "open" && task.scheduled_start_at
      ? [Date.parse(task.scheduled_start_at)]
      : []),
    ...events.flatMap((event) => event.start_at ? [Date.parse(event.start_at)] : []),
    Date.parse(dayEnd),
  ].filter((value) => Number.isFinite(value) && value > nowMs);
  if (!futureStarts.length) return undefined;
  const minutes = Math.floor((Math.min(...futureStarts) - nowMs) / 60_000);
  return minutes >= 5 ? minutes : undefined;
}
