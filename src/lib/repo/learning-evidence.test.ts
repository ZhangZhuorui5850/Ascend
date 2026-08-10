import { describe, expect, it } from "vitest";
import { ensurePlannerDefaults, listTaskLists } from "./planner-lists";
import { createPlannerTask } from "./planner-tasks";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "./testing";
import {
  appendLearningEvidence,
  getLearningTaskLink,
  listLearningEvidence,
  upsertLearningTaskLink,
  voidLearningEvidence,
} from "./learning-evidence";

function setup() {
  const db = createTestDb();
  const scope = createTestWorkspace(db, { email: "learning-evidence@example.com" });
  const other = createTestWorkspace(db, { email: "learning-evidence-other@example.com" });
  ensurePlannerDefaults(db, scope);
  ensurePlannerDefaults(db, other);
  seedSubjectWithChapter(db, scope);
  const task = createPlannerTask(db, scope, {
    clientMutationId: "learning-task",
    listId: listTaskLists(db, scope)[0].id,
    title: "矩阵乘法训练",
  });
  const otherTask = createPlannerTask(db, other, {
    clientMutationId: "other-learning-task",
    listId: listTaskLists(db, other)[0].id,
    title: "另一个空间的训练",
  });
  return { db, scope, other, task, otherTask };
}

describe("learning task links", () => {
  it("upserts versioned learning metadata for Planner string IDs", () => {
    const { db, scope, task } = setup();
    const created = upsertLearningTaskLink(db, scope, {
      taskId: task.id,
      knowledgePointId: "kp1",
      activityType: "practice",
      completionCriteria: "独立完成 20 题并订正",
      plannedVerificationMethod: "闭卷小测",
      sourceType: "legacy_day_task",
      sourceId: 42,
      expectedVersion: 0,
    });
    expect(created).toMatchObject({
      taskId: task.id,
      knowledgePointId: "kp1",
      activityType: "practice",
      sourceType: "legacy_day_task",
      sourceId: "42",
      version: 1,
    });
    expect(typeof created.taskId).toBe("string");

    const updated = upsertLearningTaskLink(db, scope, {
      taskId: task.id,
      completionCriteria: "独立完成 30 题并订正",
      expectedVersion: 1,
    });
    expect(updated).toMatchObject({
      knowledgePointId: "kp1",
      activityType: "practice",
      completionCriteria: "独立完成 30 题并订正",
      sourceId: "42",
      version: 2,
    });
    expect(() => upsertLearningTaskLink(db, scope, {
      taskId: task.id,
      activityType: "review",
      expectedVersion: 1,
    })).toThrow("版本冲突");
  });

  it("validates task and knowledge ownership in both repo and database guards", () => {
    const { db, scope, other, task, otherTask } = setup();
    expect(getLearningTaskLink(db, other, task.id)).toBeNull();
    expect(() => upsertLearningTaskLink(db, other, {
      taskId: task.id,
      activityType: "study",
    })).toThrow("任务不存在");
    expect(() => upsertLearningTaskLink(db, other, {
      taskId: otherTask.id,
      knowledgePointId: "kp1",
      activityType: "study",
    })).toThrow("知识点不存在");

    expect(() => db.prepare(`
      INSERT INTO learning_task_links
        (workspace_id, task_id, activity_type)
      VALUES (?, ?, 'study')
    `).run(other.workspaceId, task.id)).toThrow("task workspace mismatch");

    expect(upsertLearningTaskLink(db, scope, {
      taskId: task.id,
      knowledgePointId: "kp1",
      activityType: "study",
    })).toMatchObject({ taskId: task.id, knowledgePointId: "kp1" });
  });
});

