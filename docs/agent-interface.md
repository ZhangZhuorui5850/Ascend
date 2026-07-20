# Ascend Agent Interface：MCP 与 CLI 操作手册

状态：v0.2（远程 Streamable HTTP MCP + 本地 stdio MCP + 本地 CLI）  
最后核对：2026-07-19

## 结论

[COMPUTED] 可行，并且 Ascend 现有架构很适合做这件事：日程、每日记录、科目、章节、知识点、资料、复习、错题和模考都已经通过带 `workspace_id` 的 repo 层表达。v0.2 已实现一个共享 Agent 操作层，并同时提供：

- `npm run ascend -- ...`：面向人和脚本的 JSON CLI。
- `npm run mcp:ascend`：面向 Codex 和其他 MCP 客户端的本地 stdio server。
- `/api/mcp`：面向远程 Agent 的 HTTPS Streamable HTTP server。
- `ascend://capabilities`：MCP 可读取的能力清单资源。

[INFERRED] 长期应保持“领域服务是唯一业务入口，CLI/MCP 只是传输适配器”的形态。不要让 Agent 直接写 SQLite，也不要为 MCP 复制一套业务规则。

## 传输方式

- [KNOWN] Codex 支持本地 stdio MCP 和远程 Streamable HTTP MCP；stdio 由客户端按命令启动，适合当前单机数据与本地 Agent。
- [KNOWN] 官方 TypeScript SDK 当前生产建议仍是 v1.x；v2 在本次调研时为 beta，因此项目固定使用 `@modelcontextprotocol/sdk` 1.x。
- [KNOWN] 远程入口使用 HTTPS + Streamable HTTP。用户在网页设置中签发 90 天 Bearer token；服务端只保存 SHA-256 摘要，token 固定映射到一个用户和 workspace，可随时撤销。
- [INFERRED] 当前是自用/小规模部署，短期 token 比完整 OAuth 流程更简单。若以后开放给第三方用户，应升级为 OAuth 2.1 / PKCE 并增加边缘限流。

主要依据：

