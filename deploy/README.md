# Ubuntu 24.04 production runbook

Target: Tencent Lighthouse in Beijing, Docker Compose, Caddy automatic HTTPS, SQLite + uploads on a persistent host volume.

Online algorithm judging uses a separate security boundary. See `docs/security/judge-gateway.md` for the reference topology and release gates. Daily releases use `docs/operations/deployment.md`; backup and restore use `docs/operations/backup-restore.md`.

## Before public launch

1. Finish the applicable ICP filing for the domain/website and keep the filing information available for the site footer if required.
2. In Cloudflare DNS, create `A ascend -> 82.157.141.186` as **DNS only** for the first certificate and origin test. Keep `ssh.zhuorui.me` DNS-only. The old `zgca.zhuorui.me` Tunnel record belongs to the former Mac mini setup and is not used by this deployment. After direct HTTPS is healthy, you may test switching the web record to **Proxied** for Cloudflare protection; use Full (strict) origin TLS and compare mainland latency before keeping it enabled.
3. In Tencent's firewall, allow TCP 22 only from trusted source IPs where practical, and allow TCP 80/443 plus UDP 443 publicly. Do not expose port 3000.
4. Replace password SSH login with an SSH key, then disable password authentication only after key login has been verified in a second terminal.

## First deployment

```bash
sudo mkdir -p /opt/apps/ascend
sudo chown "$USER":"$USER" /opt/apps/ascend
cd /opt/apps/ascend

# clone or upload the repository here, then:
cp deploy/env.production.example .env.production
chmod 600 .env.production
nano .env.production
mkdir -p data backups
sudo chown -R 1001:1001 data backups

export ASCEND_APP_COMMIT=$(git rev-parse HEAD)
docker compose -f compose.production.yml build
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml ps
docker compose -f compose.production.yml logs --tail=100 app caddy
curl -fsS https://ascend.zhuorui.me/api/health
curl -i -X POST https://ascend.zhuorui.me/api/mcp
```

第二条请求应返回 `401 Unauthorized`，证明远程 MCP 已上线且不会匿名开放。普通用户登录后可在「设置 → Agent」创建令牌；无需新增 Docker 服务或开放端口，Caddy 会把 `/api/mcp` 与其他 HTTPS 请求一起转发给 Next.js。

Use different emails and different high-entropy passwords for the ordinary owner and Admin. Admin is a separate control-plane account and owns no learning workspace. After confirming the ordinary login and completing the forced first Admin password change, remove both bootstrap password variables (`APP_LOGIN_PASSWORD` and `APP_ADMIN_PASSWORD`) from `.env.production`; the password hashes are already in SQLite. Then recreate only the app container.

```bash
docker compose -f compose.production.yml up -d --force-recreate app
```

## Safe upgrade

```bash
cd /opt/apps/ascend
docker compose -f compose.production.yml exec -T app node scripts/backup.mjs
docker compose -f compose.production.yml exec -T app node scripts/verify-backup.mjs
git pull --ff-only
export ASCEND_APP_COMMIT=$(git rev-parse HEAD)
docker compose -f compose.production.yml build app
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml exec -T app node scripts/verify-workspace-migration.mjs
curl -fsS https://ascend.zhuorui.me/api/health
curl -i -X POST https://ascend.zhuorui.me/api/mcp
```

升级后的 MCP 匿名检查仍应为 `401`。不要把用户 Agent 令牌写入 `.env.production`、日志或仓库。

Never upgrade without a consistent database + uploads snapshot. `verify-backup.mjs` must report `ok: true`, matching attachment hashes, zero DB—blob reference errors, and a successful isolated restore smoke. The migration verifier must report `ok: true`, zero invalid workspace rows, and zero missing files.

## Backup and restore

Install the versioned systemd unit and timer. This is a one-time host action; keep the source files in Git and
reinstall them after changing the unit:

