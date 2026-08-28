# Ascend 算法训练升级目标完成度审计

日期：2026-07-26  
目标：版本收口、授权题库调研与 30–50 题试点题库、隔离 Judge 测试环境、
真实终端验收和小规模试点准备。

判定词：

- `PROVEN`：当前代码或运行证据直接证明；
- `PARTIAL`：可执行实现已存在，但要求范围大于现有证据；
- `EXTERNAL`：必须在独立主机、真实设备或真实用户环境取得；
- `MISSING`：尚无足够实现或证据。

## 1. 版本收口

| 要求 | 判定 | 当前证据 | 剩余 |
| --- | --- | --- | --- |
| 迁移边界 | PROVEN | 已应用 `0028` 未被修改；本轮准入复用 `workspace_plugins.config_json`，没有补改旧迁移 | 无 |
| 题库生成可复现 | PROVEN | `npm run catalog:generate`；公共目录与 Gateway JSON 同源测试 | 无 |
| 全量代码验证 | PROVEN | 以本报告最后一次全量命令结果为准：test、typecheck、lint、CSS audit、隔离数据 build、diff check | 无 |
| Git 分支与提交 | EXTERNAL | 当前环境不能写 `.git` 元数据，未创建分支、暂存或提交 | 恢复 Git 写权限后拆分并提交 |
| 生产发布 | EXTERNAL | 未部署；没有把脏工作树推到生产 | 独立 Judge 与阶段 0 证据通过后再发布 |

版本收口因此是 `PARTIAL`：代码层可复核，版本控制和发布状态尚未闭合。

## 2. 授权题库调研

| 要求 | 判定 | 当前证据 | 剩余 |
| --- | --- | --- | --- |
| 百炼/OpenJudge API 与授权 | PROVEN（未知边界） | 没有找到可验证的公开 API、OAuth、题面/测试再分发许可；代码保持外链 + 用户记录 | 若未来接入 B/C 档，必须取得平台书面能力与许可 |
| 自有题许可 | PROVEN | 30 题均标记 Ascend original、CC0-1.0、redistribution=true；自动测试拒绝缺许可题 | 商业发布前仍建议版权审阅 |
| 题目包结构依据 | PROVEN | 调研记录引用 ICPC/Kattis Problem Package Format，并在本地保存版本化 ref、限制、许可和用例可见性 | 后续可导出标准包，不是当前试点硬门槛 |
| 课程覆盖依据 | PROVEN | 依据 IOI syllabus 构建 6 个轨道；首版明确不宣称覆盖完整竞赛课程 | 试点后按错误与迁移样本修订 |

## 3. 30–50 题试点题库

| 要求 | 判定 | 当前证据 |
| --- | --- | --- |
| 数量 | PROVEN | 30 题 |
| 难度 | PROVEN | foundation 18、standard 12 |
| 测试 | PROVEN | 180 用例：60 公开、120 隐藏；每题至少 6 个 |
| 语言 | PROVEN | C++17、Python 3 |
| 教学支架 | PROVEN | 每题 L1–L4 提示、计划证据、信心、复盘 |
| 迁移设计 | PROVEN | 至少 8 个双题以上迁移家族，变式必须关联共享技能且来源题已独立 AC |
| 隐藏数据边界 | PROVEN（代码） | Gateway 只返回有限公开反馈；隐藏输入、期望输出和 stdout 有契约测试 |
| 真实错误解辨别力 | PARTIAL | 参考求解器和边界夹具已覆盖；尚未在真实 Judge 镜像上跑 mutation/错误解集合 |

题库门槛已经达到；真实编译器/运行时辨别力属于隔离 Judge 验收的一部分。

## 4. 隔离 Judge 测试环境

