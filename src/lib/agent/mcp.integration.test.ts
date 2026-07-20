import Database from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "../db";
import { runMigrations } from "../migrations";
import { createTestWorkspace } from "../repo/testing";

describe("Ascend stdio MCP", () => {
  const scratchRoots: string[] = [];

  afterEach(() => {
    for (const root of scratchRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("initializes, lists tools and calls status over the MCP protocol", async () => {
    const root = mkdtempSync(join(tmpdir(), "ascend-mcp-test-"));
    scratchRoots.push(root);
    const database = new Database(join(root, "workbench.sqlite"));
    initializeDatabase(database);
    runMigrations(database, { uploadRoot: join(root, "uploads") });
    createTestWorkspace(database, { email: "mcp@test.local", displayName: "MCP 测试" });
    database.close();

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "scripts/ascend-mcp.ts"],
      cwd: process.cwd(),
      env: {
        ...getDefaultEnvironment(),
        ZGCA_DATA_ROOT: root,
        ASCEND_AGENT_EMAIL: "mcp@test.local",
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "ascend-integration-test", version: "0.1.0" });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("task_create");
      expect(tools.tools.map((tool) => tool.name)).toContain("library_search");

      const result = await client.callTool({ name: "status", arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        result: { user: { email: "mcp@test.local" } },
      });
    } finally {
      await client.close();
    }
  }, 15_000);

  it("runs the JSON CLI against an isolated workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "ascend-cli-test-"));
    scratchRoots.push(root);
    const database = new Database(join(root, "workbench.sqlite"));
    initializeDatabase(database);
    runMigrations(database, { uploadRoot: join(root, "uploads") });
    createTestWorkspace(database, { email: "cli@test.local", displayName: "CLI 测试" });
    database.close();

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/ascend-cli.ts", "status", "--email", "cli@test.local"],
      {
        cwd: process.cwd(),
        env: { ...process.env, ZGCA_DATA_ROOT: root },
        encoding: "utf8",
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      operation: "status",
      result: { user: { email: "cli@test.local" } },
    });
  });
});
