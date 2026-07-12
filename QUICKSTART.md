# ZGCA 操作速查表

服务器命令在前，本地开发命令在后。生产部署的完整解释与首次安装步骤见 [deploy/README.md](./deploy/README.md)。

## 服务器：登录

```bash
ssh friday
cd /opt/apps/ascend
```

确认当前位置和关键文件：

```bash
pwd
ls -l compose.production.yml
```

## 服务器：安全更新

在 `/opt/apps/ascend` 中执行。先备份，再拉代码；不要跳过迁移校验。

```bash
docker compose -f compose.production.yml exec -T app node scripts/backup.mjs
git pull --ff-only
npm test
docker compose -f compose.production.yml build app
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml exec -T app node scripts/verify-workspace-migration.mjs
docker compose -f compose.production.yml ps
curl -fsS https://ascend.zhuorui.me/api/health
```

如果服务器没有安装宿主机 Node.js/npm，测试可在本地同一提交上先运行；服务器从上面命令中的 `docker compose ... build app` 继续。不要因为缺少 npm 而跳过备份。

仅重建并替换应用，不改 Caddy：

```bash
docker compose -f compose.production.yml build app
docker compose -f compose.production.yml up -d app
```

## 服务器：重启

重启全部服务：

```bash
docker compose -f compose.production.yml restart
```

只重启应用：

```bash
docker compose -f compose.production.yml restart app
```

如果修改了 `.env.production`，需要重新创建容器，而不是普通 restart：

```bash
docker compose -f compose.production.yml up -d --force-recreate app
```

## 服务器：状态与日志

```bash
docker compose -f compose.production.yml ps
docker compose -f compose.production.yml logs --tail=100 app caddy
docker compose -f compose.production.yml logs -f app
```

按 `Ctrl+C` 退出实时日志，不会停止容器。

健康检查：

```bash
curl -fsS https://ascend.zhuorui.me/api/health
```

备案期间需要检查 IP 临时入口时：

```bash
curl -kfsS https://82.157.141.186:8443/api/health
```

## 服务器：数据位置

```text
/opt/apps/ascend/                 项目代码与部署配置
/opt/apps/ascend/.env.production  生产环境变量（不要提交到 Git）
/opt/apps/ascend/data/            SQLite 与应用数据
/opt/apps/ascend/data/uploads/    用户上传文件
/opt/apps/ascend/backups/         备份快照
```

查看磁盘和目录大小：

```bash
df -h
du -sh data data/uploads backups
docker system df
```

## 服务器：手动备份

```bash
cd /opt/apps/ascend
docker compose -f compose.production.yml exec -T app node scripts/backup.mjs
ls -lah backups
```

备份必须包含 SQLite 和对应的 `uploads/`。同一块服务器磁盘上的备份不能替代异地备份。

## 服务器：基础回滚

回滚代码前先查看提交：

```bash
git log --oneline -10
```

不要直接执行 `git reset --hard`。如果回滚跨越数据库迁移，必须把数据库和上传目录一起恢复到同一份升级前快照。完整步骤见 [deploy/README.md 的 Rollback](./deploy/README.md#rollback)。

## 本地：首次运行

要求 Node.js 22。

macOS / Linux：

```bash
cp .env.example .env.local
npm install
npm run dev
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

打开 `http://localhost:3000`。

## 本地：日常开发

```bash
git pull --ff-only
npm install
npm run dev
```

`package-lock.json` 没有变化时，通常不必每次都执行 `npm install`。

## 本地：测试与构建

```bash
npm test
npm run lint
npm run build
npm run verify:migration
```

一次构建后启动生产模式：

```bash
npm run start
```

或者构建后立即启动：

```bash
npm run up
```

## 本地：冒烟、响应式和多用户审计

先启动测试服务：

```bash
npm run build
npm run start -- -p 3105
```

在另一个终端运行：

```bash
npm run smoke
npm run audit:multi-user
```

macOS / Linux：

```bash
RESPONSIVE_AUDIT_URL=http://localhost:3105 npm run responsive:audit
```

Windows PowerShell：

```powershell
$env:RESPONSIVE_AUDIT_URL = "http://localhost:3105"
npm run responsive:audit
```

## 常见错误

### Compose 文件不存在

正确文件名是单数 `production`：

```bash
docker compose -f compose.production.yml build
```

错误写法是 `compose.productions.yml`。

### Docker 构建很慢

查看完整进度：

```bash
docker compose -f compose.production.yml build --progress=plain app
```

- 卡在 `npm ci`：通常是依赖下载或依赖层缓存失效。
- 卡在 `npm run build`：Next.js 正在做完整生产编译。
- 不要为了普通更新添加 `--no-cache`，它会强制重做所有构建步骤。

### 服务启动后网站打不开

```bash
docker compose -f compose.production.yml ps
docker compose -f compose.production.yml logs --tail=200 app caddy
curl -kfsS https://82.157.141.186:8443/api/health
```

依次检查应用健康状态、Caddy 日志、腾讯云防火墙和域名解析。
