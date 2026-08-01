import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureManagedAlgorithmCatalog } from "./algorithm-catalog";
import { getJudgeRuntimeAvailability, refreshAlgorithmSubmission, submitAlgorithmCode } from "./judge-runtime";
import { setPluginEnabled } from "./repo/plugins";
import { createTestDb, createTestWorkspace } from "./repo/testing";

const originalEnv = {
  url: process.env.ASCEND_JUDGE_GATEWAY_URL,
  token: process.env.ASCEND_JUDGE_GATEWAY_TOKEN,
  key: process.env.ASCEND_JUDGE_CODE_KEY,
  retention: process.env.ASCEND_JUDGE_CODE_RETENTION_DAYS,
  nodeEnv: process.env.NODE_ENV,
  pilotRequired: process.env.ASCEND_JUDGE_PILOT_REQUIRED,
};

describe("judge runtime orchestration", () => {
  beforeEach(() => {
    process.env.ASCEND_JUDGE_GATEWAY_URL = "https://judge.example.test";
    process.env.ASCEND_JUDGE_GATEWAY_TOKEN = "judge-test-token";
    process.env.ASCEND_JUDGE_CODE_KEY = randomBytes(32).toString("base64");
    process.env.ASCEND_JUDGE_CODE_RETENTION_DAYS = "0";
    delete process.env.ASCEND_JUDGE_PILOT_REQUIRED;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restore("ASCEND_JUDGE_GATEWAY_URL", originalEnv.url);
    restore("ASCEND_JUDGE_GATEWAY_TOKEN", originalEnv.token);
    restore("ASCEND_JUDGE_CODE_KEY", originalEnv.key);
    restore("ASCEND_JUDGE_CODE_RETENTION_DAYS", originalEnv.retention);
    restore("ASCEND_JUDGE_PILOT_REQUIRED", originalEnv.pilotRequired);
  });

  it("reports unavailable state without partial credentials", () => {
    delete process.env.ASCEND_JUDGE_GATEWAY_URL;
    delete process.env.ASCEND_JUDGE_GATEWAY_TOKEN;
    expect(getJudgeRuntimeAvailability()).toMatchObject({
      configured: false,
      reason: "尚未配置独立 Judge Gateway",
    });
  });

  it("creates and polls a normalized asynchronous submission", async () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    ensureManagedAlgorithmCatalog(db, scope);
    const problem = db.prepare(`
      SELECT id FROM algorithm_problems
      WHERE workspace_id = ? AND judge_problem_ref = 'ascend:foundation:sum-two:v1'
    `).get(scope.workspaceId) as { id: number };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "submission:runtime:0001",
        status: "QUEUED",
      }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "submission:runtime:0001",
        status: "AC",
        timeMs: 4,
        memoryKb: 900,
        publicFeedback: [],
        judgedAt: "2026-07-26T11:00:00Z",
      }), { status: 200 }));
    vi.stubGlobal("fetch", request);

    const queued = await submitAlgorithmCode(db, scope, {
      operationId: "runtime:operation:0001",
      sessionId: "runtime:session:0001",
      problemId: problem.id,
      day: "2026-07-26",
      language: "python3",
      sourceCode: "a,b=map(int,input().split());print(a+b)",
      activeSeconds: 90,
      preConfidence: 2,
      planText: "读取两个整数后在常数时间内求和",
    });
    expect(queued).toMatchObject({
      gatewaySubmissionId: "submission:runtime:0001",
      status: "QUEUED",
    });
    const accepted = await refreshAlgorithmSubmission(db, scope, queued.id);
    expect(accepted).toMatchObject({ status: "AC", timeMs: 4, memoryKb: 900 });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("blocks the submit path before any encrypted submission or network call when pilot approval is required", async () => {
    process.env.ASCEND_JUDGE_PILOT_REQUIRED = "true";
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    ensureManagedAlgorithmCatalog(db, scope);
    const problem = db.prepare(`
      SELECT id FROM algorithm_problems
      WHERE workspace_id = ? AND judge_problem_ref = 'ascend:foundation:sum-two:v1'
    `).get(scope.workspaceId) as { id: number };
    const request = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", request);

    expect(getJudgeRuntimeAvailability(db, scope)).toMatchObject({
      configured: true,
      submissionAllowed: false,
      pilotStatus: "not_requested",
    });
    await expect(submitAlgorithmCode(db, scope, {
      operationId: "runtime:operation:blocked",
      sessionId: "runtime:session:blocked",
      problemId: problem.id,
      day: "2026-07-26",
      language: "python3",
      sourceCode: "print(1)",
    })).rejects.toThrow("试点尚未获批");
    expect(request).not.toHaveBeenCalled();
    expect(db.prepare("SELECT COUNT(*) AS count FROM algorithm_submissions").get()).toEqual({ count: 0 });
  });

  it("retries polling the same remote submission without creating duplicate work", async () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    ensureManagedAlgorithmCatalog(db, scope);
    const problem = db.prepare(`
      SELECT id FROM algorithm_problems
      WHERE workspace_id = ? AND judge_problem_ref = 'ascend:foundation:sum-two:v1'
    `).get(scope.workspaceId) as { id: number };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "submission:runtime:retry",
        status: "QUEUED",
      }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: "UPSTREAM_UNAVAILABLE",
      }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "submission:runtime:retry",
        status: "AC",
        timeMs: 5,
        memoryKb: 800,
        publicFeedback: [],
        judgedAt: "2026-07-26T11:00:00Z",
      }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    const queued = await submitAlgorithmCode(db, scope, {
      operationId: "runtime:operation:retry",
      sessionId: "runtime:session:retry",
      problemId: problem.id,
      day: "2026-07-26",
      language: "python3",
      sourceCode: "a,b=map(int,input().split());print(a+b)",
      preConfidence: 2,
      planText: "读取两个整数后在常数时间内求和",
    });
    expect((await refreshAlgorithmSubmission(db, scope, queued.id)).status).toBe("RETRYABLE_ERROR");
    expect((await refreshAlgorithmSubmission(db, scope, queued.id)).status).toBe("AC");
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
