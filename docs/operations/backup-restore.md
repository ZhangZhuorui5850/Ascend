# Ascend 备份与恢复

生产备份同时覆盖 SQLite、uploads、manifest、逐文件哈希、引用关系和隔离恢复。宿主机目录为 `/opt/apps/ascend/backups/`，容器目录为 `/app/backups`。

## 创建并验证快照

```bash
ssh friday
cd /opt/apps/ascend
docker compose -f compose.production.yml exec -T app node scripts/backup-verified.mjs
```

成功快照包含 `_VERIFIED`，其中记录应用 commit、migration 版本、数据库检查、附件检查、镜像结果和隔离恢复结果。`ZGCA_BACKUP_SUCCESS_URL` 仅在全部检查成功后接收 HTTPS dead-man 心跳。

备份副本应进入独立故障域。挂载独立磁盘、NFS 或对象存储同步目标后，将容器路径配置为 `ZGCA_BACKUP_MIRROR_ROOT`，并使用相同设置运行验证器。

## systemd 定时任务

```bash
sudo install -m 0644 deploy/systemd/ascend-backup.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/ascend-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ascend-backup.timer
sudo systemctl start ascend-backup.service
sudo systemctl status ascend-backup.service --no-pager
systemctl list-timers ascend-backup.timer --all
sudo journalctl -u ascend-backup.service -n 100 --no-pager
```

验收证据包含 timer 状态、最近成功日志、`_VERIFIED`、健康检查中的备份字段、异地镜像证明与 dead-man 漏报测试。每季度执行一次完整应用隔离恢复。

## 恢复

先验证目标快照，再停止服务并同时恢复数据库与 uploads：

```bash
cd /opt/apps/ascend
docker compose -f compose.production.yml exec -T app \
  node scripts/verify-backup.mjs /app/backups/<known-good-snapshot>
docker compose -f compose.production.yml down
mv data "data.failed.$(date +%Y%m%d-%H%M%S)"
mkdir -p data
cp backups/<known-good-snapshot>/workbench.sqlite data/workbench.sqlite
cp -a backups/<known-good-snapshot>/uploads data/uploads
sudo chown -R 1001:1001 data
# 检出 backup-manifest.json 记录的应用 commit
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml exec -T app node scripts/verify-workspace-migration.mjs
curl -fsS https://ascend.zhuorui.me/api/health
```

保留 `data.failed.<timestamp>` 作为恢复前现场，待业务数据、上传附件、登录和健康检查全部核对后再安排清理。跨 schema 版本恢复使用快照记录的应用 commit 与 migration 版本。