| 要求 | 判定 | 当前证据 | 剩余 |
| --- | --- | --- | --- |
| 主应用不执行代码 | PROVEN | 评测只经 Gateway 客户端；主容器无编译/执行路径 |
| Gateway | PROVEN（代码） | Bearer、幂等、异步 batch、64 KiB、语言白名单、并发/日配额、响应体上限 |
| 资源限制 | PROVEN（请求契约） | CPU 1s、wall 2s、128 MiB、stack 64 MiB、1 进程、64 KiB 文件、无网络 |
| 完整 staging 拓扑 | PROVEN（静态） | 固定 Judge0 1.13.1、Postgres 16.2、Redis 7.2.4、Gateway；回环端口、internal 网络、无 Ascend/Docker socket 挂载 |
| 主机预检 | PROVEN（代码） | 拒绝 macOS/容器/Ascend 正式机/非 Ubuntu 22.04/非 cgroup v1/不足 4C8G40G/弱 secret |
| secret 最小权限 | PROVEN（静态） | Compose 只把 Judge、DB、Redis、Gateway 各自所需变量交给对应服务 |
| 运行时拓扑证据 | EXTERNAL | `audit:judge-staging` 已实现但未在专用 VM 运行 | 记录版本、digest、worker、语言、内部网络与端口 |
| 恶意代码攻击矩阵 | EXTERNAL | `audit:judge-isolation` 已实现且默认拒绝误跑 | 在专用 VM 跑死循环、内存、输出、网络、数据卷、fork、ptrace |
| 完整 Judge 链 | EXTERNAL | `audit:judge-chain` 已实现 | 在隔离 Ascend 数据根完成登录→启用→样例→正式 AC→复盘 |

隔离环境是 `PARTIAL`：可复现配置和门禁已完成，运行时安全结论尚未取得。

## 5. 真实终端验收

| 要求 | 判定 | 当前证据 | 剩余 |
| --- | --- | --- | --- |
| 390×844 | PARTIAL | 响应式审计脚本覆盖托管编辑器、30 题和水平溢出；当前沙箱不能监听端口 | 在可监听环境实际运行 |
| 768×1024 | PARTIAL | 同上 | 在真实平板或等效浏览器实际运行 |
| 1440×900 | PARTIAL | 同上 | 实际运行 |
| iPhone Safari/PWA | EXTERNAL | 代码有 safe-area/PWA 基线，本轮无真实设备证据 | 安装、离线/恢复、草稿、轮询、复盘冒烟 |
| 交互可达性 | PARTIAL | UI 契约验证用户申请、管理员批准/暂停、草稿与提交门禁分离 | 浏览器键盘、触摸、焦点和错误恢复 |
| 证据完整性 | PROVEN（工具） | `audit:algorithm-devices` 要求三类真实设备、完整流程、HTTPS、精确 commit 和截图 SHA-256，并拒绝敏感字段 | 仍需真实观察者填写并通过验证 |

真实终端验收尚未完成，不能以 TypeScript、CSS 或源代码契约替代。

## 6. 小规模试点准备

| 要求 | 判定 | 当前证据 | 剩余 |
| --- | --- | --- | --- |
| 用户明确同意 | PROVEN | 同意版本、申请时间、审计日志；未勾选服务端拒绝 |
| 管理员批准/暂停 | PROVEN | 逐工作区、批次、审计；生产开关下服务端阻断提交与轮询 |
| 草稿降级 | PROVEN | 未获批或 Judge 故障时题目、提示和加密草稿仍可用 |
| 指标 | PROVEN（实现） | 首次独立 AC、延迟、迁移、复发、Brier、有效时长、Gateway P50/P95/失败 |
| 隐私阈值 | PROVEN | 少于 5 个实际提交工作区时跨工作区学习结果返回 null |
| 运行方案 | PROVEN | 阶段 0/1/2、5–20 人、纳排标准、题目分配、停止规则、每日/每周流程 |
| 真实阶段 0 | EXTERNAL | 尚未批准真实内部账号 | Judge 与终端验收后选 2–3 个内部账号 |
| 真实 5–8 人试点 | EXTERNAL | 尚未开始 | 阶段 0 无 P0/P1 后启动 |

试点“准备”已完成，试点“运行”尚未开始。

## 7. 总结判定

当前整体状态：`PARTIAL`，不能关闭目标。

已经完整达到：授权边界设计、30 题试点目录、插件/训练闭环代码、试点治理与运营准备、
隔离 staging 的静态可复现性。

必须取得后才能判定完成：

1. 专用 Ubuntu 22.04 VM 上的 host preflight、runtime evidence、攻击矩阵和 Judge chain；
2. 390/768/桌面浏览器以及真实 iPhone Safari/PWA 验收；
3. Git 分支/提交和受控发布；
4. 2–3 个内部账号阶段 0 运行证据，再进入 5–8 人试点。
