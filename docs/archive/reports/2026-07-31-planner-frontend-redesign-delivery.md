# Ascend Planner 前端重设计交付报告

日期：2026-07-31  
执行计划：`docs/superpowers/plans/2026-07-31-planner-frontend-redesign.md`  
父计划：`docs/superpowers/plans/2026-07-31-advanced-calendar-tasks.md`  
结论：工程门禁与视觉整改主矩阵通过；完成审计补证后再进入用户确认

> 2026-07-31 视觉整改复核：双前导控件、原生白底字段、层级噪声、语言/日期漂移与固定层遮挡已关闭。60 个测试文件 / 393 项测试、lint、typecheck、生产构建、三视口主矩阵与六张 viewport 截图通过；证据见 `docs/screenshots/planner/after-upgrade/`。逐项完成审计正在补齐静态原型、Calendar 四视图、状态矩阵和软键盘占用证据；发布建议在这些证据与用户最终确认后恢复。

## 1. 交付结果

- [COMPUTED] Tasks 桌面端形成稳定三栏工作区，900px 使用右侧 Drawer，390px 使用键盘感知底部 Sheet。
- [COMPUTED] Calendar 桌面端保持 FullCalendar 主画布与单一上下文栏，900px 使用 Drawer，390px 默认议程并使用 Sheet 编辑。
- [COMPUTED] Motion 提供任务新增、完成、删除、重排和选中反馈；系统与应用内减少动效设置均可压缩位移语义。
- [COMPUTED] Base UI 承载 Drawer、Sheet、Dialog、Popover、Collapsible 和 Toast，焦点进入、Escape 关闭与触发器焦点归还通过三视口生产测试。
- [COMPUTED] FullCalendar 使用自定义任务、事件与里程碑内容，月/周/日/议程、日期 Popover、拖拽、缩放和点击式改期共享 Planner 写入结果语义。
- [COMPUTED] 任务与事件的传输失败、版本冲突、乐观回滚、删除撤销和 FullCalendar `revert()` 已覆盖测试与生产交互验证。
- [KNOWN] Planner v2 数据模型、Server Action、repo、`requireWorkspace()`、追加式迁移、workspace 隔离和乐观版本契约保持为写入边界。

## 2. 实现边界

### Tasks

- [COMPUTED] `PlannerTasksWorkspace` 负责页面状态与写入编排，Sidebar、Quick Capture、Batch Bar、Groups、Row、Inspector、Sheet、基础字段、排期、标签、提醒、重复和子任务分为独立组件。
- [COMPUTED] Inbox、Today、Upcoming、Anytime、Overdue、Waiting、Completed 和 Trash 使用同一视图模型。
- [COMPUTED] 任务行支持上下键移动、空格完成、Enter 打开；Quick Capture 与所有图标按钮具备稳定可访问名称。
- [COMPUTED] Inspector 的备注、标签、提醒、重复、子任务和系统信息采用渐进展开，常用字段保留在首层。

### Calendar

- [COMPUTED] `CalendarWorkspace` 负责状态与 Action 编排，Canvas、Toolbar、Overview、Context Rail、Composer、Inspector、Inbox、Agenda、Mobile Sheet、日期 Popover 和事件内容分为独立组件。
- [COMPUTED] 月格设置 `dayMaxEvents={2}`，高密度日期通过聚合入口保持格子可读。
- [COMPUTED] 移动议程通过 `buildCalendarAgendaRows()` 单次分组，并展开全天多日跨度。
- [COMPUTED] Toolbar 的创建、待排和视图按钮使用即时 `data-active` 反馈。

### 共享原语与样式

- [COMPUTED] `MotionProvider`、Planner Drawer、Popover、Collapsible、Segmented Control、Status Indicator 和 Toast 形成共享前端原语。
- [COMPUTED] Planner 样式集中于 `src/styles/planner/` 的 primitives、tasks、calendar 和 motion CSS Modules。
- [COMPUTED] 旧 Planner/Calendar 全局规则已完成收口，边界测试守护全局选择器与模块样式的单一来源。

## 3. 自动验证

| 验证 | 结果 | 直接证据 |
|---|---:|---|
| `npm test` | 通过 | 58 files / 376 tests |
| `npm run lint` | 通过 | exit 0 |
| `npm run typecheck` | 通过 | exit 0 |
| `npm run build` | 通过 | Next.js 16.2.12，10 个静态页面生成完成 |
| `npm run smoke` | 通过 | 32/32 生产 smoke |
| `npm run responsive:audit` | 通过 | 桌面、平板、手机与 PWA/焦点/溢出审计 |
| `npm run verify:migration` | 通过 | 2 users / 2 workspaces；全部 scoped tables 的 invalid workspace rows 为 0 |
| `npm run verify:planner-migration` | 通过 | legacy 任务 1，迁移 1，duplicate mappings 0，readonly triggers 3 |
| `npm run backup` + `npm run verify:backup` | 通过 | SQLite integrity `ok`，Planner 0018/0019 迁移均存在 |
| verify skill 生产交互链 | 通过 | 任务与事件全链、双 workspace、三视口、主题、reduce、RSC 回流 |