```bash
cd /opt/apps/ascend
sudo install -m 0644 deploy/systemd/ascend-backup.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/ascend-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ascend-backup.timer

# Run once immediately and inspect machine-readable verification evidence.
sudo systemctl start ascend-backup.service
sudo systemctl status ascend-backup.service --no-pager
systemctl list-timers ascend-backup.timer --all
sudo journalctl -u ascend-backup.service -n 100 --no-pager
docker compose -f compose.production.yml exec -T app \
  node -e 'const fs=require("fs"),p=process.env.ZGCA_BACKUP_ROOT||"/app/backups";const n=fs.readdirSync(p).filter(x=>/^\\d{4}-/.test(x)).sort().pop();console.log(fs.readFileSync(`${p}/${n}/_VERIFIED`,"utf8"))'
```

The timer runs `backup-verified.mjs`: backup, mirror, verification and isolated restore are one ordered job.
`_VERIFIED` now records the application commit, migrations and individual check results. If
`ZGCA_BACKUP_SUCCESS_URL` is configured, the job POSTs to that HTTPS dead-man endpoint only after every check
passes; the URL is never printed. A failed backup or verifier therefore produces both a failed systemd unit and a
missing success heartbeat. `/api/health` reports the latest verified snapshot and its age; after observing the timer
for several days, set `ZGCA_REQUIRE_FRESH_BACKUP=1` to fail readiness when no verified snapshot is newer than
`ZGCA_BACKUP_MAX_AGE_HOURS`.

Copy `backups/` to a different machine or object storage; a backup on the same 40GB disk is not disaster recovery. For the built-in mirror hook, mount a different disk/NFS path into the app container with a Compose override, set that container path as `ZGCA_BACKUP_MIRROR_ROOT`, and run `verify-backup.mjs` with the same setting. Merely pointing the variable at another directory on the same host disk is not an off-site copy.

The production acceptance record must include:

- `systemctl list-timers ascend-backup.timer --all`;
- one successful `journalctl -u ascend-backup.service` run;
- the latest `_VERIFIED` JSON and `/api/health` backup fields;
- evidence that the mirror mount is a different failure domain;
- a dead-man test in which an intentionally missed schedule alerts;
- a quarterly isolated full-app restore record with snapshot, application commit, last migration, elapsed time and result.

Before restore, first verify the exact snapshot, then stop the stack and restore both the database and matching upload tree:

```bash
docker compose -f compose.production.yml exec -T app node scripts/verify-backup.mjs /app/backups/<known-good-snapshot>
docker compose -f compose.production.yml down
mv data "data.failed.$(date +%Y%m%d-%H%M%S)"
mkdir -p data
cp backups/<known-good-snapshot>/workbench.sqlite data/workbench.sqlite
cp -a backups/<known-good-snapshot>/uploads data/uploads
sudo chown -R 1001:1001 data
# check out/build the application commit recorded in backup-manifest.json
docker compose -f compose.production.yml up -d
```

## Capacity notes for this server

- 4 CPU / 4GB RAM is sufficient for the current single Next.js process and Caddy.
- The 3Mbps uplink is the main constraint. Keep upload size at 20MB and avoid serving large video files.
- The 40GB system disk must retain at least 8–10GB free for images, logs and safe SQLite operation. Review per-user quota before inviting many users.
- Configure Docker log rotation at the host daemon level and monitor `df -h`, container health, and backup success.

## Rollback

```bash
docker compose -f compose.production.yml down
mv data "data.failed.$(date +%Y%m%d-%H%M%S)"
mkdir -p data
cp backups/<known-good-snapshot>/workbench.sqlite data/workbench.sqlite
cp -a backups/<known-good-snapshot>/uploads data/uploads
sudo chown -R 1001:1001 data
# check out the previous application commit/image
docker compose -f compose.production.yml up -d
```

Code rollback alone is not a database rollback. Restore the matching pre-migration data snapshot when reverting across schema versions.
