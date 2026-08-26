# Ascend（登峰）

日历驱动的多用户备考学习系统。每位普通用户拥有独立学习空间，管理员负责邀请、账号、容量和审计。每天从「今日工作台」开始，处理复习、错题、任务、资料、计划和复盘。

仓库已由 `zgca-workbench` 更名为 [`ZhangZhuorui5850/Ascend`](https://github.com/ZhangZhuorui5850/Ascend)。应用中仍保留 `ZGCA_*` 环境变量以及 `zgca_*` Cookie、浏览器存储和缓存键，作为已有部署与用户数据的兼容标识；它们不是当前产品名称。

> 想直接运行命令：先看 [操作速查表](./QUICKSTART.md)。完整生产运维说明见 [deploy/README.md](./deploy/README.md)。

Agent、MCP 与命令行接入见 [Ascend Agent Interface 手册](./docs/agent-interface.md)。

## 主要功能

- `/onboarding`：四步设置学习目标、主线科目、每周投入、考试日期和复习额度。
- `/`：学习目标、考试倒计时、连续天数、今日任务、复习概览和科目进度。
- `/day/[date]`：主动回忆、错题跨日回炉、积压分摊、任务、随笔、总结、关联知识点的快速记录和当日资料；手机端支持模块折叠。
- `/calendar`：月历与日程列表，按日期进入工作台；手机默认日程列表。
- `/subjects`：章节/知识点树、掌握度、真题标记、首次学习排期，以及复习提示和参考答案。
- `/assets`：列表/网格、图片预览、多选批量移动与删除、三路并发上传、系统拖放、元数据编辑和扩展搜索。
- `/mistakes`：错因分类、跨日两次通过的回炉流程。
- `/mock-exams`：模考成绩、能力拆分、趋势和薄弱项分析。
- `/analytics`：近七天统计、弱点优先级、模考摘要和科目进度。
- `/extensions`：启用、停用和排序经过仓库审查的内置扩展；停用保留数据并关闭入口。
- `/practice/algorithms`：本地题目导入、题库与题单、加密在线草稿、网盘附件、VS Code 同步、训练结果、错因与延迟复测；C++ 样例在本地 VS Code 执行，在线评测经独立 Judge Gateway 执行。
- `/settings`：账户、学习目标、科目、考试倒计时、复习上限、扩展、Agent 令牌、登录设备和外观。
- `/admin`：用户邀请、账号状态、密码重置、容量、只读工作区和审计日志。
- `/invite/[token]`：一次性邀请激活页面。

宽屏右侧、移动端抽屉中的收纳面板支持拖拽文件、粘贴截图，并为资料选择日期、科目、章节、知识点和文件夹。

## 技术栈

- Next.js 16.2.10（App Router、Server Actions、standalone 生产输出）
- React 19、TypeScript
- SQLite、better-sqlite3
- Vitest、Playwright
- Docker Compose、Caddy

## 本地开发

要求 Node.js 24（与 `package.json` 的 `engines` 一致）。开发模式未配置 `APP_ADMIN_EMAIL` / `APP_ADMIN_PASSWORD` 时，空库会自动创建管理员账号 `admin`、初始密码 `666666`，首次登录必须修改密码。该默认账号不会在生产模式启用。

如需同时引导创建普通账号，或覆盖开发管理员账号，请复制环境变量模板并设置普通账号与独立管理员账号；两个账号必须不同。

```bash
cp .env.example .env.local
npm install
npm run dev
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

打开 `http://localhost:3000`。完整的日常命令见 [QUICKSTART.md](./QUICKSTART.md)。

普通账号由 `APP_LOGIN_EMAIL` / `APP_LOGIN_PASSWORD` 引导创建，管理员由 `APP_ADMIN_EMAIL` / `APP_ADMIN_PASSWORD` 引导创建。管理员首次登录必须修改密码；账号写入数据库后，应从生产环境文件中删除两个引导密码变量并重建应用容器。

全新数据库会从内置 M1–M7 种子初始化知识地图。如果设置了 `ZGCA_SOURCE_ROOT`，并且目录中存在 `知识地图页面.html`，则优先从该文件抽取。

## 测试与验证

```bash
npm test                  # Vitest 单元测试
npm run lint              # ESLint
npm run build             # Next.js 生产构建
npm run verify:migration  # 工作区归属、关系和文件完整性
npm run verify:backup     # 数据库/附件 hash、引用关系、镜像与隔离恢复
```

端到端与响应式审计需要先启动测试服务：

```bash
npm run build
npm run start -- -p 3105
```

然后在另一个终端运行：

```bash
npm run smoke
npm run audit:multi-user
npm run audit:offline-review
PLUGIN_AUDIT_URL=http://localhost:3105 npm run audit:plugin-algorithms
RESPONSIVE_AUDIT_URL=http://localhost:3105 npm run responsive:audit
```

CI 使用 `npm run ci:e2e` 编排同一组审计。该命令默认拒绝本地数据目录和已有数据库，必须显式设置
`ASCEND_E2E_ISOLATED=1`、包含 `ascend-e2e` 的临时数据目录以及专用普通/管理员测试账号。
主分支运行 smoke、多用户、离线复习和 7 路由 × 3 关键视口审计；每日夜间构建运行完整
11 路由 × 8 视口矩阵。PR 只保留单测、lint、typecheck、build、依赖和迁移快速门禁。

PowerShell 设置响应式审计地址的写法为：

```powershell
$env:RESPONSIVE_AUDIT_URL = "http://localhost:3105"
npm run responsive:audit
```

## 生产部署

当前生产环境运行在北京腾讯云轻量应用服务器上：

- SSH：`ssh friday`（`friday@ssh.zhuorui.me`）
- 应用目录：`/opt/apps/ascend`
- 站点：`https://ascend.zhuorui.me`
- 编排：`compose.production.yml`
- 服务：单个 Next.js 应用容器，由 Caddy 提供 HTTPS 和反向代理

高频更新、日志、重启和检查命令见 [QUICKSTART.md](./QUICKSTART.md)，首次部署、防火墙、证书、备份和完整回滚流程见 [deploy/README.md](./deploy/README.md)。

生产端口 `3000` 只在 Compose 网络中暴露，不应直接开放到公网。

## 数据与备份

生产 Compose 使用宿主机绑定挂载：

```text
/opt/apps/ascend/data/           SQLite 与应用数据
/opt/apps/ascend/data/uploads/   用户上传文件
/opt/apps/ascend/backups/        数据与上传快照
```

容器内分别映射为 `/app/data`、`/app/data/uploads` 和 `/app/backups`。重建容器不会删除这些宿主机目录，但升级数据库前仍必须同时备份 SQLite 和上传文件。

数据库迁移通过 `schema_migrations` 版本化。迁移后必须运行 `npm run verify:migration`，确认输出中 `ok` 为 `true`、没有无归属记录且 `missingFiles` 为 `0`。

`npm run backup:verified` 依次创建快照、验证数据库/逐附件 hash/引用关系、检查镜像并执行隔离恢复，全部通过后写入含应用 commit、迁移版本和检查结果的 `_VERIFIED`。设置 `ZGCA_BACKUP_SUCCESS_URL` 后只在完整成功时发送 HTTPS dead-man 心跳；生产定时任务模板见 `deploy/systemd/`。

## 代码结构

- `src/app/`：页面、Server Actions 和 API 路由。
- `src/components/`：工作台、导航、资料、设置和管理端组件。
- `src/lib/repo/`：按业务域拆分的数据访问层，所有普通业务查询带工作区边界。
- `src/lib/plugins/`：受信任内置扩展的静态清单、运行时推荐和分析槽位；插件业务表仍由 `repo` 层访问。
- `src/lib/agent/`：MCP 与 CLI 共用的 Agent 身份解析、操作清单、安全规则和审计入口。
- `src/lib/db.ts`、`src/lib/migrations.ts`：数据库初始化和版本化迁移。
- `scripts/`：备份、迁移验证、冒烟测试、响应式审计和多用户隔离审计。
- `proxy.ts`：请求入口的会话 cookie 检查；真实授权仍在页面、Action 和数据访问边界完成。
- `compose.production.yml`、`deploy/`：腾讯云生产部署与 Caddy 配置。

主要 API 包括远程 MCP、文件上传与下载、头像读取和健康检查；网页写操作主要通过 `src/app/actions/` 中的 Server Actions 完成。

## 进一步阅读

- [操作速查表](./QUICKSTART.md)
- [Ubuntu 生产运维手册](./deploy/README.md)
- [Ascend Agent Interface 手册](./docs/agent-interface.md)
- [升级说明](./docs/UPGRADE_BRIEFING.md)
