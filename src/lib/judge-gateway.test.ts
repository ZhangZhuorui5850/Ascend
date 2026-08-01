import { describe, expect, it, vi } from "vitest";
import {
  JudgeGatewayClient,
  JudgeGatewayError,
  loadJudgeGatewayConfig,
} from "./judge-gateway";

const config = {
  baseUrl: "https://judge.example.test",
  token: "separate-judge-secret",
  timeoutMs: 5_000,
};

describe("judge gateway client", () => {
  it("requires a paired HTTPS URL and token in production", () => {
    expect(loadJudgeGatewayConfig({})).toBeNull();
    expect(() => loadJudgeGatewayConfig({
      NODE_ENV: "production",
      ASCEND_JUDGE_GATEWAY_URL: "http://judge.example.test",
      ASCEND_JUDGE_GATEWAY_TOKEN: "secret",
    })).toThrow("HTTPS");
    expect(loadJudgeGatewayConfig({
      NODE_ENV: "development",
      ASCEND_JUDGE_GATEWAY_URL: "http://127.0.0.1:4100/",
      ASCEND_JUDGE_GATEWAY_TOKEN: "secret",
    })).toEqual({
      baseUrl: "http://127.0.0.1:4100",
      token: "secret",
      timeoutMs: 5_000,
    });
  });

  it("creates asynchronous submissions without putting the token in the URL", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: "submission:12345678",
      status: "QUEUED",
    }), { status: 202, headers: { "content-type": "application/json" } }));
    const client = new JudgeGatewayClient(config, request);

    await expect(client.createSubmission({
      idempotencyKey: "operation:12345678",
      problemRef: "ascend:sum-two",
      language: "cpp17",
      sourceCode: "int main(){}",
    })).resolves.toEqual({ id: "submission:12345678", status: "QUEUED" });
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://judge.example.test/v1/submissions");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer separate-judge-secret",
      "idempotency-key": "operation:12345678",
    });
    expect(String(url)).not.toContain("separate-judge-secret");
  });

  it("only accepts bounded public feedback and never exposes hidden cases", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: "submission:12345678",
      status: "WA",
      timeMs: 12,
      memoryKb: 1024,
      compilerExcerpt: "",
      publicFeedback: [
        {
          caseIndex: 0,
          visibility: "public",
          status: "WA",
          stdoutExcerpt: "3",
          expectedExcerpt: "4",
        },
        {
          caseIndex: 1,
          visibility: "hidden",
          status: "WA",
          stdoutExcerpt: "secret output",
          expectedExcerpt: "secret answer",
        },
      ],
      judgedAt: "2026-07-26T10:00:00Z",
    }), { status: 200 }));
    const result = await new JudgeGatewayClient(config, request)
      .getSubmission("submission:12345678");
    expect(result.status).toBe("WA");
    expect(result.publicFeedback).toEqual([{
      caseIndex: 0,
      visibility: "public",
      status: "WA",
      stdoutExcerpt: "3",
      expectedExcerpt: "4",
    }]);
    expect(JSON.stringify(result)).not.toContain("secret answer");
  });

  it("maps queue-full failures and opens a short circuit after repeated failures", async () => {
    let now = 1_000;
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(
      JSON.stringify({ code: "QUEUE_FULL" }),
      { status: 503 },
    ));
    const client = new JudgeGatewayClient(config, request, () => now);
    for (let index = 0; index < 3; index += 1) {
      await expect(client.health()).rejects.toMatchObject({
        code: "QUEUE_FULL",
        retryable: true,
        status: 503,
      });
    }
    await expect(client.health()).rejects.toMatchObject({
      code: "CIRCUIT_OPEN",
      retryable: true,
    });
    expect(request).toHaveBeenCalledTimes(3);

    now += 30_001;
    await expect(client.health()).rejects.toBeInstanceOf(JudgeGatewayError);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("rejects oversized streamed responses before parsing JSON", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(129 * 1024));
          controller.close();
        },
      }),
      { status: 200 },
    ));
    await expect(new JudgeGatewayClient(config, request).health()).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
      retryable: true,
    });
  });
});
