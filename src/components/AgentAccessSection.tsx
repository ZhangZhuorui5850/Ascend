"use client";

import { useState, useTransition } from "react";
import { Bot, Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { createAgentTokenAction, revokeAgentTokenAction } from "@/app/actions/settings";
import { useFeedback } from "@/components/FeedbackProvider";
import type { AgentTokenRow } from "@/lib/repo/agent-tokens";

export function AgentAccessSection({ tokens, mcpUrl }: { tokens: AgentTokenRow[]; mcpUrl: string }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("我的 Codex");
  const [issuedToken, setIssuedToken] = useState("");
  const [copied, setCopied] = useState(false);
  const { confirm, notify } = useFeedback();

  function createToken() {
    startTransition(async () => {
      const result = await createAgentTokenAction({ name });
      if (!result.ok || !result.token) {
        notify(result.error || "创建失败", "error");
        return;
      }
      setIssuedToken(result.token);
      setCopied(false);
      notify("Agent 令牌已创建，请立即复制保存", "success");
    });
  }

  async function copyToken() {
    await navigator.clipboard.writeText(issuedToken);
    setCopied(true);
    notify("令牌已复制", "success");
  }

  function revoke(token: AgentTokenRow) {
    void confirm({
      title: "撤销这个 Agent 令牌？",
      description: `${token.name} 将立即无法继续操作 Ascend，需要重新创建并配置新令牌。`,
      confirmLabel: "撤销令牌",
      danger: true,
    }).then((accepted) => {
      if (!accepted) return;
      startTransition(async () => {
        const result = await revokeAgentTokenAction(token.id);
        notify(result.ok ? "Agent 令牌已撤销" : result.error || "撤销失败", result.ok ? "success" : "error");
      });
    });
  }

  return (
    <section aria-label="Agent 接入" className="card agentAccess">
      <div className="sectionTitle">
        <div>
          <span className="sectionKicker">AGENT ACCESS</span>
          <h2>Agent 接入</h2>
        </div>
        <span className="sectionHint">令牌有效期 90 天，可随时撤销</span>
      </div>

      <p className="agentAccessIntro">为 Codex 等 Agent 创建独立访问令牌。令牌拥有当前学习账号的操作权限，请像密码一样保管。</p>

      <div className="inlineCreate">
        <input
          aria-label="令牌名称"
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：我的 Codex"
          value={name}
        />
        <button className="primaryButton" disabled={pending || !name.trim()} onClick={createToken} type="button">
          <KeyRound size={14} />
          创建令牌
        </button>
      </div>

      {issuedToken ? (
        <div className="agentTokenReveal" role="status">
          <strong>只显示这一次，请立即复制</strong>
          <code>{issuedToken}</code>
          <button className="secondaryButton" onClick={copyToken} type="button">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "已复制" : "复制令牌"}
          </button>
          <p>然后在将要启动 Codex 的同一个终端执行：</p>
          <pre>{`export ASCEND_MCP_TOKEN='${issuedToken}'
codex mcp add ascend --url ${mcpUrl} --bearer-token-env-var ASCEND_MCP_TOKEN`}</pre>
        </div>
      ) : null}

      <div className="deviceList">
        {tokens.map((token) => (
          <article className="deviceRow" key={token.id}>
            <span className="deviceIcon"><Bot size={18} /></span>
            <div>
              <strong>{token.name}</strong>
              <small>
                {token.tokenPrefix} · 到期 {formatDate(token.expiresAt)} · {token.lastUsedAt ? `最近使用 ${formatDate(token.lastUsedAt)}` : "尚未使用"}
              </small>
            </div>
            <button className="secondaryButton" disabled={pending} onClick={() => revoke(token)} type="button">
              <Trash2 size={14} />撤销
            </button>
          </article>
        ))}
        {!tokens.length ? <p className="empty">还没有有效的 Agent 令牌。</p> : null}
      </div>
    </section>
  );
}

function formatDate(value: string): string {
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(iso).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
