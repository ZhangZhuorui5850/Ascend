import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import type { AgentContext } from "./context";
import { agentOperations, executeAgentOperation, operationManifest } from "./operations";

export const ASCEND_MCP_INSTRUCTIONS = `Ascend 是用户的学习与备考系统。先调用 status 或只读查询确认账号和当前状态，再执行写操作。所有日期使用 YYYY-MM-DD（Asia/Shanghai）。删除科目、章节、知识点、任务、资料和文件夹前，必须向用户确认并传 confirm=true。不要猜测实体 ID：先查询科目、日程或资料库。资料导入只能读取 ASCEND_AGENT_IMPORT_ROOTS 允许的目录。工具只操作令牌所属用户的 workspace，禁止跨用户操作。`;

type McpServerOptions = {
  allowLocalFileImport?: boolean;
};

export function createAscendMcpServer(
  db: Database.Database,
  context: AgentContext,
  options: McpServerOptions = {},
): McpServer {
  const allowLocalFileImport = options.allowLocalFileImport ?? false;
  const operations = allowLocalFileImport
    ? agentOperations
    : agentOperations.filter((operation) => operation.id !== "asset.import");
  const instructions = allowLocalFileImport
    ? ASCEND_MCP_INSTRUCTIONS
    : `${ASCEND_MCP_INSTRUCTIONS} 当前是远程连接，不能读取客户端或服务器本地路径；资料上传请使用 Ascend 网页。`;
  const server = new McpServer(
    { name: "ascend", version: "0.2.0" },
    { capabilities: { logging: {} }, instructions },
  );

  for (const operation of operations) {
    server.registerTool(
      operation.id.replace(/[.-]/g, "_"),
      {
        title: operation.title,
        description: operation.description,
        inputSchema: operation.schema,
        annotations: {
          readOnlyHint: operation.readOnly,
          destructiveHint: Boolean(operation.destructive),
          idempotentHint: operation.readOnly,
          openWorldHint: false,
        },
      },
      async (input) => {
        try {
          let result = await executeAgentOperation({ db, context }, operation, input);
          if (!allowLocalFileImport && operation.id === "status" && result && typeof result === "object") {
            const safeResult = { ...(result as Record<string, unknown>) };
            delete safeResult.dataRoot;
            delete safeResult.importRoots;
            result = safeResult;
          }
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: { result },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { isError: true, content: [{ type: "text", text: message }] };
        }
      },
    );
  }

  server.registerResource(
    "ascend-capabilities",
    "ascend://capabilities",
    {
      title: "Ascend Agent 能力清单",
      description: "当前 MCP/CLI 可调用的全部 Ascend 操作",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(operationManifest(operations), null, 2) }],
    }),
  );

  return server;
}
