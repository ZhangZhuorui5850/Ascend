# Ascend（登峰）常用命令

这里只保留日常最常用的命令。首次部署、备份恢复和故障排查见 [生产运维手册](./deploy/README.md)。

## 本地开发

首次运行：

```bash
npm install
```

开发模式未提供 `.env.local` 时，会创建管理员 `admin`，初始密码为 `666666`，首次登录必须修改。生产模式不会启用该默认账号。需要引导普通账号或覆盖管理员账号时，再复制 `.env.example` 为 `.env.local` 并修改其中配置。

日常启动：

```powershell
npm run dev
```

打开 <http://localhost:3000>。停止服务按 `Ctrl+C`。

## 检查代码

```powershell
npm test
npm run lint
npm run build
```

## Ascend CLI / MCP

先确保目标普通账号至少登录过一次；多账号环境必须指定邮箱：

```bash
export ASCEND_AGENT_EMAIL=owner@example.com
npm run ascend -- status --pretty
npm run ascend -- task.list --from 2026-07-19 --to 2026-07-26 --pretty
```

列出全部操作：

```bash
npm run ascend -- tools
```

远程接入：登录 Ascend，打开「设置 → Agent」，创建令牌，然后直接复制页面给出的 `codex mcp add` 命令。Agent 会通过 MCP 自动读取工具说明。完整权限和操作表见 [Agent Interface 手册](./docs/agent-interface.md)。

只想用生产模式在本机运行：

```powershell
npm run up
```

## 更新服务器

```bash
ssh friday
cd /opt/apps/ascend
docker compose -f compose.production.yml exec -T app node scripts/backup.mjs
docker compose -f compose.production.yml exec -T app node scripts/verify-backup.mjs
git pull --ff-only
docker compose -f compose.production.yml up -d --build app
curl -fsS https://ascend.zhuorui.me/api/health
```

## 查看服务器状态

```bash
docker compose -f compose.production.yml ps
docker compose -f compose.production.yml logs --tail=100 app caddy
```

持续查看应用日志：

```bash
docker compose -f compose.production.yml logs -f app
```

按 `Ctrl+C` 退出日志查看，不会停止服务器。

## 重要位置

```text
/opt/apps/ascend/          项目目录
/opt/apps/ascend/data/     数据库和上传文件
/opt/apps/ascend/backups/  备份
```

不要手动删除 `data/`。回滚、恢复备份、修改生产环境变量或网站打不开时，查看 [deploy/README.md](./deploy/README.md)。
