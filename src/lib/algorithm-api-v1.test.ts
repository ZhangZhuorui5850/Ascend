import { describe, expect, it } from "vitest";
import {
  algorithmApiFailure,
  algorithmApiSuccess,
  draftSaveSchema,
  readAlgorithmApiJson,
} from "./algorithm-api-v1";
import { AlgorithmDraftConflictError } from "./repo/algorithm-submissions";

describe("algorithm API v1 contract", () => {
  it("returns versioned success envelopes and stable request ids", async () => {
    const request = new Request("https://ascend.example/api", { headers: { "x-request-id": "request:test:0001" } });
    const response = algorithmApiSuccess(request, { ready: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      apiVersion: 1,
      requestId: "request:test:0001",
      data: { ready: true },
    });
  });

  it("validates draft bodies", async () => {
    const request = new Request("https://ascend.example/api", {
      method: "PUT",
      body: JSON.stringify({
        problemId: 1,
        language: "cpp17",
        sourceCode: "int main(){}",
        baseRevision: 0,
        operationId: "draft:test:0001",
      }),
    });
    await expect(readAlgorithmApiJson(request, draftSaveSchema)).resolves.toMatchObject({
      problemId: 1,
      baseRevision: 0,
      versionKind: "autosave",
    });
  });

  it("maps draft conflicts to a structured 409 response", async () => {
    const request = new Request("https://ascend.example/api");
    const response = algorithmApiFailure(request, new AlgorithmDraftConflictError({
      revision: 4,
      sha256: "abc",
      updatedAt: "2026-08-25T00:00:00Z",
      deviceId: "device-1",
      deviceName: "VS Code",
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      apiVersion: 1,
      error: { code: "DRAFT_CONFLICT", retryable: false, details: { current: { revision: 4 } } },
    });
  });

  it("maps expired device credentials to a structured 401 response", async () => {
    const request = new Request("https://ascend.example/api");
    const response = algorithmApiFailure(request, new Error("设备 token expired"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      apiVersion: 1,
      error: { code: "AUTH_REQUIRED", retryable: false },
    });
  });
});
