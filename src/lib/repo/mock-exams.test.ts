import { describe, expect, it } from "vitest";
import { createMockExam, getMockExamDashboard } from "./mock-exams";
import { createTestDb, seedSubjectWithChapter } from "./testing";
import { LEGACY_WORKSPACE_ID } from "./workspaces";

const scope = { workspaceId: LEGACY_WORKSPACE_ID };

describe("mock exams repo", () => {
  it("calculates score trend and ranks weak areas", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    createMockExam(db, scope, { day: "2026-07-01", name: "第一次", subjectCode: "M1", score: 60, maxScore: 100, breakdown: [{ label: "概念", score: 40, maxScore: 100 }] });
    createMockExam(db, scope, { day: "2026-07-08", name: "第二次", subjectCode: "M1", score: 75, maxScore: 100, breakdown: [{ label: "概念", score: 60, maxScore: 100 }, { label: "时间", score: 80, maxScore: 100 }] });

    const dashboard = getMockExamDashboard(db, scope);
    expect(dashboard.averagePercent).toBe(67.5);
    expect(dashboard.bestPercent).toBe(75);
    expect(dashboard.changePercent).toBe(15);
    expect(dashboard.weakAreas[0]).toMatchObject({ label: "概念", percent: 50, attempts: 2 });
  });

  it("validates the score range", () => {
    const db = createTestDb();
    expect(() => createMockExam(db, scope, { day: "2026-07-01", name: "越界", score: 101, maxScore: 100 })).toThrow("得分需在 0 到满分之间");
  });
});
