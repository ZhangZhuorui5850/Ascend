import { afterEach, describe, expect, it } from "vitest";
import { resolveAgentContext } from "../agent/context";
import { createTestDb, createTestWorkspace } from "./testing";
import { authenticateAgentToken, createAgentToken, listAgentTokens, revokeAgentToken } from "./agent-tokens";

describe("Agent tokens", () => {
  const databases: ReturnType<typeof createTestDb>[] = [];

  afterEach(() => {
    for (const db of databases.splice(0)) db.close();
  });

  function setup() {
    const db = createTestDb();
    databases.push(db);
    createTestWorkspace(db, { email: "agent-token@example.com", displayName: "令牌测试" });
    const context = resolveAgentContext(db, "agent-token@example.com");
    return { db, context };
  }

  it("stores only a hash and authenticates the token into its own workspace", () => {
    const { db, context } = setup();
    const created = createAgentToken(db, context, { name: "测试 Codex" });

    expect(created.token).toMatch(/^ascend_mcp_[A-Za-z0-9_-]{40,}$/);
    expect(listAgentTokens(db, context.userId)).toEqual([
      expect.objectContaining({ id: created.record.id, name: "测试 Codex" }),
    ]);
    const stored = db.prepare("SELECT token_hash, token_prefix FROM agent_tokens WHERE id = ?").get(created.record.id) as {
      token_hash: string;
      token_prefix: string;
    };
    expect(stored.token_hash).not.toContain(created.token);
    expect(stored.token_prefix).not.toBe(created.token);
    expect(authenticateAgentToken(db, `Bearer ${created.token}`)).toMatchObject({
      userId: context.userId,
      workspaceId: context.workspaceId,
    });
    expect(db.prepare("SELECT action FROM audit_logs ORDER BY id DESC LIMIT 1").get())
      .toEqual({ action: "agent.token.created" });
  });

  it("rejects malformed, revoked and cross-user tokens", () => {
    const { db, context } = setup();
    const created = createAgentToken(db, context, { name: "将撤销" });
    createTestWorkspace(db, { email: "other-token@example.com" });

    expect(() => authenticateAgentToken(db, "Bearer wrong")).toThrow("Agent token required");
    revokeAgentToken(db, context, created.record.id);
    expect(() => authenticateAgentToken(db, `Bearer ${created.token}`)).toThrow("invalid or expired");
    expect(listAgentTokens(db, context.userId)).toHaveLength(0);
    expect(db.prepare("SELECT action FROM audit_logs ORDER BY id DESC LIMIT 1").get())
      .toEqual({ action: "agent.token.revoked" });
  });
});
