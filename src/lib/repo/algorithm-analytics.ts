import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey } from "../dates";
import { requirePluginEnabled } from "./plugins";

export type AlgorithmAnalytics = {
  firstAttempt: { successes: number; samples: number };
  delayed7To20: { successes: number; samples: number };
  delayed21Plus: { successes: number; samples: number };
  transfer: { successes: number; samples: number };
  recurrence: { lapses: number; samples: number };
  calibration: { brierScore: number | null; samples: number };
  activeTime: { medianSeconds: number | null; samples: number };
  gateway: {
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
    failures: number;
    samples: number;
  };
  providerVerifiedAttempts: number;
};

type AttemptRow = {
  id: number;
  problem_id: number;
  day: string;
  verdict: string;
  independent: number;
  review_kind: string;
  pre_confidence: number | null;
  active_seconds: number;
  source_verification: string;
  transfer_source_problem_id: number | null;
};

export function getAlgorithmAnalytics(db: Database.Database, scope: WorkspaceScope, today: string): AlgorithmAnalytics {
  requirePluginEnabled(db, scope, "algorithms");
  assertDateKey(today);
  const attempts = db
    .prepare(
      `
    SELECT id, problem_id, day, verdict, independent, review_kind,
           pre_confidence, active_seconds, source_verification,
           transfer_source_problem_id
    FROM algorithm_attempts
    WHERE workspace_id = ?
      AND outcome NOT IN ('in_progress', 'JE', 'CANCELLED')
      AND day <= ?
    ORDER BY day ASC, id ASC
  `,
    )
    .all(scope.workspaceId, today) as AttemptRow[];
  const byProblem = new Map<number, AttemptRow[]>();
  for (const attempt of attempts) {
    const list = byProblem.get(attempt.problem_id) ?? [];
    list.push(attempt);
    byProblem.set(attempt.problem_id, list);
  }
  const firstAttempts = [...byProblem.values()].flatMap((rows) => (rows[0] ? [rows[0]] : []));
  const firstSuccesses = firstAttempts.filter(isIndependentAccepted).length;
  const independentProblems = [...byProblem.values()].filter((rows) => rows.some(isIndependentAccepted));
  const lapses = independentProblems.filter((rows) => {
    const firstSuccessIndex = rows.findIndex(isIndependentAccepted);
    return rows.slice(firstSuccessIndex + 1).at(-1)?.verdict !== "AC" && rows.slice(firstSuccessIndex + 1).length > 0;
  }).length;
  const transferAttempts = attempts.filter(
    (attempt) => attempt.review_kind === "unseen_variant" && attempt.transfer_source_problem_id !== null,
  );
  const completedReviews = db
    .prepare(
      `
    SELECT
      CAST(julianday(completed.day) - julianday(source.day) AS INTEGER) AS interval_days,
      completed.verdict,
      completed.independent
    FROM algorithm_reviews review
    JOIN algorithm_attempts source
      ON source.workspace_id = review.workspace_id AND source.id = review.source_attempt_id
    JOIN algorithm_attempts completed
      ON completed.workspace_id = review.workspace_id AND completed.id = review.attempt_id
    WHERE review.workspace_id = ? AND review.completed_at IS NOT NULL
      AND completed.day <= ?
  `,
    )
    .all(scope.workspaceId, today) as Array<{
    interval_days: number;
    verdict: string;
    independent: number;
  }>;
  const delayed7To20 = completedReviews.filter((row) => row.interval_days >= 7 && row.interval_days <= 20);
  const delayed21Plus = completedReviews.filter((row) => row.interval_days >= 21);
  const calibrated = attempts.filter((attempt) => attempt.pre_confidence !== null);
  const brierScore = calibrated.length
    ? calibrated.reduce((sum, attempt) => {
        const probability = Math.max(0, Math.min(1, (attempt.pre_confidence || 0) / 3));
        const outcome = attempt.verdict === "AC" ? 1 : 0;
        return sum + (probability - outcome) ** 2;
      }, 0) / calibrated.length
    : null;
  const activeSeconds = attempts
    .map((attempt) => attempt.active_seconds)
    .filter((seconds) => seconds > 0)
    .sort((left, right) => left - right);
  const gatewayRows = db
    .prepare(
      `
    SELECT submission.gateway_latency_ms, submission.status
    FROM algorithm_submissions submission
    JOIN algorithm_attempts attempt
      ON attempt.workspace_id = submission.workspace_id
      AND attempt.id = submission.attempt_id
    WHERE submission.workspace_id = ?
      AND submission.submission_kind = 'formal'
      AND attempt.day <= ?
    ORDER BY submission.id ASC
  `,
    )
    .all(scope.workspaceId, today) as Array<{
    gateway_latency_ms: number | null;
    status: string;
  }>;
  const gatewayLatencies = gatewayRows
    .flatMap((row) => (row.gateway_latency_ms === null ? [] : [row.gateway_latency_ms]))
    .sort((left, right) => left - right);
  return {
    firstAttempt: { successes: firstSuccesses, samples: firstAttempts.length },
    delayed7To20: summarizeAccepted(delayed7To20),
    delayed21Plus: summarizeAccepted(delayed21Plus),
    transfer: {
      successes: transferAttempts.filter(isIndependentAccepted).length,
      samples: transferAttempts.length,
    },
    recurrence: { lapses, samples: independentProblems.length },
    calibration: { brierScore, samples: calibrated.length },
    activeTime: {
      medianSeconds: percentile(activeSeconds, 0.5),
      samples: activeSeconds.length,
    },
    gateway: {
      p50LatencyMs: percentile(gatewayLatencies, 0.5),
      p95LatencyMs: percentile(gatewayLatencies, 0.95),
      failures: gatewayRows.filter(
        (row) => row.status === "JE" || row.status === "CANCELLED" || row.status === "RETRYABLE_ERROR",
      ).length,
      samples: gatewayRows.length,
    },
    providerVerifiedAttempts: attempts.filter((attempt) => attempt.source_verification === "provider_verified").length,
  };
}

function isIndependentAccepted(row: { verdict: string; independent: number }): boolean {
  return row.verdict === "AC" && Boolean(row.independent);
}

function summarizeAccepted(rows: Array<{ verdict: string; independent: number }>): {
  successes: number;
  samples: number;
} {
  return {
    successes: rows.filter(isIndependentAccepted).length,
    samples: rows.length,
  };
}

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
  return values[index];
}
