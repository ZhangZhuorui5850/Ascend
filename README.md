# ZGCA 学习工作台

日历驱动的多用户备考学习系统：每位普通用户拥有完全独立的学习空间，管理员只负责邀请、账号、容量与审计。每天从「今日工作台」开始，复习到期知识点、回炉错题、收纳资料、写计划和复盘。

## 页面结构

- `/`（主页）：实时时钟、考试倒计时（在设置里配置）、连续学习天数、今日任务/待复习概览、科目进度，一键进入今日工作台。
- `/day/[date]`（今日工作台）：待处理队列（到期复习 + 错题回炉，受每日上限控制）、可勾选的任务清单（带科目标签，未完成可一键顺延到今天）、随笔卡片（一个想法一张卡片）、晚间总结与明日第一步（自动保存）、快速记录、当日资料与轨迹。
- `/calendar`：月历热力视图，点日期进入当天工作台。
- `/subjects`：科目按笔试/机试分组（机制一致，仅类型标签区分）；`/subjects/[code]` 是知识体系的管理台——章节排序/重命名/删除，知识点的层级、真题标记、掌握度、复习排期，行内展开可查看关联资料、错题和复习记录。
- `/assets`：资料库资源管理器。URL 即路径（`?folder=`），支持新建/重命名/移动/删除文件夹，文件行内重命名/删除/拖拽移动、文件名搜索（`?q=`）、图片预览。
- `/mistakes`：错题本（今日待回炉 / 回炉中 / 已毕业）。
- `/analytics`：近七天统计 + 弱点优先级 + 科目进度。
- `/settings`：考试倒计时（最多 5 个）、每日复习上限。
- `/admin`：独立管理员控制台；邀请用户、停用/恢复账号、退出全部设备、重置密码、调整配额并查看审计日志。
- `/invite/[token]`：24 小时有效的一次性邀请激活页。

右侧收纳面板（宽屏常驻，窄屏抽屉）负责文件入库：拖拽/粘贴截图，选择日期、科目、章节、知识点和文件夹。

## 本地开发

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。普通账号由 `APP_LOGIN_EMAIL` / `APP_LOGIN_PASSWORD` 引导创建；独立管理员由 `APP_ADMIN_EMAIL` / `APP_ADMIN_PASSWORD` 引导创建。两个邮箱必须不同。

管理员首次登录必须更换正式密码。更换成功后从服务器 `.env.local` 删除 `APP_ADMIN_PASSWORD`，后续不会再用环境变量覆盖数据库中的密码。管理员在“用户管理”里创建邀请链接，并自行通过微信等渠道发送；系统不依赖邮件服务，数据库也不会保存邀请令牌明文。

全新数据库会自动从内置的 M1-M7 种子初始化知识地图；如果设置了 `ZGCA_SOURCE_ROOT` 且该目录下存在 `知识地图页面.html`，则优先从该文件抽取。

## 测试与验证

```bash
npm test              # vitest 单元测试（数据层 / 迁移 / 认证等）
npm run build         # 生产构建
npm run smoke         # Playwright 端到端冒烟（需先在 3105 端口启动：npm run start -- -p 3105）
npm run responsive:audit  # 响应式审计（RESPONSIVE_AUDIT_URL 指定地址）
npm run audit:multi-user  # Admin + 两用户隔离审计（MULTI_USER_AUDIT_URL 指定地址）
npm run verify:migration # workspace 归属、关系和文件完整性检查
```

## 生产运行与迁移

升级已有数据库前，必须先停止写入并同时备份 SQLite 与上传目录：

```bash
npm run backup
cp -a data "backups/pre-multi-user-$(date +%Y%m%d-%H%M%S)"
```

确认备份完成后再启动新版本。应用启动时会增量执行迁移；随后先登录一次普通引导账号，让系统认领原有数据，再运行：

```bash
npm run verify:migration
```

只有输出 `"ok": true`、`missingFiles: 0` 且没有无归属记录时才继续开放访问。若校验失败，停止新版本，保留失败现场，把 `data/` 移出工作目录并从升级前快照完整恢复数据库、WAL/SHM 和 `uploads/`，再启动旧版本；不要只回滚代码而继续使用已迁移数据库。

```bash
npm run build
npm run start
```

## Docker / Mac mini

第一次部署先准备本机环境文件：

```bash
cp .env.example .env.local
```

然后编辑 `.env.local`，至少设置普通引导账号和独立管理员的不同邮箱与高强度密码。

```bash
docker compose up -d --build
```

默认端口：`3000`。

默认持久化：

- `data/workbench.sqlite`（含 WAL）
- `data/uploads/<workspace>/blobs/`（按用户空间隔离的内容寻址文件存储）
- `backups/`

数据库迁移使用 `schema_migrations` 版本化和校验和。多用户迁移会重建部分唯一约束，并把旧数据及文件归入 legacy workspace；因此必须按上面的快照、校验和回滚流程操作。

### Windows 本机当服务器

1. 安装 Docker Desktop，并启用 WSL2 backend。
2. 在本仓库执行 `docker compose up -d --build`。
3. 本机访问 `http://localhost:3000`；局域网设备访问 `http://<本机局域网 IP>:3000`（必要时放行防火墙端口）。
4. 本地域名：hosts 加 `127.0.0.1 zgca.test` 后 `docker compose --profile proxy up -d --build`，访问 `http://zgca.test`。

Tailscale Serve 示例：

```bash
tailscale serve --bg 3000
```

## 备份

```bash
npm run backup
```

建议用 cron 或 launchd 每天跑一次，备份写到 `backups/YYYY-MM-DD/`。

## 代码结构

- `src/lib/repo/`：数据访问层，按域拆分；业务函数显式接收 `db` 和 `workspace scope`，Admin 服务集中在 `admin.ts`。
- `src/app/actions/`：Server Actions（`auth` / `day` / `knowledge` / `library`），页面里的全部变更走这里。
- `src/app/api/`：仅保留文件上传（`POST /api/assets`）和文件流（`GET /api/assets/[id]/file`）。
- `src/lib/db.ts` + `src/lib/migrations.ts`：建库、版本化迁移与知识结构回填。
- `proxy.ts`：边缘鉴权（cookie 存在性检查），真实校验在各页面/Action 内完成。
