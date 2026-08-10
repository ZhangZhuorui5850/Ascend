import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../../access-context";
import {
  getAlgorithmProblem,
  recordAlgorithmAttempt,
  type AlgorithmAttempt,
  type RecordAlgorithmAttemptInput,
} from "../../repo/algorithms";
import { recordStudy } from "../learning/record-study";

export type RecordAlgorithmAttemptCommand = Omit<RecordAlgorithmAttemptInput, "operationId"> & {
  operationId: string;
};

/**
 * Canonical manual-attempt write boundary shared by Web and Agent callers.
 * The algorithm attempt and its learning evidence/projection commit together.
 */
export function recordAlgorithmAttemptCommand(
  db: Database.Database,
  scope: WorkspaceScope,
  input: RecordAlgorithmAttemptCommand,
): AlgorithmAttempt {
  return db.transaction(() => {
    const operationId = normalizeOperationId(input.operationId);
    const attempt = recordAlgorithmAttempt(db, scope, { ...input, operationId });
    const problem = getAlgorithmProblem(db, scope, attempt.problemId);
    const output = `${attempt.verdict} · 最高提示 L${attempt.maxHintLevel} · ${attempt.reviewKind}`;

    recordStudy(db, scope, {
      idempotencyKey: `algorithm-attempt:${operationId}`,
      day: attempt.day,
      title: `算法训练：${problem.title}`,
      activityType: "practice",
      actualMinutes: attempt.durationMinutes || null,
      output,
      outcome: attempt.verdict,
      verificationMethod: "external_user_report",
      verificationResult: attempt.verdict,
      verificationOutcome: attempt.verdict === "AC" ? "passed" : "failed",
      sourceType: "plugin:algorithms",
      sourceId: attempt.id,
      projectLegacySession: attempt.durationMinutes > 0,
    });

    return attempt;
  })();
}

function normalizeOperationId(value: string): string {
  const operationId = value.trim();
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(operationId)) throw new Error("算法训练幂等键无效");
  return operationId;
}
