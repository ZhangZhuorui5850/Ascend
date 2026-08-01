import { describe, expect, it } from "vitest";
import { createTestDb, createTestWorkspace } from "./testing";
import {
  createTaskList,
  ensurePlannerDefaults,
  listTaskLists,
} from "./planner-lists";
import {
  batchUpdatePlannerTasks,
  createPlannerTask,
  getPlannerTask,
  listTaskView,
  listPlannerTasks,
  restorePlannerTask,
  softDeletePlannerTask,
  updatePlannerTask,
} from "./planner-tasks";
import {
  createPlannerCalendar,
  listPlannerCalendars,
} from "./planner-calendars";
import {
  createCalendarEvent,
  listCalendarEventRange,
  softDeleteCalendarEvent,
  updateCalendarEvent,
} from "./planner-events";
import { saveExamCountdowns } from "./settings";

describe("Planner v2 repository isolation and concurrency", () => {
  it("creates default containers and keeps lists and calendars workspace-scoped", () => {
    const db = createTestDb();
    const a = createTestWorkspace(db, { email: "planner-a@example.com" });
    const b = createTestWorkspace(db, { email: "planner-b@example.com" });
    ensurePlannerDefaults(db, a);
    ensurePlannerDefaults(db, b);
    createTaskList(db, a, { name: "A 项目", colorToken: "cinnabar", icon: "ListTodo" });
    createTaskList(db, b, { name: "B 项目", colorToken: "pine", icon: "ListTodo" });
    createPlannerCalendar(db, a, { name: "A 课程", colorToken: "summit-blue" });
    createPlannerCalendar(db, b, { name: "B 课程", colorToken: "pine" });

    expect(listTaskLists(db, a).map((list) => list.name)).toEqual(["Inbox", "A 项目"]);
    expect(listTaskLists(db, b).map((list) => list.name)).toEqual(["Inbox", "B 项目"]);
    expect(listPlannerCalendars(db, a).map((calendar) => calendar.name)).toEqual([
      "个人日历",
      "学习里程碑",
      "A 课程",
    ]);
  });

  it("keeps due and scheduled fields independent and makes creates idempotent", () => {
    const db = createTestDb();
    const a = createTestWorkspace(db);
    const b = createTestWorkspace(db);
    ensurePlannerDefaults(db, a);
    ensurePlannerDefaults(db, b);
    const inbox = listTaskLists(db, a)[0];
    const first = createPlannerTask(db, a, {
      clientMutationId: "capture-1",
      listId: inbox.id,
      title: "完成矩阵复习",
      dueAt: "2026-08-01T10:00:00.000Z",
      dueTimezone: "Asia/Shanghai",
      scheduledStartAt: "2026-07-31T01:00:00.000Z",
      scheduledEndAt: "2026-07-31T02:00:00.000Z",
      scheduledTimezone: "Asia/Shanghai",
      estimatedMinutes: 60,
    });
    const replay = createPlannerTask(db, a, {
      clientMutationId: "capture-1",
      listId: inbox.id,
      title: "被重试覆盖的标题",
    });
    expect(replay).toEqual(first);
    expect(listPlannerTasks(db, a)).toHaveLength(1);
    expect(listPlannerTasks(db, b)).toHaveLength(0);

    const updated = updatePlannerTask(db, a, {
      id: first.id,
      expectedVersion: first.version,
      scheduledStartAt: "2026-07-31T03:00:00.000Z",
      scheduledEndAt: "2026-07-31T04:00:00.000Z",
      scheduledTimezone: "Asia/Shanghai",
    });
    expect(updated.entity).toMatchObject({
      due_at: "2026-08-01T10:00:00.000Z",
      scheduled_start_at: "2026-07-31T03:00:00.000Z",
      version: 2,
    });
    const conflict = updatePlannerTask(db, a, {
      id: first.id,
      expectedVersion: 1,
      title: "过期写入",
    });
    expect(conflict.conflict).toMatchObject({ expectedVersion: 1, actualVersion: 2 });
    expect(getPlannerTask(db, b, first.id)).toBeNull();
  });

  it("stores timed and all-day events and filters visible ranges", () => {
    const db = createTestDb();
    const a = createTestWorkspace(db);
    const b = createTestWorkspace(db);
    ensurePlannerDefaults(db, a);
    ensurePlannerDefaults(db, b);
    const aCalendar = listPlannerCalendars(db, a)[0];
    const bCalendar = listPlannerCalendars(db, b)[0];
    const timed = createCalendarEvent(db, a, {
      clientMutationId: "event-1",
      calendarId: aCalendar.id,
      title: "A 定时事件",
      allDay: false,
      startAt: "2026-07-31T01:00:00.000Z",
      endAt: "2026-07-31T02:00:00.000Z",
      timezone: "Asia/Shanghai",
    });
    createCalendarEvent(db, a, {
      clientMutationId: "event-2",
      calendarId: aCalendar.id,
      title: "A 多日事件",
      allDay: true,
      startDate: "2026-07-30",
      endDateExclusive: "2026-08-02",
    });
    createCalendarEvent(db, a, {
      clientMutationId: "event-cross-midnight",
      calendarId: aCalendar.id,
      title: "A 跨午夜事件",
      allDay: false,
      startAt: "2026-07-30T23:30:00.000Z",
      endAt: "2026-07-31T00:30:00.000Z",
      timezone: "UTC",
    });
    createCalendarEvent(db, b, {
      clientMutationId: "event-1",
      calendarId: bCalendar.id,
      title: "B 的事件",
      allDay: true,
      startDate: "2026-07-31",
      endDateExclusive: "2026-08-01",
    });

    expect(listCalendarEventRange(db, a, {
      start: "2026-07-31T00:00:00.000Z",
      end: "2026-08-01T00:00:00.000Z",
      startDate: "2026-07-31",
      endDateExclusive: "2026-08-01",
    }).map((event) => event.title)).toEqual(["A 多日事件", "A 跨午夜事件", "A 定时事件"]);
    expect(updateCalendarEvent(db, a, {
      id: timed.id,
      expectedVersion: timed.version,
      location: "图书馆",
    }).entity).toMatchObject({ location: "图书馆", version: 2 });
    const deleted = softDeleteCalendarEvent(db, a, {
      id: timed.id,
      expectedVersion: 2,
      clientMutationId: "delete-event-1",
    });
    expect(deleted.entity?.deleted_at).toBeTruthy();
    expect(softDeleteCalendarEvent(db, a, {
      id: timed.id,
      expectedVersion: 2,
      clientMutationId: "delete-event-1",
    }).entity?.id).toBe(timed.id);
    expect(listCalendarEventRange(db, b, {
      start: "2026-07-31T00:00:00.000Z",
      end: "2026-08-01T00:00:00.000Z",
      startDate: "2026-07-31",
      endDateExclusive: "2026-08-01",
    }).map((event) => event.title)).toEqual(["B 的事件"]);
  });

  it("projects legacy exam countdowns into stable all-day milestone events", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    ensurePlannerDefaults(db, scope);
    saveExamCountdowns(db, scope, [
      { name: "期末考试", date: "2026-12-20", targetScore: 120 },
    ]);
    const range = {
      start: "2026-12-01T00:00:00.000Z",
      end: "2027-01-01T00:00:00.000Z",
      startDate: "2026-12-01",
      endDateExclusive: "2027-01-01",
    };
    const first = listCalendarEventRange(db, scope, range);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      title: "期末考试",
      kind: "exam",
      all_day: 1,
      start_date: "2026-12-20",
      end_date_exclusive: "2026-12-21",
    });
    ensurePlannerDefaults(db, scope);
    expect(listCalendarEventRange(db, scope, range)).toHaveLength(1);
    saveExamCountdowns(db, scope, []);
    expect(listCalendarEventRange(db, scope, range)).toHaveLength(0);
  });

  it("expands recurring events across DST and removes canceled occurrence keys", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    ensurePlannerDefaults(db, scope);
    const calendar = listPlannerCalendars(db, scope)[0];
    const master = createCalendarEvent(db, scope, {
      clientMutationId: "recurring-event",
      calendarId: calendar.id,
      title: "纽约周会",
      allDay: false,
      startAt: "2026-03-01T14:00:00.000Z",
      endAt: "2026-03-01T15:00:00.000Z",
      timezone: "America/New_York",
      recurrenceRule: "FREQ=WEEKLY;COUNT=3",
    });
    db.prepare(`
      INSERT INTO calendar_events
        (id, workspace_id, calendar_id, title, kind, busy_status,
         start_at, end_at, timezone, all_day, recurring_event_id,
         original_start_at, exception_kind)
      VALUES (?, ?, ?, '取消实例', 'meeting', 'busy',
              '2026-03-15T13:00:00.000Z', '2026-03-15T14:00:00.000Z',
              'America/New_York', 0, ?, '2026-03-15T13:00:00.000Z', 'cancel')
    `).run("cancel-instance", scope.workspaceId, calendar.id, master.id);
    const events = listCalendarEventRange(db, scope, {
      start: "2026-03-07T00:00:00.000Z",
      end: "2026-03-17T00:00:00.000Z",
      startDate: "2026-03-07",
      endDateExclusive: "2026-03-17",
    });
    expect(events.map((event) => event.start_at)).toEqual(["2026-03-08T13:00:00.000Z"]);
    expect(events[0]).toMatchObject({
      recurring_event_id: master.id,
      original_start_at: "2026-03-08T13:00:00.000Z",
    });
  });

  it("classifies smart views and supports soft delete, restore, subtasks, and batch completion", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    ensurePlannerDefaults(db, scope);
    const inbox = listTaskLists(db, scope)[0];
    const dueToday = createPlannerTask(db, scope, {
      clientMutationId: "today-due",
      listId: inbox.id,
      title: "今天到期",
      dueDate: "2026-07-31",
    });
    const scheduledToday = createPlannerTask(db, scope, {
      clientMutationId: "today-scheduled",
      listId: inbox.id,
      title: "今天排期",
      scheduledStartAt: "2026-07-31T01:00:00.000Z",
      scheduledEndAt: "2026-07-31T02:00:00.000Z",
      scheduledTimezone: "Asia/Shanghai",
    });
    const anytime = createPlannerTask(db, scope, {
      clientMutationId: "anytime",
      listId: inbox.id,
      title: "随时可做",
    });
    const overdue = createPlannerTask(db, scope, {
      clientMutationId: "overdue",
      listId: inbox.id,
      title: "已经逾期",
      dueDate: "2026-07-30",
    });
    const child = createPlannerTask(db, scope, {
      clientMutationId: "child",
      listId: inbox.id,
      parentTaskId: dueToday.id,
      title: "子任务",
    });
    expect(child.depth).toBe(1);

    const viewInput = { today: "2026-07-31", now: "2026-07-31T04:00:00.000Z" };
    expect(listTaskView(db, scope, { view: "today", ...viewInput }).map((task) => task.title))
      .toEqual(expect.arrayContaining(["今天到期", "今天排期"]));
    expect(listTaskView(db, scope, { view: "anytime", ...viewInput }).map((task) => task.title))
      .toEqual(expect.arrayContaining(["随时可做", "子任务"]));
    expect(listTaskView(db, scope, { view: "overdue", ...viewInput }).map((task) => task.title))
      .toEqual(["已经逾期"]);

    const batch = batchUpdatePlannerTasks(db, scope, {
      clientMutationId: "batch-complete-1",
      tasks: [dueToday, scheduledToday].map((task) => ({ id: task.id, expectedVersion: task.version })),
      patch: { status: "completed" },
    });
    expect(batch.entities).toHaveLength(2);
    expect(listTaskView(db, scope, { view: "completed", ...viewInput })).toHaveLength(2);

    const deleted = softDeletePlannerTask(db, scope, {
      id: anytime.id,
      expectedVersion: anytime.version,
      clientMutationId: "delete-anytime",
    });
    expect(deleted.entity?.deleted_at).toBeTruthy();
    expect(listTaskView(db, scope, { view: "trash", ...viewInput }).map((task) => task.id)).toContain(anytime.id);
    const restored = restorePlannerTask(db, scope, {
      id: anytime.id,
      expectedVersion: deleted.entity!.version,
      clientMutationId: "restore-anytime",
    });
    expect(restored.entity?.deleted_at).toBeNull();
    expect(listTaskView(db, scope, { view: "anytime", ...viewInput }).map((task) => task.id)).toContain(anytime.id);
    expect(getPlannerTask(db, scope, overdue.id)?.due_date).toBe("2026-07-30");
  });
});
