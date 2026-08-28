# Planner v2 运行说明

更新日期：2026-07-31

## 数据库

应用启动时按顺序应用追加迁移：

- `0018_planner_core`：清单、任务、日历、事件、标签、legacy task 投影。
- `0019_planner_recurrence_reminders`：重复任务系列、提醒、应用内通知、加密 Push 订阅。

迁移前执行 SQLite 在线备份。验证命令：

```bash
npm run verify:migration
node scripts/verify-planner-migration.mjs
npm run verify:backup
```

`day_tasks` 在 0018 后由三个数据库触发器保持只读。所有产品写入进入 Planner v2 repo。

## Reminder Worker

单批运行：

```bash
npm run worker:reminders -- --once
```

持续运行：

```bash
npm run worker:reminders
```

Worker 使用短租约领取到期提醒。进程重启后，过期租约可被新 Worker 重新领取；失败投递采用指数退避，最长六小时。应用内通知通过 `(workspace_id, reminder_id)` 唯一键保持幂等。

建议把持续模式放入 systemd、Docker sidecar 或同等进程守护器，并配置自动重启。

## Web Push 配置

运行环境变量：

```text
ASCEND_PUSH_ENCRYPTION_KEY=<32 字节随机值的 Base64>
ASCEND_VAPID_SUBJECT=mailto:ops@example.com
ASCEND_VAPID_PUBLIC_KEY=<VAPID public key>
ASCEND_VAPID_PRIVATE_KEY=<VAPID private key>
ASCEND_NOTIFICATION_PRIVACY=private
```

`ASCEND_PUSH_ENCRYPTION_KEY` 用 AES-256-GCM 加密 endpoint、P-256 key 与 auth secret。数据库只保存 endpoint SHA-256 和密文。`ASCEND_NOTIFICATION_PRIVACY=private` 使用锁屏隐私文案；显式设置为 `detail` 时展示实体标题与摘要。

失效 endpoint 收到 404 或 410 后进入过期状态。Service Worker 使用稳定 reminder tag，并把点击导航限制到同源相对路径。

## 时间与重复

- 定时任务与事件保存 UTC ISO 8601 瞬时值及 IANA 时区。
- 全天事件保存 `start_date` 与 exclusive `end_date_exclusive`。
- RRULE 保存 RFC 5545 规范化文本，范围查询最多展开 500 个实例。
- fixed schedule 系列按原墙钟时间推进。
- after completion 系列在完成后生成下一实例。
- `occurrence_key` 与 `entity_changes.op_id` 提供稳定幂等边界。

## 当前发布边界

- Phase 0 至 Phase 3 已通过阶段闸门。
- Phase 4 已具备迁移、展开、重复任务、提醒、加密订阅、Worker 和编辑入口。
- 重复系列“未来实例”分割与完整三范围编辑继续作为 Phase 4 闸门项。
- 真实 Push 网关演练需要部署环境 VAPID 凭据与浏览器 Push endpoint。
- Phase 5 的 Planner 离线 outbox、增量同步、FTS 搜索与智能排期保持排队状态。
- Phase 6 的七天 dogfood 需要连续运行窗口。
