import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb, createTestWorkspace } from "@/lib/repo/testing";
import { resolveAgentContext } from "@/lib/agent/context";
import { createAgentToken } from "@/lib/repo/agent-tokens";

let testDb: Database.Database | undefined;

vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  getDb: () => testDb!,
}));

describe("POST /api/mcp", () => {
  let token: string;

  beforeEach(() => {
    testDb = createTestDb();
    createTestWorkspace(testDb, { email: "remote-mcp@example.com", displayName: "远程 MCP" });
    const context = resolveAgentContext(testDb, "remote-mcp@example.com");
    token = createAgentToken(testDb, context, { name: "HTTP 测试" }).token;
  });

  afterEach(() => {
    testDb?.close();
    testDb = undefined;
    vi.resetModules();
  });

  function request(body: unknown, authorization = `Bearer ${token}`, host = "127.0.0.1") {
    return new Request("http://127.0.0.1/api/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization,
        "content-type": "application/json",
        host,
      },
      body: JSON.stringify(body),
    });
  }

  it("rejects missing credentials before parsing MCP calls", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({}, ""));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("initializes and exposes Ascend tools over stateless Streamable HTTP", async () => {
    const { POST } = await import("./route");
    const initialized = await POST(request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "route-test", version: "0.1.0" },
      },
    }));
    expect(initialized.status).toBe(200);
    await expect(initialized.json()).resolves.toMatchObject({
      result: { serverInfo: { name: "ascend", version: "0.2.0" } },
    });

    const tools = await POST(request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
    expect(tools.status).toBe(200);
    const payload = await tools.json() as { result: { tools: Array<{ name: string }> } };
    expect(payload.result.tools.map((tool) => tool.name)).toContain("task_create");
    expect(payload.result.tools.map((tool) => tool.name)).not.toContain("asset_import");

    const status = await POST(request({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "status", arguments: {} },
    }));
    const statusPayload = await status.json() as {
      result: { structuredContent: { result: Record<string, unknown> } };
    };
    expect(statusPayload.result.structuredContent.result).not.toHaveProperty("dataRoot");
    expect(statusPayload.result.structuredContent.result).not.toHaveProperty("importRoots");
  });

  it("executes writes inside the token owner's workspace", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "task_create",
        arguments: { day: "2026-07-19", title: "远程 Agent 任务" },
      },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: { structuredContent: { result: { title: "远程 Agent 任务" } } },
    });
    expect(testDb!.prepare("SELECT title FROM day_tasks").get()).toEqual({ title: "远程 Agent 任务" });
    expect(testDb!.prepare("SELECT action FROM audit_logs ORDER BY id DESC LIMIT 1").get())
      .toEqual({ action: "agent.task.create" });
  });
});
