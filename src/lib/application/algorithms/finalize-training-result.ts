import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../../access-context";
import { assertDateKey } from "../../dates";
import { completeTask, rescheduleTask } from "../tasks/commands";
import { assertAlgorithmTask } from "../../repo/algorithm-training";
import { getPlannerTask } from "../../repo/planner-tasks";
import { recordAlgorithmAttemptCommand } from "./record-attempt";
import type { AlgorithmAttempt } from "../../repo/algorithms";

export type FinalizeAlgorithmTrainingResultInput = {
  operationId: string;
  problemId: number;
  attemptDay: string;
  verdict: string;
  durationMinutes?: number;
  maxHintLevel?: number;
  preConfidence?: number | null;
  reviewKind?: string;
  transferSourceProblemId?: number | null;
  errorCategory?: string;
  reflection?: string;
  reviewChoice?: "schedule" | "stop" | "unchanged";
  plan?: {
    taskId: string;
    expectedVersion: number;
    disposition: "complete" | "keep" | "reschedule";
    targetDay?: string;
  };
};

/** Canonical Web/VS Code result boundary: evidence, review and Planner state commit together. */
export function finalizeAlgorithmTrainingResult(
  db: Database.Database,
  scope: WorkspaceScope,
  input: FinalizeAlgorithmTrainingResultInput,
): AlgorithmAttempt {
  return db.transaction(() => {
    const attemptDay = assertDateKey(input.attemptDay);
    const existingOperation = Boolean(db.prepare(`
      SELECT 1 FROM algorithm_attempts
      WHERE workspace_id = ? AND session_id = ? AND outcome != 'in_progress'
    `).get(scope.workspaceId, input.operationId.trim()));
    if (input.plan) {
      const linkedProblemId = assertAlgorithmTask(db, scope, input.plan.taskId);
      if (linkedProblemId !== input.problemId) throw new Error("题目与训练计划不一致");
    }

    const attempt = recordAlgorithmAttemptCommand(db, scope, {
      operationId: input.operationId,
      problemId: input.problemId,
      day: attemptDay,
      verdict: input.verdict,
      durationMinutes: input.durationMinutes,
      maxHintLevel: input.maxHintLevel,
      preConfidence: input.preConfidence,
      reviewKind: input.reviewKind,
      transferSourceProblemId: input.transferSourceProblemId,
      errorCategory: input.errorCategory,
      reflection: input.reflection,
    });

    if (input.reviewChoice === "stop") {
      db.prepare(`
        UPDATE algorithm_problems
        SET review_enabled = 0, next_review = NULL, material_status = 'done', updated_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ? AND id = ?
      `).run(scope.workspaceId, input.problemId);
    } else if (input.reviewChoice === "schedule") {
      db.prepare(`
        UPDATE algorithm_problems
        SET review_enabled = 1, material_status = CASE WHEN ? = 'AC' THEN 'done' ELSE material_status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ? AND id = ?
      `).run(attempt.verdict, scope.workspaceId, input.problemId);
    }

    if (input.plan?.disposition === "complete") {
      const task = getPlannerTask(db, scope, input.plan.taskId);
      if (existingOperation && task?.status === "completed") return attempt;
      const result = completeTask(db, scope, {
        id: input.plan.taskId,
        expectedVersion: input.plan.expectedVersion,
        clientMutationId: `${input.operationId}:planner`,
        day: attemptDay,
        evidence: {
          activityType: "practice",
          outcome: "completed",
          verificationMethod: "algorithm_attempt",
          verificationResult: attempt.verdict,
          verificationOutcome: attempt.verdict === "AC" ? "passed" : "failed",
          sourceType: "plugin:algorithms",
          sourceId: String(input.problemId),
        },
      });
      if (result.conflict) throw new Error("计划已经更新，请刷新后重试");
    } else if (input.plan?.disposition === "reschedule") {
      const targetDay = assertDateKey(input.plan.targetDay || "");
      const task = getPlannerTask(db, scope, input.plan.taskId);
      if (existingOperation && task?.due_date === targetDay) return attempt;
      const result = rescheduleTask(db, scope, {
        id: input.plan.taskId,
        expectedVersion: input.plan.expectedVersion,
        schedule: { kind: "none" },
        dueDate: targetDay,
      });
      if (result.conflict) throw new Error("计划已经更新，请刷新后重试");
    }

    return attempt;
  })();
}