describe("learning evidence", () => {
  it("appends task and manual evidence and replays identical operation keys", () => {
    const { db, scope, other, task } = setup();
    upsertLearningTaskLink(db, scope, {
      taskId: task.id,
      knowledgePointId: "kp1",
      activityType: "practice",
      sourceType: "legacy_day_task",
      sourceId: "42",
    });
    const input = {
      idempotencyKey: "complete:task:cycle:1",
      taskId: task.id,
      completionCycle: 1,
      day: "2026-08-10",
      actualMinutes: 45,
      output: "完成 20 题并订正 2 题",
      outcome: "completed",
      difficulty: "challenging",
      verificationMethod: "闭卷小测",
      verificationResult: "8/10",
      verificationOutcome: "passed",
      confidence: 75,
    } as const;
    const first = appendLearningEvidence(db, scope, input);
    const replay = appendLearningEvidence(db, scope, input);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      taskId: task.id,
      knowledgePointId: "kp1",
      activityType: "practice",
      sourceType: "legacy_day_task",
      actualMinutes: 45,
      confidence: 75,
      correctedBy: null,
      voidedAt: null,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM learning_evidence").get()).toEqual({ count: 1 });
    expect(() => appendLearningEvidence(db, scope, { ...input, output: "不同请求" })).toThrow("幂等键");

    const manual = appendLearningEvidence(db, scope, {
      idempotencyKey: "manual:study:1",
      completionCycle: 1,
      day: "2026-08-09",
      knowledgePointId: "kp1",
      activityType: "study",
      actualMinutes: 25,
      output: "阅读矩阵章节",
    });
    expect(manual.taskId).toBeNull();
    expect(listLearningEvidence(db, scope).map((item) => item.id)).toEqual([first.id, manual.id]);
    expect(listLearningEvidence(db, other)).toEqual([]);
    expect(() => appendLearningEvidence(db, other, {
      ...input,
      idempotencyKey: "cross-workspace",
    })).toThrow("任务不存在");
  });

  it("voids without changing evidence content and excludes voided rows by default", () => {
    const { db, scope, other, task } = setup();
    const evidence = appendLearningEvidence(db, scope, {
      idempotencyKey: "voidable-evidence",
      taskId: task.id,
      completionCycle: 1,
      day: "2026-08-10",
      output: "原始且不可覆盖的正文",
    });
    const voided = voidLearningEvidence(db, scope, {
      id: evidence.id,
      reason: "误记到错误日期",
    });
    expect(voided).toMatchObject({
      id: evidence.id,
      output: "原始且不可覆盖的正文",
      voidReason: "误记到错误日期",
    });
    expect(voided.voidedAt).toBeTruthy();
    expect(listLearningEvidence(db, scope)).toEqual([]);
    expect(listLearningEvidence(db, scope, { includeVoided: true })).toHaveLength(1);
    expect(voidLearningEvidence(db, scope, {
      id: evidence.id,
      reason: "重放不覆盖首次原因",
    })).toEqual(voided);
    expect(() => voidLearningEvidence(db, other, {
      id: evidence.id,
      reason: "越权作废",
    })).toThrow("学习证据不存在");
  });

  it("records correction direction as old.correctedBy = new.id and protects the chain", () => {
    const { db, scope, other, task } = setup();
    const original = appendLearningEvidence(db, scope, {
      idempotencyKey: "evidence:original",
      taskId: task.id,
      completionCycle: 1,
      day: "2026-08-10",
      output: "误写为 10 题",
    });
    const correctionInput = {
      idempotencyKey: "evidence:correction:1",
      taskId: task.id,
      completionCycle: 1,
      day: "2026-08-10",
      output: "实际完成 12 题",
      correctsEvidenceId: original.id,
    } as const;
    const correction = appendLearningEvidence(db, scope, correctionInput);
    const rows = listLearningEvidence(db, scope, { includeVoided: true });
    expect(rows.find((item) => item.id === original.id)?.correctedBy).toBe(correction.id);
    expect(rows.find((item) => item.id === correction.id)?.correctedBy).toBeNull();
    expect(appendLearningEvidence(db, scope, correctionInput)).toEqual(correction);
    expect(() => appendLearningEvidence(db, scope, {
      ...correctionInput,
      idempotencyKey: "evidence:correction:duplicate",
    })).toThrow("已被其他记录纠正");
    expect(() => appendLearningEvidence(db, other, {
      ...correctionInput,
      idempotencyKey: "evidence:correction:cross-workspace",
      taskId: null,
    })).toThrow("学习证据不存在");

    const secondCorrection = appendLearningEvidence(db, scope, {
      idempotencyKey: "evidence:correction:2",
      taskId: task.id,
      completionCycle: 1,
      day: "2026-08-10",
      output: "最终核对为 13 题",
      correctsEvidenceId: correction.id,
    });
    expect(listLearningEvidence(db, scope, { includeVoided: true })
      .find((item) => item.id === correction.id)?.correctedBy).toBe(secondCorrection.id);
    expect(() => db.prepare(`
      UPDATE learning_evidence SET corrected_by = id WHERE id = ?
    `).run(secondCorrection.id)).toThrow(/CHECK constraint/);
  });

  it("rejects invalid evidence bounds and incomplete source identities", () => {
    const { db, scope } = setup();
    const base = {
      idempotencyKey: "invalid-evidence",
      completionCycle: 1,
      day: "2026-08-10",
    };
    expect(() => appendLearningEvidence(db, scope, { ...base, actualMinutes: 0 })).toThrow("实际时长");
    expect(() => appendLearningEvidence(db, scope, { ...base, confidence: 101 })).toThrow("学习信心");
    expect(() => appendLearningEvidence(db, scope, { ...base, sourceType: "capture" })).toThrow("同时提供");
    expect(() => appendLearningEvidence(db, scope, { ...base, day: "2026-2-30" })).toThrow();
  });
});
