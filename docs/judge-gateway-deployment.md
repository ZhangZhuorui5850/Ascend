# Ascend 在线算法评测隔离部署门禁

状态：参考实现已进入仓库；未经过本文件全部门禁前，不得标记“在线 Judge 已上线”。

## 1. 信任边界

请求链固定为：

```text
浏览器 -> Ascend 主应用 -> Judge Gateway -> Judge0 API -> 隔离 Worker
```

- 浏览器永远拿不到隐藏输入、隐藏期望输出或隐藏用例 stdout；
- Ascend 主容器不编译、不解释、不执行用户代码；
- Gateway 只保存幂等键、源码哈希、状态和资源结果，不保存源码；
- 用户源码只在加密后的应用 blob 与发往 Judge 的短时请求中出现；
- 默认 `ASCEND_JUDGE_CODE_RETENTION_DAYS=0`，正式或样例评测进入终态后擦除密文；
- 若保留加密源码，备份恢复时必须通过独立密钥管理渠道恢复当前/历史代码密钥；SQLite 备份本身不能解密源码，密钥也不得进入备份包；
- 百炼、OpenJudge、洛谷在正式 API 与授权未确认前均保持“外链 + 用户记录”，不抓取、不代登录、不伪造平台验证。

## 2. 拓扑硬门禁

Gateway 与 Worker 至少部署在独立虚拟机或同等安全边界；不允许把 Worker 加进现有 `compose.production.yml`。

Worker 必须满足：

- 不挂载 Ascend SQLite、uploads、backups、环境文件或 Docker socket；
- 默认无公网出站，只允许控制面访问必要的内部端点；
- 非 root、只读根文件系统、临时文件系统、执行后销毁；
- 限制 CPU、内存、进程、文件、输出、磁盘与墙钟时间；
- 启用 cgroup、seccomp/AppArmor（或同等级）并做逃逸测试；
- 编译器镜像固定版本，保留 SBOM、漏洞扫描和补丁责任人。

单纯“放进 Docker”不构成足够的恶意代码安全边界。

## 3. Gateway 部署

可复现的隔离 staging 套件位于 `deploy/judge0-staging/`。它固定 Judge0
`1.13.1`，只绑定回环地址，把运行时网络设为 internal，并提供专用主机预检和运行时
拓扑证据。Judge0 官方 1.13.1 Compose 会以 privileged 运行 server 和 worker，
且官方发布说明要求 Ubuntu 22.04 与 cgroup v1，因此整个专用 VM 才是安全边界；
不得把它部署到 Ascend 正式机。

1. 在独立 Gateway 主机复制仓库的固定版本。
2. 从 `deploy/judge-gateway.env.example` 创建不入 Git 的 `deploy/judge-gateway.env`。
3. 用该 Judge0 实例的 `/languages` 结果填写语言 ID；不同实例和版本可能不同。
4. 使用 `deploy/judge-gateway.compose.example.yml` 构建并启动。
5. 仅在回环地址暴露 4100，由 Caddy/Nginx 或私网入口提供 TLS。
6. Ascend 主应用只配置 Gateway 的 HTTPS URL、专用 bearer token 和独立代码加密密钥。
7. 小规模试点阶段设置 `ASCEND_JUDGE_PILOT_REQUIRED=true`。用户先在扩展页明确
   申请，管理员再在用户管理页批准批次；未批准用户的提交与轮询由服务端拒绝，
   题目、提示和加密草稿继续可用。

参考 Gateway 提供：

- `POST /v1/submissions`：异步创建，要求 `Idempotency-Key`；
- `GET /v1/submissions/:id`：轮询标准化结果；
- `GET /health`：检查上游与本地队列；
- 64 KiB 源码上限、语言白名单、本地并发/日配额；
- Gateway bearer token 至少 32 字节；上游响应在流读取阶段按字节截断，不能以超大 JSON 消耗无限内存；
- 只在上游明确返回队列满时允许相同幂等键重试；网络结果不明时不自动重复创建。

