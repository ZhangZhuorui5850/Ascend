# Judge0 1.13.1 isolated staging

This directory is for a dedicated, disposable Ubuntu 22.04 amd64 VM. Do not run it
on the Ascend application host.

## Why the VM is the boundary

Judge0 1.13.1 upstream runs both the API server and workers with
`privileged: true`. Its release procedure also requires Ubuntu 22.04 and cgroup
v1 (`systemd.unified_cgroup_hierarchy=0`). The staging VM must therefore contain
no Ascend database, uploads, backups, application secrets, Docker socket
consumers, or unrelated workloads.

The Compose file adds defense in depth:

- exact Judge0 version tag rather than `latest`;
- Judge0 and Gateway ports bound only to `127.0.0.1`;
- an `internal: true` runtime network, so containers have no normal Internet
  route;
- no Ascend host paths or Docker socket mounts;
- explicit CPU, memory and PID limits;
- a read-only, capability-free Gateway container.

These controls do not make a privileged container equivalent to a hardened
multi-tenant sandbox. The attack audit remains mandatory.

## 1. Prepare the host

Use an Ubuntu 22.04 amd64 VM with at least 4 vCPU, 8 GiB RAM and 40 GiB free
disk. Follow the upstream 1.13.1 GRUB requirement, reboot, and verify that
`/sys/fs/cgroup/memory` exists.

Install Docker Engine, the Docker Compose plugin, Git and Node.js. Clone the
Ascend repository at the exact revision under review.

## 2. Create secrets

```bash
cp deploy/judge0-staging/staging-secrets.env.example \
  deploy/judge0-staging/staging-secrets.env
chmod 600 deploy/judge0-staging/staging-secrets.env
```

Generate independent random values for Judge0 authentication, Redis, Postgres,
Rails and the Gateway. Do not reuse Ascend login, database, MCP, Caddy or backup
secrets. Compose uses this host-only file for interpolation; each container
receives only the variables it needs.

The example language IDs are not authoritative. They are checked against the
authenticated `/languages` response during verification.

## 3. Run the fail-closed host preflight

```bash
ASCEND_JUDGE_HOST_CONFIRM=dedicated-disposable-vm \
  npm run audit:judge-host
```

The command refuses macOS, containers, non-Ubuntu-22.04 hosts, cgroup v2,
insufficient capacity, an existing `/opt/apps/ascend`, weak/placeholder secrets,
public ports, external Docker networks and forbidden mounts.

## 4. Start staging

```bash
docker compose \
  -f deploy/judge0-staging/compose.yml \
  --env-file deploy/judge0-staging/staging-secrets.env \
  up -d judge0-db judge0-redis judge0-server judge0-workers

docker compose \
  -f deploy/judge0-staging/compose.yml \
  --env-file deploy/judge0-staging/staging-secrets.env \
  --profile gateway up -d gateway
```

Do not add public port mappings. Reach the Gateway through an SSH tunnel for
initial verification; add TLS/private ingress only after the attack audit passes.

## 5. Record runtime topology evidence

```bash
ASCEND_JUDGE_STAGING_VERIFY=dedicated-vm-only \
ASCEND_JUDGE_STAGING_REPORT="$PWD/judge-staging-evidence.json" \
  npm run audit:judge-staging
```

The evidence contains versions, image IDs/digests, worker availability, language
mapping, service health, internal-network state and loopback bindings. It does
not include environment values, source code or test data.

## 6. Run untrusted-code tests

Only after the topology verification succeeds:

```bash
ASCEND_JUDGE_ATTACK_CONFIRM=isolated-worker-only \
ASCEND_JUDGE_ATTACK_GATEWAY_URL=http://127.0.0.1:4100 \
ASCEND_JUDGE_ATTACK_GATEWAY_TOKEN='<gateway-token>' \
  npm run audit:judge-isolation
```

Then tunnel the staging Gateway to an isolated Ascend application instance and
run `npm run audit:judge-chain`, followed by the responsive and real-device
checks described in `docs/judge-gateway-deployment.md`.

## 7. Tear down

Preserve the redacted evidence report. Remove the disposable VM after the
assessment. Do not reuse its volumes or secrets for production.
