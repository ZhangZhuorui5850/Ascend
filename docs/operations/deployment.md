# Ascend 日常部署

生产环境位于 `ssh friday`，应用目录为 `/opt/apps/ascend`，由 `compose.production.yml` 编排 Next.js 应用与 Caddy，站点为 <https://ascend.zhuorui.me>。

## 发布流程

```bash
ssh friday
cd /opt/apps/ascend
docker compose -f compose.production.yml exec -T app node scripts/backup-verified.mjs
git pull --ff-only
export ASCEND_APP_COMMIT=$(git rev-parse HEAD)
docker compose -f compose.production.yml up -d --build app
docker compose -f compose.production.yml exec -T app node scripts/verify-workspace-migration.mjs
docker compose -f compose.production.yml ps
curl -fsS https://ascend.zhuorui.me/api/health
curl -i -X POST https://ascend.zhuorui.me/api/mcp
```

`backup-verified.mjs` 应输出完整成功证据并写入 `_VERIFIED`。迁移验证应报告 `ok: true`、零无归属记录与零缺失文件。匿名 MCP 请求应返回 `401 Unauthorized`。

查看发布日志：

```bash
docker compose -f compose.production.yml logs --tail=200 app caddy
```

## 发布边界

- 生产数据与上传位于宿主机 `/opt/apps/ascend/data/`，备份位于 `/opt/apps/ascend/backups/`。
- 应用端口 `3000` 只在 Compose 网络中暴露，Caddy 提供公网 HTTPS。
- migration 追加后先完成已验证快照，再构建新应用镜像。
- Judge Worker 与 Gateway 使用独立安全边界，遵循 [Judge Gateway 手册](../security/judge-gateway.md)。
- 数据回滚使用与应用 commit、migration 版本匹配的快照，遵循 [备份恢复手册](./backup-restore.md)。

主机初始化、DNS、防火墙、证书与 systemd timer 安装见 [`deploy/README.md`](../../deploy/README.md)。
