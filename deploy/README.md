# Ubuntu 24.04 production runbook

Target: Tencent Lighthouse in Beijing, Docker Compose, Caddy automatic HTTPS, SQLite + uploads on a persistent host volume.

## Before public launch

1. Finish the applicable ICP filing for the domain/website and keep the filing information available for the site footer if required.
2. In Cloudflare DNS, create `A ascend -> 82.157.141.186` as **DNS only** for the first certificate and origin test. Keep `ssh.zhuorui.me` DNS-only. The old `zgca.zhuorui.me` Tunnel record belongs to the former Mac mini setup and is not used by this deployment. After direct HTTPS is healthy, you may test switching the web record to **Proxied** for Cloudflare protection; use Full (strict) origin TLS and compare mainland latency before keeping it enabled.
3. In Tencent's firewall, allow TCP 22 only from trusted source IPs where practical, and allow TCP 80/443 plus UDP 443 publicly. Do not expose port 3000.
4. Replace password SSH login with an SSH key, then disable password authentication only after key login has been verified in a second terminal.

## First deployment

```bash
sudo mkdir -p /opt/ascend（原 zgca-workbench）
sudo chown "$USER":"$USER" /opt/ascend（原 zgca-workbench）
cd /opt/ascend（原 zgca-workbench）

# clone or upload the repository here, then:
cp deploy/env.production.example .env.production
chmod 600 .env.production
nano .env.production
mkdir -p data backups
sudo chown -R 1001:1001 data backups

docker compose -f compose.production.yml build
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml ps
docker compose -f compose.production.yml logs --tail=100 app caddy
curl -fsS https://ascend.zhuorui.me/api/health
```

Use different emails and different high-entropy passwords for the ordinary owner and Admin. Admin is a separate control-plane account and owns no learning workspace. After confirming the ordinary login and completing the forced first Admin password change, remove both bootstrap password variables (`APP_LOGIN_PASSWORD` and `APP_ADMIN_PASSWORD`) from `.env.production`; the password hashes are already in SQLite. Then recreate only the app container.

```bash
docker compose -f compose.production.yml up -d --force-recreate app
```

## Safe upgrade

```bash
cd /opt/ascend（原 zgca-workbench）
docker compose -f compose.production.yml exec -T app node scripts/backup.mjs
git pull --ff-only
docker compose -f compose.production.yml build app
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml exec -T app node scripts/verify-workspace-migration.mjs
curl -fsS https://ascend.zhuorui.me/api/health
```

Never upgrade without a consistent database + uploads snapshot. The migration verifier must report `ok: true`, zero invalid workspace rows, and zero missing files.

## Backup and restore

Run a daily root cron entry (03:20 Beijing time):

```cron
20 3 * * * cd /opt/ascend（原 zgca-workbench） && /usr/bin/docker compose -f compose.production.yml exec -T app node scripts/backup.mjs >> /var/log/zgca-backup.log 2>&1
```

Copy `backups/` to a different machine or object storage; a backup on the same 40GB disk is not disaster recovery. Before restore, stop the stack, move the failed `data/` aside, restore both `workbench.sqlite` and the matching `uploads/` directory, then start the previous known-good image.

## Capacity notes for this server

- 4 CPU / 4GB RAM is sufficient for the current single Next.js process and Caddy.
- The 3Mbps uplink is the main constraint. Keep upload size at 20MB and avoid serving large video files.
- The 40GB system disk must retain at least 8–10GB free for images, logs and safe SQLite operation. Review per-user quota before inviting many users.
- Configure Docker log rotation at the host daemon level and monitor `df -h`, container health, and backup success.

## Rollback

```bash
docker compose -f compose.production.yml down
mv data "data.failed.$(date +%Y%m%d-%H%M%S)"
cp -a backups/<known-good-snapshot> data
# check out the previous application commit/image
docker compose -f compose.production.yml up -d
```

Code rollback alone is not a database rollback. Restore the matching pre-migration data snapshot when reverting across schema versions.
