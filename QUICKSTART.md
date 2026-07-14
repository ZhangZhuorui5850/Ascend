# Ascend（登峰）常用命令

这里只保留日常最常用的命令。首次部署、备份恢复和故障排查见 [生产运维手册](./deploy/README.md)。

## 本地开发

首次运行：

```powershell
Copy-Item .env.example .env.local
npm install
```

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

只想用生产模式在本机运行：

```powershell
npm run up
```

## 更新服务器

```bash
ssh friday
cd /opt/apps/ascend
docker compose -f compose.production.yml exec -T app node scripts/backup.mjs
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
