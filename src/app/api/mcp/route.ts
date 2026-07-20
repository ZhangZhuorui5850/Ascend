import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAscendMcpServer } from "@/lib/agent/mcp-server";
import { getDb } from "@/lib/db";
import { logError } from "@/lib/log";
import { authenticateAgentToken } from "@/lib/repo/agent-tokens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MCP_BODY_BYTES = 1024 * 1024;

function jsonRpcError(status: number, message: string, headers?: HeadersInit): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: status === 401 ? -32001 : -32600, message }, id: null },
    { status, headers: { "cache-control": "private, no-store", ...headers } },
  );
}

function requestHost(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const value = request.headers.get("host") || forwarded || new URL(request.url).host;
  try {
    return new URL(`http://${value}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isAllowedHost(request: Request): boolean {
  const host = requestHost(request);
  if (process.env.NODE_ENV !== "production") return host === "localhost" || host === "127.0.0.1";
  return Boolean(process.env.APP_DOMAIN) && host === process.env.APP_DOMAIN!.trim().toLowerCase();
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedHost(request)) return jsonRpcError(403, "MCP host is not allowed");

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_MCP_BODY_BYTES) return jsonRpcError(413, "MCP request body is too large");

  const db = getDb();
  let context;
  try {
    context = authenticateAgentToken(db, request.headers.get("authorization"));
  } catch {
    return jsonRpcError(401, "Invalid or expired Agent token", {
      "www-authenticate": 'Bearer realm="Ascend MCP"',
    });
  }

  let parsedBody: unknown;
  try {
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_MCP_BODY_BYTES) return jsonRpcError(413, "MCP request body is too large");
    parsedBody = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return jsonRpcError(400, "Invalid JSON-RPC request");
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createAscendMcpServer(db, context);
  try {
    await server.connect(transport);
    return await transport.handleRequest(request, { parsedBody });
  } catch (error) {
    logError("mcp.http", error, { userId: context.userId });
    return jsonRpcError(500, "Ascend MCP request failed");
  }
}

export function GET(): Response {
  return jsonRpcError(405, "Stateless MCP accepts POST requests only", { allow: "POST" });
}

export const DELETE = GET;
