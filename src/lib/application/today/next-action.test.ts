import { describe, expect, it } from "vitest";
import { selectNextAction, type NextActionCandidate } from "./next-action";

const context = {
  day: "2026-08-10",
  now: "2026-08-10T11:45:00.000Z",
  availableMinutes: 30,
};

describe("selectNextAction", () => {
  it("prefers an imminent scheduled task over a merely due review", () => {
    const action = selectNextAction([
      review({ id: "review-1", dueDay: "2026-08-10" }),
      task({
        id: "task-1",
        scheduledStartAt: "2026-08-10T12:00:00.000Z",
        scheduledEndAt: "2026-08-10T12:25:00.000Z",
      }),
    ], context);

    expect(action).toMatchObject({ kind: "task", id: "task-1" });
    expect(action?.reasons).toContain("已排期，15 分钟后开始");
  });

  it("lets a deeply overdue review outrank an unscheduled low-priority task", () => {
    const action = selectNextAction([
      task({ id: "task-low", priority: 3, estimatedMinutes: 45 }),
      review({ id: "review-old", dueDay: "2026-07-27" }),
    ], context);

    expect(action).toMatchObject({ kind: "review", id: "review-old" });
    expect(action?.reasons[0]).toBe("复习已逾期 14 天");
  });

  it("uses temporal order, priority, then stable identity as deterministic tie-breakers", () => {
    const candidates = [
      task({ id: "b", dueDay: "2026-08-11", priority: 2 }),
      task({ id: "a", dueDay: "2026-08-11", priority: 2 }),
    ];

    expect(selectNextAction(candidates, context)?.id).toBe("a");
    expect(selectNextAction([...candidates].reverse(), context)?.id).toBe("a");
  });

  it("uses subject-matched exam proximity without changing unrelated candidates", () => {
    const action = selectNextAction([
      task({ id: "general", subjectCode: null }),
      task({ id: "exam", subjectCode: "M1" }),
    ], {
      ...context,
      exams: [{ day: "2026-08-12", subjectCode: "M1" }],
    });

    expect(action).toMatchObject({ id: "exam" });
    expect(action?.reasons).toContain("关联科目距考试 2 天");
  });

  it("returns null for an empty candidate set", () => {
    expect(selectNextAction([], context)).toBeNull();
  });
});

function task(overrides: Partial<Extract<NextActionCandidate, { kind: "task" }>> = {}) {
  return {
    kind: "task" as const,
    id: "task",
    title: "写完一节练习",
    version: 1,
    priority: 3 as const,
    estimatedMinutes: 25,
    subjectCode: null,
    dueDay: null,
    scheduledStartAt: null,
    scheduledEndAt: null,
    href: "/tasks",
    ...overrides,
  };
}

function review(overrides: Partial<Extract<NextActionCandidate, { kind: "review" }>> = {}) {
  return {
    kind: "review" as const,
    id: "review",
    title: "矩阵乘法",
    subjectCode: "M1",
    dueDay: "2026-08-10",
    estimatedMinutes: 5,
    href: "/review",
    ...overrides,
  };
}
