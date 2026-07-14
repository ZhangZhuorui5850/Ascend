# Ascend（登峰）

日历驱动的多用户备考学习系统。每位普通用户拥有独立学习空间，管理员负责邀请、账号、容量和审计。每天从「今日工作台」开始，处理复习、错题、任务、资料、计划和复盘。

仓库已由 `zgca-workbench` 更名为 [`ZhangZhuorui5850/Ascend`](https://github.com/ZhangZhuorui5850/Ascend)。应用中仍保留 `ZGCA_*` 环境变量以及 `zgca_*` Cookie、浏览器存储和缓存键，作为已有部署与用户数据的兼容标识；它们不是当前产品名称。

> 想直接运行命令：先看 [操作速查表](./QUICKSTART.md)。完整生产运维说明见 [deploy/README.md](./deploy/README.md)。

## 主要功能

- `/`：考试倒计时、连续学习天数、今日任务和复习概览、科目进度。
- `/day/[date]`：到期复习、错题回炉、任务清单、随笔、总结、快速记录和当日资料。
- `/calendar`：月历热力视图，按日期进入工作台。
- `/subjects`：笔试与机试科目；知识体系支持章节、知识点、掌握度、真题标记和复习排期。
- `/assets`：资料库资源管理器，支持文件夹、搜索、上传、重命名、移动、删除和预览。
- `/mistakes`：错题回炉流程。
- `/analytics`：近七天统计、弱点优先级和科目进度。
- `/settings`：账户资料、头像、密码、登录设备、考试倒计时、每日复习上限、明暗模式和配色。
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

要求 Node.js 22。复制环境变量模板并设置普通引导账号与独立管理员账号；两个邮箱必须不同。

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
RESPONSIVE_AUDIT_URL=http://localhost:3105 npm run responsive:audit
```

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

## 代码结构

- `src/app/`：页面、Server Actions 和 API 路由。
- `src/components/`：工作台、导航、资料、设置和管理端组件。
- `src/lib/repo/`：按业务域拆分的数据访问层，所有普通业务查询带工作区边界。
- `src/lib/db.ts`、`src/lib/migrations.ts`：数据库初始化和版本化迁移。
- `scripts/`：备份、迁移验证、冒烟测试、响应式审计和多用户隔离审计。
- `proxy.ts`：请求入口的会话 cookie 检查；真实授权仍在页面、Action 和数据访问边界完成。
- `compose.production.yml`、`deploy/`：腾讯云生产部署与 Caddy 配置。

主要 API 包括文件上传与下载、头像读取和健康检查；写操作主要通过 `src/app/actions/` 中的 Server Actions 完成。

## 进一步阅读

- [操作速查表](./QUICKSTART.md)
- [Ubuntu 生产运维手册](./deploy/README.md)
- [升级说明](./docs/UPGRADE_BRIEFING.md)
