#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveAgentContext } from "../src/lib/agent/context";
import { createAscendMcpServer } from "../src/lib/agent/mcp-server";
import { getDb } from "../src/lib/db";

async function main(): Promise<void> {
  const db = getDb();
  const context = resolveAgentContext(db);
  const server = createAscendMcpServer(db, context, { allowLocalFileImport: true });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Ascend MCP 已启动：${context.email} / ${context.workspaceId}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