- [OpenAI Codex MCP 文档](https://developers.openai.com/codex/mcp/)
- [MCP TypeScript SDK v1](https://ts.sdk.modelcontextprotocol.io/)
- [MCP TypeScript SDK 官方仓库](https://github.com/modelcontextprotocol/typescript-sdk)

## 架构

```text
Codex / 其他 Agent ──stdio MCP────┐
远程 Agent ──HTTPS /api/mcp───────┼── src/lib/agent/operations.ts
人 / shell / 自动化 ───CLI────────┘          │
                                           ├── 身份解析与 workspace 隔离
                                           ├── Zod 输入校验
                                           ├── 删除确认与导入白名单
                                           ├── audit_logs
                                           └── src/lib/repo/* ── SQLite / uploads
```

关键文件：

- `src/lib/agent/context.ts`：从普通账号邮箱解析唯一的活跃 workspace。
- `src/lib/agent/operations.ts`：CLI/MCP 共用的输入 schema、工具说明、安全规则和执行器。
- `scripts/ascend-cli.ts`：JSON CLI。
- `scripts/ascend-mcp.ts`：stdio MCP server、server instructions、工具和资源注册。
- `src/app/api/mcp/route.ts`：远程 MCP 入口、Host/大小检查和 token 鉴权。
- `src/lib/repo/agent-tokens.ts`：令牌签发、摘要存储、鉴权和撤销。
- `src/lib/agent/operations.test.ts`：账号选择、workspace 隔离、审计和删除确认测试。

## 安全边界

1. 远程 MCP 复用现有 Caddy HTTPS，不额外暴露容器端口；只接受 `POST /api/mcp`。
2. 只允许 `role=user`、`status=active`、已经完成强制改密且拥有 workspace 的账号。
3. 多个普通账号同时存在时，必须通过 `ASCEND_AGENT_EMAIL` 或 CLI `--email` 精确选择；禁止默认猜测。
4. 所有业务调用继续经过原 repo 层，并携带 `workspace_id`。
5. 每个写操作写入 `audit_logs`，action 以 `agent.` 开头。
6. 删除任务、科目、章节、知识点、资料或文件夹时，输入必须包含 `confirm=true`。
7. `asset.import` 只在本地 CLI/stdio 开放，并且只能读取 `ASCEND_AGENT_IMPORT_ROOTS` 允许目录下的真实文件；远程 MCP 不注册该工具，也不返回服务器数据目录。
8. MCP 工具声明 `readOnlyHint`、`destructiveHint`、`idempotentHint` 和 `openWorldHint=false`。因为部分 `*.manage` 工具包含删除分支，客户端可能连普通更新也先请求批准，这是安全优先的已知取舍。
9. 不接受密码、session cookie 或任意 workspace ID 作为工具参数；MCP 启动时固定身份，运行中不能切换用户。
10. 远程 token 最多同时保留 5 个，有效期 90 天；明文只在创建后显示一次，数据库仅保存哈希。账号停用、强制改密、token 到期或撤销后立即拒绝访问。
11. 远程入口限制 1 MiB JSON 请求，并在生产环境校验 `APP_DOMAIN`。

## 环境变量

| 变量 | 是否必需 | 作用 |
| --- | --- | --- |
| `ASCEND_AGENT_EMAIL` | 多账号时必需 | 固定 MCP/CLI 操作的普通学习账号 |
| `ZGCA_DATA_ROOT` | 按部署情况 | SQLite 与上传根目录；默认 `./data` |
| `ZGCA_UPLOAD_ROOT` | 可选 | 单独覆盖上传目录 |
| `ASCEND_AGENT_IMPORT_ROOTS` | 导入项目外文件时必需 | 文件读取白名单，多个绝对路径用英文逗号分隔 |

这些环境变量只用于本地 CLI/stdio。远程 MCP 的身份来自 Bearer token，不允许客户端指定邮箱或 workspace。

账号必须已经由 Ascend 初始化并至少完成必要的首次登录/改密流程。MCP 不负责创建账号，也不会使用管理员账号。

## CLI

### 基本形式

```bash
npm run ascend -- tools
npm run ascend -- <operation> --key value --pretty
npm run ascend -- <operation> --input '{"key":"value"}'
```

CLI 始终输出 JSON。成功为 `{ "ok": true, ... }`，失败写 stderr、退出码为 1。参数名与 MCP 输入 schema 一致；数字、`true`、`false`、`null` 会自动转换，数组/对象用 JSON。

### 常用例子

```bash
# 身份与配置
npm run ascend -- status --email owner@example.com --pretty

# 查询一周任务
npm run ascend -- task.list \
  --from 2026-07-19 --to 2026-07-25 --includeDone false --pretty

# 创建任务
npm run ascend -- task.create \
  --day 2026-07-20 --title "完成高数错题复盘" \
  --priority 1 --estimatedMinutes 60 --scheduledStart 20:00

# 完成任务
npm run ascend -- task.update --id 42 --done true

# 更新当日总结
npm run ascend -- day.update \
  --date 2026-07-19 --summary "完成两轮主动回忆"

# 创建资料文件夹
npm run ascend -- folder.manage \
  --action create --parentPath "数学" --name "线性代数"

# 导入资料；路径必须在白名单中
ASCEND_AGENT_IMPORT_ROOTS="$HOME/Downloads" \
npm run ascend -- asset.import \
  --localPath "$HOME/Downloads/矩阵笔记.pdf" --folderPath "数学/线性代数"

# 删除必须显式确认
npm run ascend -- task.delete --id 42 --confirm true
```

## 远程 Codex MCP 配置（推荐）

1. 登录 Ascend，打开「设置 → Agent」。
2. 创建令牌并立即复制；明文不会再次显示。
3. 在将要启动 Codex 的同一个终端执行：

```bash
export ASCEND_MCP_TOKEN='刚才复制的令牌'
codex mcp add ascend \
  --url https://ascend.zhuorui.me/api/mcp \
  --bearer-token-env-var ASCEND_MCP_TOKEN
```

重启 Codex 后使用 `/mcp` 检查 `ascend`。MCP 初始化时会自动取得 server instructions、工具 schema 和 `ascend://capabilities`；这就是 Agent 知道 Ascend 能做什么的机制。令牌泄露或设备不用时，在「设置 → Agent」立即撤销。

不要把令牌提交进 Git。`export` 只对当前终端有效；长期使用时应放进本机的安全凭据/启动环境，而不是项目文件。

## 本地 Codex MCP 配置

在当前 Mac 上可直接执行：

```bash
codex mcp add ascend \
  --env ASCEND_AGENT_EMAIL=owner@example.com \
  --env ZGCA_DATA_ROOT=/Users/zhangzhuorui/Program_Files/Ascend/data \
  --env ASCEND_AGENT_IMPORT_ROOTS=/Users/zhangzhuorui/Downloads \
  -- npm --prefix /Users/zhangzhuorui/Program_Files/Ascend run mcp:ascend
```

然后重启 Codex，在会话中使用 `/mcp` 检查 `ascend`。也可以手工写入 `~/.codex/config.toml`：

```toml
[mcp_servers.ascend]
command = "npm"
args = ["--prefix", "/Users/zhangzhuorui/Program_Files/Ascend", "run", "mcp:ascend"]
startup_timeout_sec = 20
tool_timeout_sec = 60

[mcp_servers.ascend.env]
ASCEND_AGENT_EMAIL = "owner@example.com"
ZGCA_DATA_ROOT = "/Users/zhangzhuorui/Program_Files/Ascend/data"
ASCEND_AGENT_IMPORT_ROOTS = "/Users/zhangzhuorui/Downloads"
```

不要把真实密码写进 MCP 配置。stdio MCP 不需要 Ascend 登录密码，因为它在同一台机器上、以当前 OS 用户权限访问指定数据目录。

## 操作清单

MCP 名称把 CLI 的点号替换为下划线，例如 `task.create` 对应 `task_create`。

| CLI operation | MCP tool | 类型 | 说明 |
| --- | --- | --- | --- |
| `status` | `status` | 读 | 当前账号、workspace 与日期；服务器目录仅本地可见 |
| `dashboard.get` | `dashboard_get` | 读 | 首页、七日分析、存储容量 |
| `day.get` | `day_get` | 读 | 每日工作区全量视图 |
| `day.update` | `day_update` | 写 | 计划、日记、总结、阻碍、明日计划 |
| `task.list` | `task_list` | 读 | 日期范围任务 |
| `task.create` | `task_create` | 写 | 创建日程任务 |
| `task.update` | `task_update` | 写 | 内容、完成状态、跨日排期 |
| `task.delete` | `task_delete` | 删除 | 删除任务 |
| `note.manage` | `note_manage` | 写/删除 | 创建、更新、删除每日随笔 |
| `subject.list` | `subject_list` | 读 | 科目与统计 |
| `subject.get` | `subject_get` | 读 | 章节树、知识点和关联数据 |
| `subject.manage` | `subject_manage` | 写/删除 | 科目 upsert、更新、级联删除 |
| `chapter.manage` | `chapter_manage` | 写/删除 | 章节创建、重命名、换父级、删除 |
| `knowledge.manage` | `knowledge_manage` | 写/删除 | 知识点创建、更新、级联删除 |
| `library.list` | `library_list` | 读 | 文件夹树与目录内容 |
| `library.search` | `library_search` | 读 | 资料全文字段搜索 |
| `folder.manage` | `folder_manage` | 写/删除 | 文件夹创建、重命名、移动、删除 |
| `asset.import` | `asset_import` | 写 | 从白名单本地目录导入资料；远程 MCP 不提供 |
| `asset.manage` | `asset_manage` | 写/删除 | 文件重命名、移动、元数据、删除 |
| `activity.record` | `activity_record` | 写 | 学习时段、错题、复习、模考 |
| `mistake.list` | `mistake_list` | 读 | 到期、开放、已毕业错题 |
| `mock-exam.list` | `mock_exam_list` | 读 | 模考记录和统计 |

调用前可运行 `npm run ascend -- tools` 或读取 `ascend://capabilities` 获取机器可读的当前清单。

## Agent 推荐工作流

1. 调用 `status`，确认账号和日期。
2. 调用只读工具获取真实 ID；不要从名称猜 ID。
3. 向用户复述即将发生的结构性/破坏性变化。
4. 执行最小写操作。
5. 再次调用对应读取工具验证结果。
6. 删除时只有在用户明确同意后才传 `confirm=true`。

示例：用户说“把线性代数任务移到明天晚上八点”：

1. `task_list` 查询今天与明天。
2. 用返回的任务 `id` 调用 `task_update`，传 `day` 与 `scheduledStart=20:00`。
3. 再次 `task_list` 验证。

## 已知边界

- [KNOWN] 当前“日历”实体实际是 `day_tasks`，支持日期、开始时间、优先级和预计时长；还没有重复规则、结束时间、参会人、提醒或外部日历同步。不要把它描述成完整会议日历。
- [KNOWN] 资料支持查询、移动、重命名、元数据更新和删除；本地可按白名单路径导入。远程 MCP 暂不提供文件上传或二进制下载，上传请使用网页。
- [KNOWN] 错题、复习事件、学习时段和模考当前支持新增与查询，但原 repo 层尚无统一的更新/删除 API，因此 v0.2 没有绕过 repo 用裸 SQL 补“伪 CRUD”。
- [KNOWN] stdio 进程启动后身份固定；要切换账号需停止并以新的 `ASCEND_AGENT_EMAIL` 重启。
- [INFERRED] 工具数量继续增长前，应根据真实 Agent 调用日志评估合并/拆分，避免工具选择混淆。

## 下一阶段路线

### v0.2：补齐领域 CRUD 与可恢复删除

- 为错题、复习、学习时段和模考补 repo 层 update/delete。
- 对高风险级联删除增加预览（dry-run）与恢复/撤销，而不只是 `confirm=true`。
- 给资料增加安全下载资源、分页和更精确的搜索过滤器。
- 扩展 Agent 审计摘要，但继续使用字段白名单，禁止记录正文与凭据。

### v0.3：远程接入增强

- 第三方开放前升级为 OAuth 2.1 / PKCE，并增加反向代理限流与异常 token 告警。
- 增加 MCP 原生文件上传/下载能力，不接受服务器本地路径。
- 为写操作增加幂等键，避免 Agent 重试导致重复任务或记录。

### v0.4：Agent 产品化

- 提供工作流型工具，如“规划今天”“收集资料并归档”“生成周复盘”，但底层仍调用原子操作。
- 为写操作增加幂等键，避免 Agent 重试导致重复任务或重复记录。
- 用真实任务集做 MCP eval：工具选择正确率、参数错误率、误写率、确认遵守率和恢复成功率。
