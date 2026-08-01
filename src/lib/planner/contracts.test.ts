import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { plannerAcceptanceFixtures } from "./acceptance-fixtures";
import { buildLocalWebPushPrototype, probePlannerFts5 } from "./prototypes";
import {
  calendarEventDraftSchema,
  plannerReminderDraftSchema,
  plannerTaskDraftSchema,
} from "./validation";

describe("Planner v2 contracts", () => {
  it("separates task due values from scheduled values", () => {
    const task = plannerTaskDraftSchema.parse({
      title: "完成矩阵复习",
      listId: "inbox",
      dueAt: "2026-08-01T10:00:00.000Z",
      dueTimezone: "Asia/Shanghai",
      scheduledStartAt: "2026-07-31T01:00:00.000Z",
      scheduledEndAt: "2026-07-31T02:00:00.000Z",
      scheduledTimezone: "Asia/Shanghai",
    });
    expect(task.dueAt).toBe("2026-08-01T10:00:00.000Z");
    expect(task.scheduledStartAt).toBe("2026-07-31T01:00:00.000Z");
    expect(plannerTaskDraftSchema.safeParse({
      title: "冲突到期语义",
      listId: "inbox",
      dueDate: "2026-08-01",
      dueAt: "2026-08-01T10:00:00.000Z",
      dueTimezone: "Asia/Shanghai",
    }).success).toBe(false);
  });

  it("validates timed and all-day event shapes independently", () => {
    expect(calendarEventDraftSchema.parse({
      allDay: true,
      calendarId: "personal",
      title: "考试",
      startDate: "2026-08-01",
      endDateExclusive: "2026-08-02",
    })).toMatchObject({ allDay: true, endDateExclusive: "2026-08-02" });
    expect(calendarEventDraftSchema.safeParse({
      allDay: false,
      calendarId: "personal",
      title: "倒序事件",
      startAt: "2026-08-01T02:00:00.000Z",
      endAt: "2026-08-01T01:00:00.000Z",
      timezone: "Asia/Shanghai",
    }).success).toBe(false);
  });

  it("validates exact and relative reminder anchors", () => {
    expect(plannerReminderDraftSchema.parse({
      entityType: "task",
      entityId: "task-1",
      anchor: "scheduled_start",
      offsetMinutes: -15,
      channel: "in_app",
    }).offsetMinutes).toBe(-15);
    expect(plannerReminderDraftSchema.safeParse({
      entityType: "event",
      entityId: "event-1",
      anchor: "exact",
      channel: "web_push",
    }).success).toBe(false);
  });

  it("freezes twenty representative acceptance fixtures with unique ids", () => {
    expect(plannerAcceptanceFixtures).toHaveLength(20);
    expect(new Set(plannerAcceptanceFixtures.map((fixture) => fixture.id)).size).toBe(20);
    expect(new Set(plannerAcceptanceFixtures.map((fixture) => fixture.phase))).toEqual(new Set([2, 3, 4, 5, 6]));
  });
});

describe("Phase 0 technical prototypes", () => {
  it("probes SQLite FTS5 and records the Chinese short-token boundary", () => {
    const db = new Database(":memory:");
    expect(probePlannerFts5(db)).toEqual({
      enabled: true,
      asciiMatch: true,
      chinesePhraseMatch: true,
      chineseShortTokenMatch: false,
    });
  });

  it("builds an encrypted Web Push request locally with VAPID", () => {
    const request = buildLocalWebPushPrototype();
    expect(request.endpoint).toBe("https://push.example.test/subscriptions/planner-phase-0");
    expect(request.headers).toHaveProperty("Authorization");
    expect(request.headers).toHaveProperty("Content-Encoding", "aes128gcm");
    expect(request.bodyBytes).toBeGreaterThan(0);
    expect(request.vapidPublicKey.length).toBeGreaterThan(80);
  });
});
