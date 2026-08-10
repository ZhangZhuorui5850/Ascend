import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../../access-context";
import type { JudgeGatewayResult, JudgeStatus } from "../../judge-gateway";
import {
  applyGatewaySubmissionResult,
  getAlgorithmAttemptStudyContext,
  isTerminalAlgorithmSubmissionStatus,
  type AlgorithmSubmission,
} from "../../repo/algorithm-submissions";
import { recordStudy } from "./record-study";

/**
 * Canonical application boundary for a formal judge result. The provider result,
 * algorithm attempt/review state, immutable learning evidence, and compatibility
 * study projection either commit together or roll back together.
 */
export function finalizeAlgorithmSubmission(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    submissionId: number;
    result: JudgeGatewayResult;
    retentionDays: number;
  },
): AlgorithmSubmission {
  return db.transaction(() => {
    const submission = applyGatewaySubmissionResult(
      db,
      scope,
      input.submissionId,
      input.result,
      input.retentionDays,
    );
    if (
      submission.submissionKind !== "formal"
      || !isTerminalAlgorithmSubmissionStatus(submission.status)
    ) {
      return submission;
    }

    const attempt = getAlgorithmAttemptStudyContext(db, scope, submission.attemptId);
    const attemptSourceId = `attempt:${attempt.attemptId}`;
    recordStudy(db, scope, {
      idempotencyKey: `plugin:algorithms:${attemptSourceId}:formal-evaluation`,
      day: attempt.day,
      title: `算法训练：${attempt.title}`,
      activityType: "practice",
      actualMinutes: attempt.activeSeconds > 0
        ? Math.ceil(attempt.activeSeconds / 60)
        : null,
      output: `${submission.status} · 正式评测`,
      outcome: submission.status,
      verificationMethod: "judge_gateway",
      verificationResult: submission.status,
      verificationOutcome: verificationOutcome(submission.status),
      sourceType: "plugin:algorithms",
      sourceId: attemptSourceId,
    });
    return submission;
  })();
}

function verificationOutcome(status: JudgeStatus): "passed" | "failed" | "unverified" {
  if (status === "AC") return "passed";
  if (status === "JE" || status === "CANCELLED") return "unverified";
  return "failed";
}