Gateway 向 Judge0 明确发送以下硬限制，而不是依赖 Judge0 实例默认值：

- `max_processes_and_or_threads=1`；
- 每进程/线程时间与内存限制开启；
- 栈最多 64 MiB、可写文件最多 64 KiB、`number_of_runs=1`；
- `enable_network=false`；
- CPU、墙钟和内存上限来自经过目录验证的题目清单。

Gateway 基础镜像当前固定到 `node:24.18.0-bookworm-slim`。正式发布还必须在目标架构上
解析并记录镜像 digest、SBOM 与漏洞扫描结果，不能只依赖可变标签。

## 4. 上线前验证矩阵

必须在隔离环境留下证据：

| 类别 | 必测场景 | 通过条件 |
| --- | --- | --- |
| 正确性 | AC / WA / CE / TLE / MLE / RE | 状态映射稳定，资源值有界 |
| 保密 | 隐藏用例失败 | 浏览器、应用日志、Gateway DB 均无隐藏输入和答案 |
| 幂等 | 重复点击、超时重试、队列满 | 同一业务操作最多一个远端 submission 集合 |
| 隔离 | 死循环、fork bomb、超量输出、文件炸弹、非法 syscall | 被配额终止，不影响主应用与其他任务 |
| 网络 | 访问公网、内网、元数据地址 | Worker 请求全部失败 |
| 容量 | 队列满、Judge0 下线、慢轮询 | 快速失败/熔断，Ascend 页面仍可保存草稿 |
| 隐私 | 保留 0 天、非 0 天、导出、备份 | 删除策略、明文导出和密钥缺失状态符合说明 |
| 终端 | 手机、平板、桌面、PWA 恢复 | 草稿、步骤页、轮询和复盘均可恢复 |

隔离主机准备好后执行攻击审计：

```bash
ASCEND_JUDGE_ATTACK_CONFIRM=isolated-worker-only \
ASCEND_JUDGE_ATTACK_GATEWAY_URL=https://judge-staging.example \
ASCEND_JUDGE_ATTACK_GATEWAY_TOKEN='<dedicated-token>' \
npm run audit:judge-isolation
```

脚本默认拒绝运行；必须显式确认隔离环境，并拒绝 Ascend 正式域名。它覆盖正常
执行、死循环、内存耗尽、输出洪泛、网络访问、Ascend 数据卷探测、进程创建和
`ptrace`。任何探针后 Gateway 健康检查失败都判定为不通过。

完整 staging 顺序：

1. `ASCEND_JUDGE_HOST_CONFIRM=dedicated-disposable-vm npm run audit:judge-host`；
2. 按 `deploy/judge0-staging/README.md` 启动固定版本服务；
3. `ASCEND_JUDGE_STAGING_VERIFY=dedicated-vm-only npm run audit:judge-staging`；
4. 再运行 `npm run audit:judge-isolation`，不能跳过前三步直接执行恶意代码。

## 5. 发布判定

以下任一项未完成，就只能显示“Judge 尚未连接”：

- 题目与测试数据没有明确再分发许可；
- 独立 Worker 安全审查或逃逸测试未通过；
- 生产 Gateway 未启用 TLS、专用 token、配额和健康监测；
- 备份、导出、源码保留策略没有隐私审查；
- 真实设备与容量压测没有记录。
- 试点用户没有明确同意，或管理员未完成逐工作区批准；

参考 Gateway 是控制面样板，不是对生产沙箱安全的证明。

真实设备记录必须按 `docs/algorithm-real-device-acceptance.md` 执行，并通过：

```bash
ASCEND_DEVICE_EVIDENCE_CONFIRM=real-devices-observed \
  npm run audit:algorithm-devices -- /absolute/path/to/evidence.json
```

该验证器检查设备类别、流程、HTTPS、精确 commit 和截图哈希；它不能替代真实观察。
