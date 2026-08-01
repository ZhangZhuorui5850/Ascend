# Ascend 高级日历与待办系统交付报告

日期：2026-07-31  
执行范围：Phase 0 → Phase 4 内核  
代码状态：本地 worktree，保持未提交

## 交付结论

- [COMPUTED] Phase 0、Phase 1、Phase 2、Phase 3 阶段闸门已通过。
- [COMPUTED] Phase 4 已交付追加迁移、重复展开、两类重复任务、提醒租约、应用内通知、加密 Push 订阅、Service Worker 与 Worker。
- [KNOWN] Phase 4 闸门保留两个发布项：系列“本次/未来/全部”完整编辑语义；部署环境真实 Web Push 网关投递。
- [KNOWN] Phase 5 与 Phase 6 保持排队状态。Planner 离线 outbox、增量同步、搜索、智能排期和七天 dogfood 属于后续执行范围。

## 数据与架构

- [COMPUTED] `0018_planner_core` 建立任务、事件、清单、日历和标签领域表。
- [COMPUTED] `0019_planner_recurrence_reminders` 建立 `task_series`、`planner_reminders`、`planner_notifications` 和 `push_subscriptions`。
- [COMPUTED] 任务与事件保持独立实体，范围视图通过 FullCalendar projection 汇合。
- [COMPUTED] Server Action 写路径统一经过 `requireWorkspace()` 与 repo；结构性写入统一失效首页、任务、日历和日期页。
- [COMPUTED] Planner 导出 schema 升级到 v3，包含任务系列、提醒和应用内通知；Push 密文保持在导出边界外。
- [COMPUTED] Push endpoint、P-256 key 和 auth secret 使用 AES-256-GCM 保存，endpoint 使用 SHA-256 作为去重键。

## 功能结果

- [COMPUTED] `/tasks` 提供 Inbox、Today、Upcoming、Anytime、Overdue、Waiting、Completed、Trash、清单、标签、三层子任务、批量完成/移动/删除、恢复与 30 天清理。
- [COMPUTED] 高频任务创建、完成、删除、恢复和批量操作具备乐观状态与失败恢复。
- [COMPUTED] `/calendar` 统一展示任务、定时事件、全天/多日事件与考试节点，支持月/周/日/议程、范围加载、创建、编辑、删除、拖拽和缩放。
- [COMPUTED] FullCalendar 使用 Luxon 具名时区插件；UTC 瞬时值、IANA 时区与日期型全天语义分离。
- [COMPUTED] RRULE 测试覆盖 DST、月末、闰年、COUNT、UNTIL、例外与 500 实例上限。
- [COMPUTED] fixed schedule 在 DST 后保持本地墙钟时间；after completion 在完成时生成下一实例。
- [COMPUTED] Reminder Worker 使用稳定租约、过期接管、指数退避和幂等应用内通知。
- [COMPUTED] Agent 接口已增加 Planner v2 task、calendar、event、task series 和 reminder 操作。

## 验证证据

- [COMPUTED] `npm test`：50 个测试文件，331 项测试全部通过。
- [COMPUTED] `npm run typecheck`：通过。
- [COMPUTED] `npm run lint`：通过。
- [COMPUTED] `npm run build`：Next.js 16.2.12 生产构建通过。
- [COMPUTED] `npm audit --omit=dev`：生产依赖 0 个已知漏洞。
- [COMPUTED] 隔离 Playwright：桌面 1440px、平板 1024px、手机 390px 的任务与日历均无横向溢出；移动端默认议程通过。
- [COMPUTED] 隔离 UI：任务创建、提醒创建、任务完成、重复全天多日事件创建通过。
- [COMPUTED] `npm run responsive:audit`：通过。
- [COMPUTED] `npm run smoke`：31 项通过。
- [COMPUTED] `npm run audit:multi-user`：9 项通过，跨 workspace 文件访问均返回 404。
- [COMPUTED] `npm run verify:migration`：两个 workspace、全部 Planner 表、关系与文件命名空间验证通过。
- [COMPUTED] `node scripts/verify-planner-migration.mjs`：通过。
- [COMPUTED] 生产数据在线备份副本迁移：11 条 `day_tasks` 对应 11 条 `planner_tasks`，重复映射 0，legacy 只读触发器 3。
- [COMPUTED] `npm run verify:backup`：SQLite integrity 为 `ok`，0018 与 0019 均存在。
- [COMPUTED] Reminder Worker：首轮领取 1 条并生成 1 条通知；第二轮领取 0 条；提醒状态为 `sent`。

## 风险与阻塞

- [KNOWN] 真实 Web Push 需要 `ASCEND_VAPID_SUBJECT`、`ASCEND_VAPID_PUBLIC_KEY`、`ASCEND_VAPID_PRIVATE_KEY` 和浏览器生成的有效 endpoint。隔离环境完成本地加密请求、订阅密文和失效 endpoint 代码路径验证。
- [KNOWN] 重复事件编辑当前覆盖主系列字段；“本次”和“未来实例”需要系列分割、例外创建及 COUNT 重算后关闭 Phase 4 闸门。
- [KNOWN] Planner 全域离线 outbox 与增量同步属于 Phase 5；当前离线能力继续覆盖既有复习模块。
- [KNOWN] 七天 dogfood 需要连续七天运行、重启与多设备观察窗口。
- [INFERRED] 当前 1–2 人规模下，SQLite workspace 索引、500 实例上限和单批 100 条提醒为稳定起点；Phase 5 的 10,000 条基准将验证容量预算。

## 运行建议

部署前配置 Push 加密键与 VAPID 凭据，使用进程守护器启动 `npm run worker:reminders`，执行一次隔离备份恢复演练。随后完成系列三范围编辑，关闭 Phase 4 闸门，再进入 Planner 离线同步与搜索。
