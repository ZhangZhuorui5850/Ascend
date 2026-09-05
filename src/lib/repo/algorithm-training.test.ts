import { describe, expect, it } from "vitest";
import { getAlgorithmDashboard, createAlgorithmProblem } from "./algorithms";
import {
  completeAlgorithmPlan,
  continueAlgorithmPlanTomorrow,
  getAlgorithmTrainingRelations,
  rescheduleAlgorithmPlans,
  scheduleAlgorithmProblems,
  setAlgorithmCourseMemberships,
} from "./algorithm-training";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

describe("simplified algorithm training", () => {
  it("plans multiple problems, stores course membership and advances review cadence", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const first = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/2742/",
      title: "统计字符数",
    });
    const second = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/2754/",
      title: "八皇后",
    });

    scheduleAlgorithmProblems(db, scope, { problemIds: [first.id, second.id], day: "2026-08-27" });
    scheduleAlgorithmProblems(db, scope, { problemIds: [first.id], day: "2026-08-27" });
    setAlgorithmCourseMemberships(db, scope, {
      problemIds: [first.id, second.id],
      courseName: "郭炜算法基础",
      stageKey: "W1",
    });
    const relations = getAlgorithmTrainingRelations(db, scope);
    expect(relations.plans).toHaveLength(2);
    expect(relations.courses).toEqual([
      expect.objectContaining({ name: "郭炜算法基础", problemCount: 2 }),
    ]);

    const firstPlan = relations.plans.find((plan) => plan.problemId === first.id)!;
    completeAlgorithmPlan(db, scope, {
      taskId: firstPlan.taskId,
      expectedVersion: firstPlan.version,
      problemId: first.id,
      day: "2026-08-27",
      review: true,
    });
    const completed = getAlgorithmTrainingRelations(db, scope).plans.find((plan) => plan.taskId === firstPlan.taskId);
    expect(completed?.status).toBe("completed");
    expect(getAlgorithmDashboard(db, scope, "2026-08-27").problems.find((problem) => problem.id === first.id)).toMatchObject({
      reviewEnabled: true,
      reviewStep: 1,
      nextReview: "2026-08-30",
    });
    scheduleAlgorithmProblems(db, scope, { problemIds: [first.id], day: "2026-08-29" });
    const replanned = getAlgorithmTrainingRelations(db, scope).plans.filter((plan) => plan.problemId === first.id);
    expect(replanned).toHaveLength(2);
    expect(replanned.map((plan) => [plan.day, plan.status])).toEqual([
      ["2026-08-27", "completed"],
      ["2026-08-29", "open"],
    ]);
  });

  it("moves an unfinished plan to the next day", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const problem = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/2767/",
      title: "简单密码",
    });
    const plan = scheduleAlgorithmProblems(db, scope, { problemIds: [problem.id], day: "2026-08-27" })[0];
    continueAlgorithmPlanTomorrow(db, scope, {
      taskId: plan.taskId,
      expectedVersion: plan.version,
      day: plan.day,
    });
    expect(getAlgorithmTrainingRelations(db, scope).plans[0].day).toBe("2026-08-28");
  });

  it("moves overdue plans atomically and rolls the whole batch back on a version conflict", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const first = createAlgorithmProblem(db, scope, { sourceUrl: "https://example.com/a", title: "A" });
    const second = createAlgorithmProblem(db, scope, { sourceUrl: "https://example.com/b", title: "B" });
    const plans = scheduleAlgorithmProblems(db, scope, { problemIds: [first.id, second.id], day: "2026-08-20" });

    expect(() => rescheduleAlgorithmPlans(db, scope, {
      plans: [
        { taskId: plans[0].taskId, expectedVersion: plans[0].version },
        { taskId: plans[1].taskId, expectedVersion: plans[1].version + 1 },
      ],
      targetDay: "2026-08-28",
    })).toThrow("计划已经更新");
    expect(getAlgorithmTrainingRelations(db, scope).plans.map((plan) => plan.day)).toEqual(["2026-08-20", "2026-08-20"]);

    rescheduleAlgorithmPlans(db, scope, {
      plans: plans.map((plan) => ({ taskId: plan.taskId, expectedVersion: plan.version })),
      targetDay: "2026-08-28",
    });
    expect(getAlgorithmTrainingRelations(db, scope).plans.map((plan) => plan.day)).toEqual(["2026-08-28", "2026-08-28"]);
  });
});
