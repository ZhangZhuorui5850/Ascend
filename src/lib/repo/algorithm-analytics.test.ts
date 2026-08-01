import { describe, expect, it } from "vitest";
import { getAlgorithmAnalytics } from "./algorithm-analytics";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

describe("algorithm analytics", () => {
  it("uses problem and review evidence rather than raw submission counts", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const problem = db.prepare(`
      INSERT INTO algorithm_problems
        (workspace_id, provider_id, external_problem_id, source_url, title)
      VALUES (?, 'external', 'metric-1', 'https://example.test/metric-1', '指标题')
    `).run(scope.workspaceId);
    const problemId = Number(problem.lastInsertRowid);
    const first = insertAttempt(db, scope.workspaceId, {
      problemId,
      day: "2026-06-01",
      verdict: "AC",
      independent: 1,
      reviewKind: "initial",
      confidence: 3,
      activeSeconds: 120,
    });
    const retest = insertAttempt(db, scope.workspaceId, {
      problemId,
      day: "2026-06-11",
      verdict: "AC",
      independent: 1,
      reviewKind: "original_retest",
      confidence: 2,
      activeSeconds: 180,
    });
    db.prepare(`
      INSERT INTO algorithm_reviews
        (workspace_id, problem_id, source_attempt_id, review_kind, due_day,
         completed_at, attempt_id)
      VALUES (?, ?, ?, 'original_retest', '2026-06-11', CURRENT_TIMESTAMP, ?)
    `).run(scope.workspaceId, problemId, first, retest);
    db.prepare(`
      INSERT INTO algorithm_submissions
        (workspace_id, attempt_id, problem_id, operation_id, code_sha256,
         language, submission_kind, status, gateway_latency_ms)
      VALUES
        (?, ?, ?, 'metrics:operation:0001', 'hash', 'cpp17', 'formal', 'AC', 80),
        (?, ?, ?, 'metrics:operation:0002', 'hash', 'cpp17', 'formal', 'WA', 140)
    `).run(scope.workspaceId, first, problemId, scope.workspaceId, first, problemId);

    const metrics = getAlgorithmAnalytics(db, scope, "2026-07-26");
    expect(metrics.firstAttempt).toEqual({ successes: 1, samples: 1 });
    expect(metrics.delayed7To20).toEqual({ successes: 1, samples: 1 });
    expect(metrics.activeTime).toEqual({ medianSeconds: 120, samples: 2 });
    expect(metrics.gateway).toMatchObject({
      p50LatencyMs: 80,
      p95LatencyMs: 140,
      failures: 0,
      samples: 2,
    });
    expect(metrics.calibration.samples).toBe(2);
  });
});

function insertAttempt(
  db: ReturnType<typeof createTestDb>,
  workspaceId: string,
  input: {
    problemId: number;
    day: string;
    verdict: string;
    independent: number;
    reviewKind: string;
    confidence: number;
    activeSeconds: number;
  },
): number {
  const result = db.prepare(`
    INSERT INTO algorithm_attempts
      (workspace_id, problem_id, day, verdict, independent, review_kind,
       pre_confidence, source_verification, outcome, active_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'provider_verified', ?, ?)
  `).run(
    workspaceId,
    input.problemId,
    input.day,
    input.verdict,
    input.independent,
    input.reviewKind,
    input.confidence,
    input.verdict,
    input.activeSeconds,
  );
  return Number(result.lastInsertRowid);
}
