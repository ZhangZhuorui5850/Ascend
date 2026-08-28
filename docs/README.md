# Ascend 文档索引

当前文档描述现行架构、产品和运维契约。`archive/` 保存带日期的计划、规格、报告、发布说明与调查记录；档案内容保留当时的版本、命令和判断。

## 阅读路线

| 任务 | 入口 |
| --- | --- |
| 修改代码 | [开发约束](./development.md) |
| 日常发布 | [部署流程](./operations/deployment.md) |
| 备份与恢复 | [备份恢复](./operations/backup-restore.md) |
| 故障与浏览器排查 | [故障排查](./operations/troubleshooting.md) |
| 算法训练 | [算法工作台](./features/algorithms.md) |
| Planner | [Planner 运维](./features/planner.md) |
| Agent / MCP / CLI | [Agent Interface](./features/agent-interface.md) 与 [自动生成操作表](./generated/agent-operations.md) |
| Judge 隔离 | [Judge Gateway 安全手册](./security/judge-gateway.md) |
| CSS 分层 | [CSS 架构](./css-architecture.md) |
| 指标口径 | [指标说明](./metrics.md) |

首次主机部署与基础设施配置保存在 [`deploy/README.md`](../deploy/README.md)。真实设备算法验收使用 [evidence 流程](./algorithm-real-device-acceptance.md)。

## 状态约定

- 当前：本索引直接列出的开发、功能、运维和安全文档。
- 生成：`docs/generated/`，由对应脚本更新并在 `npm run docs:check` 中检查漂移。
- 档案：`docs/archive/plans/`、`specs/`、`reports/`、`releases/` 与 `investigations/`。

`npm run docs:check` 校验当前文档中的 `npm run <script>`、全部本地 Markdown 链接、生成物漂移和技能镜像。档案保留历史命令语义，同时保持本地链接可达。
