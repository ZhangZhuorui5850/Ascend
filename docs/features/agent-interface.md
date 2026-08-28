# Ascend Agent Interface

状态：实现清单自动生成；最后核对 2026-08-28。

Ascend 通过共享操作层同时提供本地 CLI、本地 stdio MCP 和远程 HTTPS MCP。业务规则、workspace 隔离、输入校验与审计集中在 `src/lib/agent/operations.ts` 及 repo/application 层。

## 连接方式

| 入口 | 用途 | 身份来源 |
| --- | --- | --- |
| `npm run ascend -- ...` | 人工命令与本地自动化 | `ASCEND_AGENT_EMAIL` 或 `--email` |
| `npm run mcp:ascend` | 本地 stdio MCP | 进程环境中的普通账号 |
| `POST /api/mcp` | 远程 Streamable HTTP MCP | 设置页签发的 Bearer token |

远程 Codex 配置：

```bash
export ASCEND_MCP_TOKEN='设置页生成的令牌'
codex mcp add ascend \
  --url https://ascend.zhuorui.me/api/mcp \
  --bearer-token-env-var ASCEND_MCP_TOKEN
```

本地 CLI 在多账号环境中指定普通学习账号：

```bash
export ASCEND_AGENT_EMAIL=owner@example.com
npm run ascend -- status --pretty
```

`ascend://capabilities` 与 `npm run ascend -- tools` 返回机器可读清单。当前人工可读表由 `operationManifest()` 生成，见 [Agent 操作清单](../generated/agent-operations.md)。更新操作实现后运行 `npm run docs:agent-operations`。

## 安全边界

1. 普通 Agent 身份固定到一个活跃用户与 workspace；管理员账号走独立控制面。
2. 所有业务操作经过 Zod schema、application/repo 层和 `workspace_id` 约束。
3. 每个写操作写入 `audit_logs`，action 前缀为 `agent.`。
4. 破坏性操作要求 `confirm=true`；调用前先读取真实实体 ID 和版本。
5. `asset.import` 只在本地 CLI/stdio 注册，并受 `ASCEND_AGENT_IMPORT_ROOTS` 白名单约束。
6. 远程 token 最多同时保留 5 个，有效期 90 天；服务端只保存 SHA-256 摘要，设置页支持立即撤销。
7. 远程入口限制 1 MiB JSON，并在生产环境校验 `APP_DOMAIN`。MCP 工具声明只读、破坏性、幂等与开放世界提示。
8. 密码、session cookie、token 明文和任意 workspace ID 均留在操作参数边界之外。

## 三个常用示例

查询一周任务：

```bash
npm run ascend -- task.list \
  --from 2026-08-24 --to 2026-08-30 --includeDone false --pretty
```

幂等创建任务：

```bash
npm run ascend -- task.create \
  --clientMutationId agent-20260828-linear-algebra \
  --day 2026-08-29 --title "完成线性代数错题复盘" \
  --priority 1 --estimatedMinutes 60 --scheduledStart 20:00
```

读取算法训练并记录结果：

```bash
npm run ascend -- algorithm.dashboard --date 2026-08-28 --pretty
npm run ascend -- algorithm.attempt.record \
  --operationId attempt-20260828-problem-42 \
  --problemId 42 --day 2026-08-28 --verdict AC --durationMinutes 35
```

写入后再次调用对应读取操作，核对实体 ID、版本与最终状态。任务完成、重开、改期和恢复分别使用 `task.complete`、`task.reopen`、`task.reschedule` 与 `task.restore`。
