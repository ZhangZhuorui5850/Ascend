# Ascend 开发约束

本文件是代码修改前的常驻规则。领域设计、运维步骤和历史调查按任务从 [文档索引](./README.md) 加载。

## 架构边界

- Next.js App Router 与 React 源码位于 `src/`。页面和组件负责展示，Server Action 位于 `src/app/actions/`，业务写入由 application/repo 层完成。
- SQLite 访问集中在 `src/lib/repo/*.ts`，使用 prepared statement。
- 每个普通用户绑定独立 workspace。页面、Action、Agent 操作和 repo 查询均携带服务端解析的 `workspace_id`；客户端输入只表达业务实体 ID。
- 管理员属于控制面，普通学习数据属于 workspace 数据面；跨 workspace 操作保留审计记录。

## 数据与写入

- 新库结构由 `src/lib/db.ts` 建立，存量库由 `src/lib/migrations.ts` 迁移。
- 已提交 migration 保持内容和 checksum 稳定。架构演进只追加新 migration，并覆盖新库、逐版本升级和 workspace 隔离测试。
- 标准写路径为：客户端事件 → Server Action → `requireWorkspace()` / 管理员鉴权 → application/repo → SQLite。
- Action 返回 `{ ok, error? }`。结构性写入使用 `revalidatePath()` 失效全部读取路由；`router.refresh()` 只承担客户端主动重读当前 RSC 树。
- 乐观更新保持排序、版本字段和 repo 规则一致，失败时恢复客户端状态。

## CSS 边界

- token 位于 `src/styles/tokens.css`，跨页面规则位于 `globals.css` 与 `summit.css`，领域样式位于 `src/styles/domains/` 或 CSS Module。
- 颜色、间距和动效读取共享 token。新动效覆盖 reduced-motion 设置。修改全局层时运行 [CSS 架构检查](./css-architecture.md)。

## 分级验证

根据变更风险选择最小充分证据，并在交付记录中列出实际运行结果。

| 等级 | 适用变更 | 最低验证 |
| --- | --- | --- |
| L0 | 文档、注释、Git 元数据 | `npm run docs:check`（涉及 Markdown 时）与 diff 检查 |
| L1 | 单一模块、局部样式、低风险脚本 | 相关测试；按影响运行 lint 或 typecheck |
| L2 | 跨模块、共享组件、数据写入、migration | 相关测试、typecheck、lint、build；migration 追加时运行迁移验证 |
| L3 | 安全边界、备份恢复、高风险发布、用户明确要求的浏览器交互验收 | 按变更本身完成 L0–L2，再执行对应运维验证；明确要求浏览器验收时使用 `verify` 技能 |

日常发布继承被部署 commit 的变更等级，并追加 [部署手册](./operations/deployment.md) 的备份、构建、迁移与健康检查。安全边界、高风险迁移、备份恢复、Judge 隔离和真实设备证据使用对应安全手册的完整门禁。
