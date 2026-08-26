import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import {
  aggregateJudge0Results,
  GatewayHttpError,
  ReferenceJudgeGateway,
  validateProblemDefinitions,
} from "../../services/judge-gateway/core.mjs";

const TEST_PROBLEM_REF = "test:gateway:add:v1";
const definitions = [{
  ref: TEST_PROBLEM_REF,
  license: { id: "CC0-1.0", origin: "test fixture", redistribution: true },
  languages: ["cpp17", "python3"],
  timeLimitMs: 1_000,
  memoryLimitKb: 131_072,
  cases: [
    { visibility: "public", input: "1 2\n", output: "3\n" },
    { visibility: "public", input: "-1 1\n", output: "0\n" },
    { visibility: "hidden", input: "20 22\n", output: "42\n" },
  ],
}];
const problems = validateProblemDefinitions(definitions);
type GatewayProblem = {
  cases: Array<{ visibility: "public" | "hidden"; input: string; output: string }>;
};

describe("reference judge gateway", () => {
  it("creates a Judge0 batch once for duplicate idempotent requests", async () => {
    const db = new Database(":memory:");
    const request = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify(body.submissions.map((_: unknown, index: number) => ({
        token: `case-token-${String(index + 1).padStart(4, "0")}`,
      }))), { status: 201 });
    });
    const gateway = new ReferenceJudgeGateway({
      db,
      problems,
      judge0Url: "https://judge0.example.test",
      languageIds: { cpp17: 54, python3: 71 },
      request,
    });
    const input = {
      idempotencyKey: "operation:gateway:0001",
      problemRef: TEST_PROBLEM_REF,
      language: "cpp17",
      sourceCode: "int main(){return 0;}",
    };
    const first = await gateway.createSubmission(input);
    const duplicate = await gateway.createSubmission(input);
    expect(duplicate).toEqual(first);
    expect(request).toHaveBeenCalledTimes(1);
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.submissions).toHaveLength(
      (problems.get(TEST_PROBLEM_REF) as GatewayProblem).cases.length,
    );
    expect(body.submissions.every((submission: { enable_network: boolean }) => (
      submission.enable_network === false
    ))).toBe(true);
    expect(body.submissions.every((submission: Record<string, unknown>) => (
      submission.max_processes_and_or_threads === 1
      && submission.enable_per_process_and_thread_time_limit === true
      && submission.enable_per_process_and_thread_memory_limit === true
      && submission.stack_limit === 65536
      && submission.max_file_size === 64
      && submission.number_of_runs === 1
    ))).toBe(true);
    const stored = db.prepare("SELECT * FROM gateway_submissions").all();
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain("int main");
    await expect(gateway.createSubmission({ ...input, sourceCode: "changed" }))
      .rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
  });

  it("never returns hidden input, expected output, or stdout", () => {
    const problem = problems.get(TEST_PROBLEM_REF) as GatewayProblem;
    const submissions = problem.cases.map((testCase, index: number) => ({
      status: { id: index === 2 ? 4 : 3, description: index === 2 ? "Wrong Answer" : "Accepted" },
      stdout: Buffer.from(index === 2 ? "hidden-produced-value" : testCase.output).toString("base64"),
      compile_output: null,
      time: "0.01",
      memory: 1000,
    }));
    const result = aggregateJudge0Results("submission:hidden:0001", problem, submissions);
    expect(result.status).toBe("WA");
    expect(result.publicFeedback).toEqual([]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("hidden-produced-value");
    expect(serialized).not.toContain(problem.cases[2].input);
    expect(serialized).not.toContain(problem.cases[2].output);
  });

  it("only exposes a failed public sample with bounded expected output", () => {
    const problem = problems.get(TEST_PROBLEM_REF) as GatewayProblem;
    const submissions = problem.cases.map((testCase, index: number) => ({
      status: { id: index === 0 ? 4 : 3, description: index === 0 ? "Wrong Answer" : "Accepted" },
      stdout: Buffer.from(index === 0 ? "2\n" : testCase.output).toString("base64"),
      compile_output: null,
      time: "0.01",
      memory: 1000,
    }));
    const result = aggregateJudge0Results("submission:public:0001", problem, submissions);
    expect(result.publicFeedback).toEqual([{
      caseIndex: 0,
      visibility: "public",
      status: "WA",
      stdoutExcerpt: "2\n",
      expectedExcerpt: "3\n",
    }]);
  });

  it("sends only public cases for sample runs", async () => {
    const db = new Database(":memory:");
    const request = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify(body.submissions.map((_: unknown, index: number) => ({
        token: `public-token-${index}`,
      }))), { status: 201 });
    });
    const gateway = new ReferenceJudgeGateway({
      db,
      problems,
      judge0Url: "https://judge0.example.test",
      languageIds: { cpp17: 54, python3: 71 },
      request,
    });
    await gateway.createSubmission({
      idempotencyKey: "operation:sample:0001",
      problemRef: TEST_PROBLEM_REF,
      language: "python3",
      sourceCode: "print(sum(map(int,input().split())))",
      mode: "sample",
    });
    const body = JSON.parse(String(request.mock.calls[0][1].body));
    expect(body.submissions).toHaveLength(2);
  });

  it("validates licensed problem manifests before serving", () => {
    expect(validateProblemDefinitions([]).size).toBe(0);
    expect(() => validateProblemDefinitions([{
      ref: "short",
      license: { id: "CC0-1.0", redistribution: true },
      languages: ["cpp17"],
      timeLimitMs: 1000,
      memoryLimitKb: 65536,
      cases: [{ visibility: "hidden", input: "", output: "" }],
    }])).toThrow(GatewayHttpError);
    expect(() => validateProblemDefinitions([{
      ref: "problem:unsupported:language",
      license: { id: "CC0-1.0", redistribution: true },
      languages: ["javascript"],
      timeLimitMs: 1000,
      memoryLimitKb: 65536,
      cases: [{ visibility: "hidden", input: "", output: "" }],
    }])).toThrow("unsupported or duplicate languages");
  });

  it("rejects a streamed upstream response as soon as it exceeds the byte limit", async () => {
    const db = new Database(":memory:");
    const request = vi.fn().mockResolvedValue(new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(257 * 1024));
          controller.close();
        },
      }),
      { status: 201 },
    ));
    const gateway = new ReferenceJudgeGateway({
      db,
      problems,
      judge0Url: "https://judge0.example.test",
      languageIds: { cpp17: 54, python3: 71 },
      request,
    });
    await expect(gateway.createSubmission({
      idempotencyKey: "operation:large-response",
      problemRef: TEST_PROBLEM_REF,
      language: "cpp17",
      sourceCode: "int main(){return 0;}",
    })).rejects.toMatchObject({
      status: 502,
      code: "UPSTREAM_RESPONSE_TOO_LARGE",
    });
  });

  it("upgrades an existing gateway state database without dropping submissions", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE gateway_submissions (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        request_sha256 TEXT NOT NULL,
        problem_ref TEXT NOT NULL,
        language TEXT NOT NULL,
        judge_tokens_json TEXT NOT NULL DEFAULT '[]',
        case_manifest_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'CREATING',
        result_json TEXT NOT NULL DEFAULT '{}',
        failure_code TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO gateway_submissions
        (id, idempotency_key, request_sha256, problem_ref, language)
      VALUES
        ('submission:legacy:0001', 'operation:legacy:0001', 'hash',
         'test:gateway:add:v1', 'cpp17');
    `);
    new ReferenceJudgeGateway({
      db,
      problems,
      judge0Url: "https://judge0.example.test",
      languageIds: { cpp17: 54, python3: 71 },
      request: vi.fn(),
    });
    expect(db.prepare(`
      SELECT submission_mode FROM gateway_submissions WHERE id = 'submission:legacy:0001'
    `).get()).toEqual({ submission_mode: "formal" });
  });

  it("retries the same idempotency key only after an explicit queue-full response", async () => {
    const db = new Database(":memory:");
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "queue full" }), { status: 503 }))
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        return new Response(JSON.stringify(body.submissions.map((_: unknown, index: number) => ({
          token: `retry-token-${String(index + 1).padStart(4, "0")}`,
        }))), { status: 201 });
      });
    const gateway = new ReferenceJudgeGateway({
      db,
      problems,
      judge0Url: "https://judge0.example.test",
      languageIds: { cpp17: 54, python3: 71 },
      request,
    });
    const input = {
      idempotencyKey: "operation:queue-retry:0001",
      problemRef: TEST_PROBLEM_REF,
      language: "cpp17",
      sourceCode: "int main(){return 0;}",
    };
    await expect(gateway.createSubmission(input)).rejects.toMatchObject({
      status: 503,
      code: "QUEUE_FULL",
    });
    await expect(gateway.createSubmission(input)).resolves.toMatchObject({
      status: "QUEUED",
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(db.prepare("SELECT COUNT(*) AS count FROM gateway_submissions").get())
      .toEqual({ count: 1 });
  });

  it("rejects new work before forwarding when the local capacity limit is reached", async () => {
    const db = new Database(":memory:");
    const request = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify(body.submissions.map((_: unknown, index: number) => ({
        token: `capacity-token-${String(index + 1).padStart(4, "0")}`,
      }))), { status: 201 });
    });
    const gateway = new ReferenceJudgeGateway({
      db,
      problems,
      judge0Url: "https://judge0.example.test",
      languageIds: { cpp17: 54, python3: 71 },
      request,
      maxActive: 1,
    });
    const base = {
      problemRef: TEST_PROBLEM_REF,
      language: "cpp17",
      sourceCode: "int main(){return 0;}",
    };
    await gateway.createSubmission({ ...base, idempotencyKey: "operation:capacity:0001" });
    await expect(gateway.createSubmission({
      ...base,
      idempotencyKey: "operation:capacity:0002",
    })).rejects.toMatchObject({
      status: 503,
      code: "GATEWAY_CAPACITY_FULL",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