[COMPUTED] 最终生产构建耗时 12.2s；smoke 20.2s；响应式审计 20.8s；Light/Dark/reduce 三视口矩阵 15.4s；核心 Planner UI 交互链 19.4s。

## 4. 隔离实例证据

- [COMPUTED] 隔离根：`/tmp/ascend-planner-verify.TH5cx7`。
- [COMPUTED] 隔离生产端口：3123；验证结束后由执行者关闭。
- [COMPUTED] 迁移 workspace `workspace:legacy` 与新 workspace `workspace:verify-second` 同时存在。
- [COMPUTED] 两个登录用户分别创建 Planner 任务，数据库查询确认 workspace ID 分离；页面互查确认任务内容隔离。
- [COMPUTED] 迁移的 legacy day task 在 Planner v2 中保持唯一映射。
- [COMPUTED] 单次 RSC reload 后新任务保留一份持久实体。
- [COMPUTED] 任务验证覆盖到期日期、提醒、重复系列、外部版本提升后的完成回滚、删除与 Toast 撤销。
- [COMPUTED] 日历验证覆盖事件创建、月视图拖拽、周视图缩放、外部版本提升后的位置恢复、RRULE 与提醒。
- [COMPUTED] 390×844 验证任务与事件 Sheet 首字段自动聚焦、输入目标位于视口内、Escape 焦点归还。
- [COMPUTED] 浏览器 `pageerror` 与 console error 计数为 0。
- [COMPUTED] 最终备份快照位于 `/tmp/ascend-planner-verify.TH5cx7/backups-final/2026-07-31`，数据库大小 811008 bytes。

## 5. 响应式、主题与性能

| 视口 | Tasks 首屏 | Calendar 首屏 | 客户端脚本 |
|---|---:|---:|---:|
| 1440×1000 | 775–794ms | 806–819ms | 474KB |
| 900×1000 | 718–722ms | 724–750ms | 440KB |
| 390×844 | 656–685ms | 684–685ms | 440KB |

- [COMPUTED] Light 与 Dark 均覆盖三档视口，系统 reduced motion 与应用内 `data-motion="reduce"` 同时启用验证。
- [COMPUTED] Drawer/Sheet 首次交互为 77–100ms。
- [COMPUTED] 100 条任务负载下首屏 1170ms；连续 10 次完成最大视觉响应 10.9ms，连续 10 次删除 47.1ms，Long Task 为 0。
- [COMPUTED] 200 个当月事件下 Calendar 月视图首屏 766ms；O(n) 议程分组将同一负载的移动首屏压缩至约 750ms。
- [COMPUTED] 三档视口的水平溢出、无名称控件、移动输入字号、触控目标和焦点恢复问题计数均为 0。

## 6. 视觉证据

- [COMPUTED] 基线目录 `docs/screenshots/planner/before/` 包含 10 张桌面、平板、手机、空状态、错误和冲突截图。
- [COMPUTED] 完成态目录 `docs/screenshots/planner/after/` 包含 38 张截图。
- [COMPUTED] Tasks 完成态覆盖桌面三栏、平板 Drawer、移动 Sheet、Inbox、Today、Completed、Trash、提醒、重复、冲突、恢复、Light、Dark 和 reduce。
- [COMPUTED] Calendar 完成态覆盖桌面上下文栏、平板 Drawer、移动议程与 Sheet、月、周、日、议程、事件创建、事件详情、提醒、重复、待排任务、Light、Dark 和 reduce。

## 7. 风险与后续边界

- [KNOWN] 父计划 Phase 4 的“本次/未来/全部”系列编辑和真实 Push 网关演练仍由 Planner 内核计划管理。
- [KNOWN] 父计划 Phase 5 的全局搜索、IndexedDB 离线 outbox 与智能排期属于后续能力，它们将复用本次建立的 Workspace、Drawer、Sheet、Toast 和恢复语义。
- [INFERRED] 当前 440–474KB 客户端脚本满足个人工作区使用体验；未来加入搜索和离线编辑器时应继续记录路由资源增量。
- [INFERRED] 200 事件和 100 任务负载已覆盖当前 1–2 人产品规模；更长历史周期适合在范围 API 与虚拟化层继续扩展。

## 8. 发布状态

[COMPUTED] 工程门禁、视觉主矩阵和六张 viewport 截图人工复核均已通过；V-014/V-015 的主视口相交结果为零。[KNOWN] 静态原型、Calendar 四视图、状态矩阵和软键盘占用证据仍在补齐；补齐并获得用户确认前不恢复正式发布建议。
