import { describe, expect, it } from "vitest";
import { createMockExam, getMockExamDashboard } from "./mock-exams";
import { createTestDb, seedSubjectWithChapter } from "./testing";
import { LEGACY_WORKSPACE_ID } from "./workspaces";

const scope = { workspaceId: LEGACY_WORKSPACE_ID };

describe("mock exams repo", () => {
  it("calculates score trend and ranks weak areas", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    createMockExam(db, scope, { day: "2026-07-01", name: "第一次", subjectCode: "M1", scopeLabel: "矩阵", difficulty: "standard", score: 60, maxScore: 100, breakdown: [{ label: "概念", score: 40, maxScore: 100, evidenceType: "group" }] });
    createMockExam(db, scope, { day: "2026-07-08", name: "第二次", subjectCode: "M1", scopeLabel: "矩阵", difficulty: "standard", score: 75, maxScore: 100, breakdown: [{ label: "概念", score: 60, maxScore: 100, evidenceType: "group" }, { label: "时间", score: 80, maxScore: 100, evidenceType: "group" }] });

    const dashboard = getMockExamDashboard(db, scope);
    expect(dashboard.averagePercent).toBe(67.5);
    expect(dashboard.bestPercent).toBe(75);
    expect(dashboard.changePercent).toBe(15);
    expect(dashboard.weakAreas[0]).toMatchObject({ label: "概念", percent: 50, attempts: 2 });
    expect(dashboard.comparison).toMatchObject({ sampleCount: 2, comparable: true });
  });

  it("validates the score range", () => {
    const db = createTestDb();
    expect(() => createMockExam(db, scope, { day: "2026-07-01", name: "越界", score: 101, maxScore: 100 })).toThrow("得分需在 0 到满分之间");
  });

  it("stores a score-only entry as quick and does not invent weak dimensions", () => {
    const db = createTestDb();
    createMockExam(db, scope, {
      day: "2026-07-01",
      name: "快速记录",
      score: 72,
      maxScore: 100,
    });

    const dashboard = getMockExamDashboard(db, scope);
    expect(dashboard.exams[0]).toMatchObject({ diagnosis_status: "quick", breakdown: [] });
    expect(dashboard.weakAreas).toEqual([]);
  });

  it("preserves subjective feelings but never treats them as weak-area evidence", () => {
    const db = createTestDb();
    createMockExam(db, scope, {
      day: "2026-07-01",
      name: "部分诊断",
      score: 60,
      maxScore: 100,
      breakdown: [{ label: "概念掌握", score: 0, maxScore: 100 }],
    });

    const dashboard = getMockExamDashboard(db, scope);
    expect(dashboard.exams[0].diagnosis_status).toBe("partial");
    expect(dashboard.exams[0].breakdown[0]).toMatchObject({
      label: "概念掌握",
      score: 0,
      evidenceType: "self_assessment",
    });
    expect(dashboard.weakAreas).toEqual([]);
  });

  it("includes an explicit zero from a real evidence group and preserves its metadata", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    createMockExam(db, scope, {
      day: "2026-07-01",
      name: "题组诊断",
      subjectCode: "M1",
      score: 60,
      maxScore: 100,
      breakdown: [{
        label: "矩阵计算",
        score: 0,
        maxScore: 20,
        evidenceType: "group",
        knowledgePointId: "kp1",
        questionType: "计算题",
        durationMinutes: 18,
        causeCategory: "计算失误",
        guessedCorrect: false,
      }],
    });

    const dashboard = getMockExamDashboard(db, scope);
    expect(dashboard.exams[0].diagnosis_status).toBe("evidence_partial");
    expect(dashboard.weakAreas).toEqual([
      expect.objectContaining({
        key: "point:kp1",
        label: "矩阵乘法",
        percent: 0,
        attempts: 1,
        evidenceGroups: 1,
        knowledgePointId: "kp1",
        questionTypes: ["计算题"],
        causeCategories: ["计算失误"],
      }),
    ]);
  });

  it("requires all canonical dimensions before confirming a complete diagnosis", () => {
    const db = createTestDb();
    expect(() => createMockExam(db, scope, {
      day: "2026-07-01",
      name: "不完整",
      score: 60,
      maxScore: 100,
      breakdown: [
        { label: "概念掌握", score: 60, maxScore: 100 },
        { label: "计算准确", score: 70, maxScore: 100 },
      ],
      diagnosisComplete: true,
    })).toThrow("完整诊断需要评估三个能力维度");

    expect(() => createMockExam(db, scope, {
      day: "2026-07-01",
      name: "重复维度",
      score: 60,
      maxScore: 100,
      breakdown: [
        { label: "概念掌握", score: 60, maxScore: 100 },
        { label: "计算准确", score: 70, maxScore: 100 },
        { label: "时间控制", score: 80, maxScore: 100 },
        { label: "概念掌握", score: 90, maxScore: 100 },
      ],
      diagnosisComplete: true,
    })).toThrow("完整诊断需要评估三个能力维度");

    createMockExam(db, scope, {
      day: "2026-07-01",
      name: "完整",
      score: 60,
      maxScore: 100,
      breakdown: [
        { label: "概念掌握", score: 60, maxScore: 100 },
        { label: "计算准确", score: 70, maxScore: 100 },
        { label: "时间控制", score: 80, maxScore: 100 },
      ],
      diagnosisComplete: true,
    });
    expect(getMockExamDashboard(db, scope).exams[0].diagnosis_status).toBe("complete");
  });

  it("preserves ambiguous legacy zeroes but excludes them from weak-area inference", () => {
    const db = createTestDb();
    db.prepare(`
      INSERT INTO mock_exams
        (workspace_id, day, name, score, max_score, breakdown_json)
      VALUES (?, '2026-07-01', '旧版记录', 50, 100, ?)
    `).run(scope.workspaceId, JSON.stringify([
      { label: "概念掌握", score: 0, maxScore: 100 },
      { label: "计算准确", score: 70, maxScore: 100 },
    ]));

    const dashboard = getMockExamDashboard(db, scope);
    expect(dashboard.exams[0].diagnosis_status).toBe("legacy");
    expect(dashboard.exams[0].breakdown).toEqual([
      expect.objectContaining({ label: "概念掌握", score: 0, maxScore: 100, evidenceType: "self_assessment" }),
      expect.objectContaining({ label: "计算准确", score: 70, maxScore: 100, evidenceType: "self_assessment" }),
    ]);
    expect(dashboard.weakAreas).toEqual([]);
  });

  it("never mixes scores across different ranges or difficulties", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    createMockExam(db, scope, {
      day: "2026-07-01",
      name: "基础卷",
      subjectCode: "M1",
      scopeLabel: "矩阵",
      difficulty: "foundation",
      score: 90,
      maxScore: 100,
      breakdown: [{ label: "概念掌握", score: 90, maxScore: 100, evidenceType: "group" }],
    });
    createMockExam(db, scope, {
      day: "2026-07-08",
      name: "挑战卷",
      subjectCode: "M1",
      scopeLabel: "矩阵",
      difficulty: "challenge",
      score: 55,
      maxScore: 100,
      breakdown: [{ label: "概念掌握", score: 50, maxScore: 100, evidenceType: "group" }],
    });

    const dashboard = getMockExamDashboard(db, scope);
    expect(dashboard.averagePercent).toBe(55);
    expect(dashboard.bestPercent).toBe(55);
    expect(dashboard.changePercent).toBeNull();
    expect(dashboard.comparison).toMatchObject({
      difficulty: "challenge",
      sampleCount: 1,
      comparable: true,
    });
  });

  it("requires complete evidence groups to reconcile to the exam total", () => {
    const db = createTestDb();
    expect(() => createMockExam(db, scope, {
      day: "2026-07-01",
      name: "合计不一致",
      score: 60,
      maxScore: 100,
      breakdown: [{ label: "选择题", score: 30, maxScore: 50, evidenceType: "group" }],
      evidenceComplete: true,
    })).toThrow("得分与满分合计需和模考总成绩一致");

    createMockExam(db, scope, {
      day: "2026-07-01",
      name: "完整题组",
      score: 60,
      maxScore: 100,
      breakdown: [
        { label: "选择题", score: 30, maxScore: 50, evidenceType: "group" },
        { label: "计算题", score: 30, maxScore: 50, evidenceType: "group" },
      ],
      evidenceComplete: true,
    });
    expect(getMockExamDashboard(db, scope).exams[0].diagnosis_status).toBe("evidence_complete");
  });

  it("rejects cross-workspace or cross-subject knowledge-point links", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    expect(() => createMockExam(db, scope, {
      day: "2026-07-01",
      name: "不存在的知识点",
      subjectCode: "M1",
      score: 10,
      maxScore: 20,
      breakdown: [{ label: "题组", score: 10, maxScore: 20, evidenceType: "group", knowledgePointId: "missing" }],
    })).toThrow("知识点不存在");

    db.prepare(`
      INSERT INTO subjects (workspace_id, code, name, description)
      VALUES (?, 'M2', '概率论', '')
    `).run(scope.workspaceId);
    db.prepare(`
      INSERT INTO knowledge_points
        (workspace_id, id, subject_code, subject_name, submodule, tier, tier_name, title, exam, status, mastery, reviews)
      VALUES (?, 'kp2', 'M2', '概率论', '', 'g', '了解', '随机变量', 0, '未学', 0, 0)
    `).run(scope.workspaceId);
    expect(() => createMockExam(db, scope, {
      day: "2026-07-01",
      name: "科目错配",
      subjectCode: "M1",
      score: 10,
      maxScore: 20,
      breakdown: [{ label: "题组", score: 10, maxScore: 20, evidenceType: "group", knowledgePointId: "kp2" }],
    })).toThrow("知识点与模考科目不一致");
  });
});
