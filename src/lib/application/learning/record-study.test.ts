import { describe, expect, it } from "vitest";
import { completeTask, createTask } from "../tasks/commands";
import { upsertLearningTaskLink } from "../../repo/learning-evidence";
import {
  createTestDb,
  createTestWorkspace,
  seedSubjectWithChapter,
} from "../../repo/testing";
import { recordStudy } from "./record-study";

describe("recordStudy", () => {
  it("records manual capture once, derives subject ownership, and updates knowledge state", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    seedSubjectWithChapter(db, scope);
    const input = {
      idempotencyKey: "manual-study-1",
      day: "2026-08-10",
      title: "矩阵乘法推导",
      knowledgePointId: "kp1",
      activityType: "study" as const,
      actualMinutes: 50,
      output: "完成一页推导",
      outcome: "recorded",
      sourceType: "manual_capture",
      sourceId: "manual-study-1",
    };

    const first = recordStudy(db, scope, input);
    const replay = recordStudy(db, scope, input);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({ subjectCode: "M1", knowledgePointId: "kp1" });
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM learning_evidence WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({ count: 1 });
    expect(db.prepare(`
      SELECT subject_code, knowledge_point_id, duration_minutes, output, source_type, source_id
      FROM study_sessions WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({
      subject_code: "M1",
      knowledge_point_id: "kp1",
      duration_minutes: 50,
      output: "完成一页推导",
      source_type: "learning_evidence",
      source_id: first.evidence.id,
    });
    expect(db.prepare(`
      SELECT status, next_review FROM knowledge_points WHERE workspace_id = ? AND id = 'kp1'
    `).get(scope.workspaceId)).toEqual({ status: "学习中", next_review: "2026-08-11" });
  });

  it("fails atomically when a supplied subject conflicts with the knowledge point", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    seedSubjectWithChapter(db, scope);
    db.prepare(`
      INSERT INTO subjects (workspace_id, code, name, description, track)
      VALUES (?, 'M2', '概率论', '', 'written')
    `).run(scope.workspaceId);

    expect(() => recordStudy(db, scope, {
      idempotencyKey: "manual-study-invalid",
      day: "2026-08-10",
      title: "错误关联",
      subjectCode: "M2",
      knowledgePointId: "kp1",
    })).toThrow("学习记录学科与知识点不一致");
    expect(db.prepare("SELECT COUNT(*) AS count FROM learning_evidence WHERE workspace_id = ?")
      .get(scope.workspaceId)).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM study_sessions WHERE workspace_id = ?")
      .get(scope.workspaceId)).toEqual({ count: 0 });
  });

  it("routes learning task completion through the same evidence and projection rules", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    seedSubjectWithChapter(db, scope);
    const task = createTask(db, scope, {
      clientMutationId: "learning-task-create",
      title: "完成矩阵专项",
      subjectCode: "M1",
      dueDate: "2026-08-10",
    });
    upsertLearningTaskLink(db, scope, {
      taskId: task.id,
      expectedVersion: 0,
      knowledgePointId: "kp1",
      activityType: "practice",
      sourceType: "weak_point",
      sourceId: "kp1-intervention",
    });

    completeTask(db, scope, {
      id: task.id,
      expectedVersion: task.version,
      clientMutationId: "learning-task-complete",
      day: "2026-08-10",
      evidence: { actualMinutes: 35, output: "独立完成 20 题" },
    });

    expect(db.prepare(`
      SELECT task_id, knowledge_point_id, activity_type, actual_minutes, output,
             source_type, source_id
      FROM learning_evidence WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({
      task_id: task.id,
      knowledge_point_id: "kp1",
      activity_type: "practice",
      actual_minutes: 35,
      output: "独立完成 20 题",
      source_type: "weak_point",
      source_id: "kp1-intervention",
    });
    expect(db.prepare(`
      SELECT title, knowledge_point_id, duration_minutes, output
      FROM study_sessions WHERE workspace_id = ?
    `).get(scope.workspaceId)).toEqual({
      title: "完成矩阵专项",
      knowledge_point_id: "kp1",
      duration_minutes: 35,
      output: "独立完成 20 题",
    });
  });

  it("does not manufacture a legacy study session for a generic quick-complete", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const task = createTask(db, scope, {
      clientMutationId: "generic-task-create",
      title: "整理桌面",
      dueDate: "2026-08-10",
    });

    completeTask(db, scope, {
      id: task.id,
      expectedVersion: task.version,
      clientMutationId: "generic-task-complete",
      day: "2026-08-10",
    });

    expect(db.prepare("SELECT COUNT(*) AS count FROM learning_evidence WHERE workspace_id = ?")
      .get(scope.workspaceId)).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM study_sessions WHERE workspace_id = ?")
      .get(scope.workspaceId)).toEqual({ count: 0 });
  });
});
