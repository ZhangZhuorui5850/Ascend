# Ascend 高级日历与待办系统执行计划

日期：2026-07-31  
状态：实施中（Phase 0 至 Phase 3 闸门已通过；Phase 4 内核完成，闸门保持开放）  
目标用户：1–2 名个人用户，各自保留 workspace 数据边界  
预计投入：单名熟悉本仓库的全职工程师 10–15 周；第 5–7 周形成稳定核心版本

前端质量子计划：`docs/superpowers/plans/2026-07-31-planner-frontend-redesign.md`。该计划负责 Tasks 与 Calendar 的信息架构、响应式、弹层、语义动效、可访问性和视觉验收，并继续使用本计划的数据、Action、workspace 与迁移契约。

## 1. 决策摘要

Ascend 下一阶段集中建设自身的日历与待办内核，Apple、飞书与其他连接器进入内核稳定后的独立阶段。

本次升级采用以下产品与工程决策：

1. **任务与事件使用独立实体。** 任务承载完成、优先级、清单、到期、子任务和重复完成；事件承载时间占用、开始结束、全天、多日、地点和日历归属。
2. **任务到期时间与计划时间分离。** `due` 表示承诺边界，`scheduled_start/end` 表示实际安排。任务拖入日历只改变计划时间。
3. **统一时间轴组合任务块与事件。** Calendar 页面负责展示和排期，Tasks 页面负责收集、组织、筛选和完成。
4. **Planner v2 使用新表。** 现有 `day_tasks` 迁移到新模型并保持只读备份，避免让单日任务表继续承担收集箱、事件、重复和提醒语义。
5. **重复规则采用 RFC 5545 RRULE。** 这为高级重复、时区和未来 Apple/飞书连接器提供统一表达。
6. **提醒具备独立调度队列。** 前台提醒、Web Push、稍后提醒、失败重试和隐私显示策略共用一套提醒模型。
7. **离线数据进入 IndexedDB。** Service Worker 继续保持公共壳边界，私有任务、事件快照与 outbox 按 workspace 隔离。
8. **所有写入维持现有安全路径。** 客户端经 Server Action 或专用同步 API，调用 `requireWorkspace()` 后进入 repo；结构性写入统一 `revalidatePath`。

## 2. 当前实现评估

### 2.1 已有底座

- [COMPUTED] `CalendarView.tsx` 已接入 FullCalendar 6，具备月、周、日视图、移动端列表、日期弹层、拖拽改期、拉伸时长和当前时间指示。
- [COMPUTED] `day_tasks` 已保存标题、日期、开始时间、预计时长、优先级、科目、备注、完成状态和排序。
- [COMPUTED] `DayTasks.tsx` 与日历弹层已具备乐观添加、乐观完成、失败回滚和跨页面缓存失效。
- [COMPUTED] repo、Server Action、workspace 隔离、追加式 SQLite 迁移和内存数据库测试已经形成稳定约束。
- [COMPUTED] PWA 已有 manifest、Service Worker 生命周期和公共离线页；复习模块已有 workspace 隔离的 IndexedDB outbox 先例。
- [COMPUTED] Agent/CLI 已提供任务查询、创建、更新和删除能力；数据导出、首页统计、每日工作台均依赖任务数据。

### 2.2 结构缺口

- [KNOWN] 每条任务必须归属某一天，系统缺少真正的 Inbox、Anytime、Someday 和独立到期时间。
- [KNOWN] 当前“日历事件”是任务投影，考试节点保存在设置 JSON，系统缺少独立事件、日历和事件 CRUD。
- [KNOWN] 时间仅保存本地 `HH:mm`，系统缺少 UTC 瞬时值、IANA 时区、全天日期和多日边界。
- [KNOWN] 系统缺少重复规则、例外实例、提醒、子任务、任务清单、标签、搜索、回收站和版本冲突。
- [KNOWN] 日历页面一次读取 workspace 全部任务，数据增长后会扩大 RSC 与客户端渲染成本。
- [KNOWN] Service Worker 维持导航网络优先，任务与日历暂时没有离线快照和离线写入。
- [KNOWN] Agent 接口、导出、首页统计、每日页和学习连续天数直接依赖 `day_tasks`。

### 2.3 机会判断

- [INFERRED] 一到两人使用降低了共享权限、参会人、组织审批和连接器运营的优先级。
- [INFERRED] 收集、排期、执行、提醒、复盘形成完整闭环后，Ascend 本身即可承担主要个人计划管理。
- [INFERRED] 统一 Planner v2 内核会显著降低未来 Apple CalDAV、EventKit 和飞书 OpenAPI 连接器的映射成本。

## 3. 产品范围

### 3.1 完整核心范围

#### Tasks

- Inbox、Today、Upcoming、Anytime、Someday、Completed、Trash 智能视图。
- 自定义任务清单、颜色、排序、归档。
- 标题、富文本备注、科目、优先级、标签、预计时长。
- 独立到期日期/时间、计划开始/结束、全天计划块。
- 子任务，层级上限 3 层，父任务展示完成进度。
- open、waiting、completed、canceled 状态。
- 重复任务，支持按固定日期重复与按完成时间滚动重复。
- 单次提醒、相对提醒、稍后提醒。
- 软删除、恢复、30 天回收站清理。
- 批量完成、移动、改期、标签和删除。

#### Calendar

- 月、周、日、议程视图，移动端默认议程。
- 独立日历、颜色、隐藏/显示、默认日历。
- 普通事件、课程、考试、会议、专注块、里程碑类型。
- 定时、全天、多日事件。
- 地点、URL、备注、科目和关联资料。
- 重复事件与单次例外，支持“本次”“本次及以后”“整个系列”。
- 拖拽、缩放、复制、移动到其他日历。
- 重叠提示、日容量提示、工作时间和当前时间。
- 快速跳转日期、周起始日、24 小时制和时区设置。

#### 任务与日历联动

- 将任务拖入日历创建计划时间块。
- 拖动计划块只更新 `scheduled_start/end`，到期时间保持原值。
- 从日历移回待排区清除计划时间。
- 完成任务后计划块保留历史完成样式。
- 事件与任务块在统一时间轴中使用不同视觉语义。
- 考试设置迁移为 `event_kind=milestone` 的日历事件。
- 每日页继续显示当天计划任务，并增加当天事件摘要。

### 3.2 高级个人效率范围

- 确定性快速输入：识别日期、时间、时长、优先级、清单和标签，并在提交前显示解析预览。
- 工作时间与每日可用容量设置。
- 智能排期建议：依据到期时间、优先级、预计时长、工作时间和已有占用生成空档建议。
- 冲突检测：任务块与 busy 事件重叠、超过每日容量、跨越截止时间时给出提示。
- 全局搜索：任务、事件、备注、标签、清单、日历和科目。
- 键盘操作：新建任务、新建事件、搜索、跳转日期、移动选择、完成和关闭面板。
- 活动记录：创建、修改、完成、恢复和批量操作保留可读审计摘要。
- 数据导出：Planner v2 JSON、Markdown 和 ICS。

### 3.3 后置范围

以下能力建立在核心版本稳定和真实使用反馈之上：

- Apple、飞书、Google、Outlook 连接器。
- 多人共享日历、任务指派、参与人回复和评论。
- 邮件邀请、会议室和预约链接。
- AI 自动改写任务、自动拆解项目和全自动排期。
- 原生 Widget、Siri/App Intents 和桌面菜单栏应用。

## 4. 领域模型

### 4.1 领域关系

```text
workspace
├── task_lists
│   └── planner_tasks
│       ├── child tasks
│       ├── task_labels
│       ├── task_series
│       └── planner_reminders
├── planner_calendars
│   └── calendar_events
│       ├── event exceptions
│       ├── event labels
│       └── planner_reminders
├── planner_labels
├── planner_change_log
└── push_subscriptions
```

### 4.2 `task_lists`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | `crypto.randomUUID()` |
| `workspace_id` | TEXT FK | 所属 workspace |
| `name` | TEXT | 清单名称 |
| `color_token` | TEXT | 使用设计 token 名称 |
| `icon` | TEXT | Lucide 图标白名单键 |
| `sort_order` | INTEGER | 手工排序 |
| `is_inbox` | INTEGER | 每个 workspace 恰好一个 Inbox |
| `archived_at` | TEXT NULL | 归档时间 |
| `created_at` / `updated_at` | TEXT | 审计时间 |

约束：

- `UNIQUE(workspace_id, name)`。
- `UNIQUE(workspace_id, is_inbox) WHERE is_inbox=1` 使用部分唯一索引。
- 删除清单时任务移动到 Inbox，清单进入归档。

### 4.3 `planner_tasks`

| 字段组 | 字段 | 说明 |
|---|---|---|
| 身份 | `id`, `workspace_id`, `list_id` | UUID、隔离边界、清单 |
| 层级 | `parent_task_id`, `depth`, `sort_order` | 子任务最多 3 层 |
| 内容 | `title`, `notes`, `subject_code` | 标题、备注、学习上下文 |
| 状态 | `status`, `priority` | open/waiting/completed/canceled；P1/P2/P3 |
| 到期 | `due_date`, `due_at`, `due_timezone` | 日期型与时间型二选一 |
| 排期 | `scheduled_start_at`, `scheduled_end_at`, `scheduled_timezone`, `scheduled_all_day` | 实际时间块 |
| 估算 | `estimated_minutes` | 5–1440 分钟 |
| 重复 | `series_id`, `occurrence_key` | 重复系列与实例唯一键 |
| 恢复 | `deleted_at`, `completed_at`, `canceled_at` | 软删除和状态时间 |
| 并发 | `version`, `created_at`, `updated_at` | 乐观并发控制 |
| 迁移 | `legacy_day_task_id` | 原 `day_tasks.id` 唯一映射 |

关键约束：

- 所有 repo 查询同时带 `workspace_id`。
- `scheduled_end_at > scheduled_start_at`。
- `due_date` 与 `due_at` 采用互斥校验。
- `status=completed` 对应 `completed_at`。
- `UNIQUE(workspace_id, legacy_day_task_id)`。
- `UNIQUE(workspace_id, series_id, occurrence_key)`。

### 4.4 `planner_calendars`

| 字段 | 说明 |
|---|---|
| `id`, `workspace_id` | UUID 与隔离边界 |
| `name`, `color_token` | 名称和颜色 |
| `is_default` | 默认日历 |
| `visibility` | visible / hidden |
| `sort_order` | 展示顺序 |
| `archived_at` | 归档时间 |
| `created_at`, `updated_at` | 审计时间 |

每个 workspace 迁移时创建“个人日历”和“学习里程碑”两个默认日历。

### 4.5 `calendar_events`

| 字段组 | 字段 | 说明 |
|---|---|---|
| 身份 | `id`, `workspace_id`, `calendar_id` | UUID、隔离边界、日历 |
| 内容 | `title`, `description`, `location`, `url`, `subject_code` | 事件详情 |
| 分类 | `kind`, `busy_status` | event/class/exam/meeting/focus/milestone；busy/free |
| 定时 | `start_at`, `end_at`, `timezone` | UTC ISO 瞬时值与 IANA 时区 |
| 全天 | `start_date`, `end_date_exclusive`, `all_day` | 全天及多日日期语义 |
| 重复 | `recurrence_rule`, `recurrence_until` | RRULE 与查询优化边界 |
| 例外 | `recurring_event_id`, `original_start_at`, `exception_kind` | override/cancel |
| 恢复 | `deleted_at` | 软删除 |
| 并发 | `version`, `created_at`, `updated_at` | 乐观并发 |

关键约束：

- 定时事件使用 `start_at/end_at`；全天事件使用 `start_date/end_date_exclusive`。
- 全天结束日期采用 exclusive 语义，与 FullCalendar 和 iCalendar 对齐。
- 重复主事件保存 RRULE；例外事件保存原实例起点。
- 日历范围查询只返回可见范围内主事件、例外和展开实例。

### 4.6 重复任务

`task_series` 保存：

- `id`, `workspace_id`
- `rrule`, `timezone`
- `generation_mode`: `fixed_schedule` 或 `after_completion`
- `template_json`: 经过 Zod 白名单校验的任务模板快照
- `next_occurrence_at`
- `active`, `created_at`, `updated_at`

生成策略：

1. 系统仅提前生成下一条任务实例，避免无限物化。
2. `fixed_schedule` 按 RRULE 锚点生成。
3. `after_completion` 以完成时间为新锚点生成。
4. 每个实例使用 `occurrence_key` 保证幂等。
5. 编辑范围提供“本次”和“未来实例”；历史完成记录保持独立。

### 4.7 标签

- `planner_labels(id, workspace_id, name, color_token, created_at)`。
- `planner_task_labels(workspace_id, task_id, label_id)`。
- `planner_event_labels(workspace_id, event_id, label_id)`。
- 标签与资料库现有 `tags` 维持领域隔离，未来通过统一搜索组合展示。

### 4.8 提醒

`planner_reminders`：

- `id`, `workspace_id`
- `entity_type`: task/event
- `entity_id`
- `anchor`: due/scheduled_start/event_start/exact
- `offset_minutes`
- `exact_at`
- `channel`: in_app/web_push
- `status`: pending/leased/sent/failed/canceled
- `next_attempt_at`, `attempt_count`, `leased_until`
- `sent_at`, `last_error`
- `created_at`, `updated_at`

`push_subscriptions`：

- workspace、user、endpoint、P-256 key、auth secret、设备名、最近成功时间、失效时间。
- endpoint 与密钥使用应用层加密或受限数据库权限。

### 4.9 变更与冲突

现有 `entity_changes` 与 `conflicts` 作为基础设施继续演进：

- Planner 写入在同一事务记录 entity type、entity id、operation id、base version、patch 和精简 snapshot。
- 所有更新使用 `WHERE id=? AND workspace_id=? AND version=?`。
- 版本冲突返回最新快照和可读错误，客户端提供刷新与覆盖入口。
- 批量操作共享一个 operation group id。
- 正文和 Push 凭据从审计摘要中排除。

## 5. 时间、时区和重复规则

### 5.1 时间策略

- 数据库存储 UTC ISO 8601 瞬时值。
- 显示和编辑使用 workspace IANA 时区，默认 `Asia/Shanghai`。
- 全天对象保存日期字符串，保持跨时区稳定。
- 用户设置增加 `timezone`、`week_start`、`hour_cycle`、`working_hours`。
- 旧任务迁移使用 workspace 时区把 `day + scheduled_start` 转换为 UTC。
- 无开始时间的旧任务迁移为 `due_date=day`，计划时间保持空值。

### 5.2 依赖建议

- `rrule`：RFC 5545 重复展开。
- `date-fns` 与 `@date-fns/tz`：时区换算、范围和格式化。
- `web-push`：VAPID Web Push。

依赖进入代码前完成许可证、包体、Node 24 和 Next.js Server Component 兼容检查。

### 5.3 重复查询保护

- 仅展开当前视图范围与前后一天缓冲。
- 单个系列单次查询最多展开 500 个实例。
- RRULE 保存时校验频率、间隔、COUNT 和 UNTIL。
- DST、月末、闰年、跨午夜、全天多日进入固定测试矩阵。

## 6. Repo 与写路径

### 6.1 新模块

```text
src/lib/planner/
├── types.ts
├── validation.ts
├── time.ts
├── recurrence.ts
├── projection.ts
├── capacity.ts
└── quick-capture.ts

src/lib/repo/
├── planner-lists.ts
├── planner-tasks.ts
├── planner-events.ts
├── planner-reminders.ts
├── planner-search.ts
└── planner-sync.ts

src/app/actions/
├── planner-lists.ts
├── planner-tasks.ts
├── planner-events.ts
└── planner-reminders.ts
```

### 6.2 查询契约

- `listTaskView(scope, view, filters, cursor)`：Inbox、Today、Upcoming 等任务视图。
- `listCalendarRange(scope, start, end, filters)`：可见范围事件与任务块。
- `getTask(scope, id)` / `getEvent(scope, id)`：详情。
- `listDayPlan(scope, date)`：每日页任务与事件投影。
- `searchPlanner(scope, query, filters, cursor)`：全文搜索。
- `suggestSchedule(scope, taskIds, range, options)`：排期建议。
- 每个列表查询拥有硬上限、稳定排序和游标。

### 6.3 写入契约

- 创建接口接受 `clientMutationId` 并通过 `entity_changes.op_id` 幂等。
- 更新接口接受 `expectedVersion`。
- repo 在事务内完成实体写入、系列推进、提醒重建和变更日志。
- Action 返回 `{ok, entity?, conflict?, error?}`。
- `revalidatePlannerViews()` 统一失效：
  - `/`
  - `/tasks`
  - `/calendar`
  - 涉及日期的 `/day/[date]`
  - 相关 `/subjects/[code]`
- 高频完成、拖拽和快速添加使用本地乐观状态，客户端排序镜像 repo。

### 6.4 高频操作行为

| 操作 | 乐观行为 | 服务端行为 | 失败恢复 |
|---|---|---|---|
| 完成任务 | 即时勾选、保留位置 | 更新状态、生成下一重复实例、重建提醒 | 恢复勾选并提示 |
| 新建任务 | 即时插入草稿 | 幂等创建、返回 UUID/version | 恢复输入并移除草稿 |
| 拖入日历 | 即时生成时间块 | 写入 UTC 排期、重建提醒 | FullCalendar revert |
| 拖动事件 | 即时移动 | 更新单次或系列范围 | revert 并展示冲突 |
| 删除 | 即时退场、提供撤销 | 写入 `deleted_at` | 恢复原位置 |
| 批量操作 | 局部锁定所选项 | 单事务处理和统一 operation group | 整批恢复 |

## 7. 页面与交互

### 7.1 `/tasks`

桌面结构：

```text
左栏：智能视图 / 清单 / 标签
中栏：任务列表、分组、批量工具
右栏：任务详情检查器
```

移动结构：

- 顶部智能视图切换。
- 任务列表为主视图。
- 详情使用底部 Sheet。
- 批量模式进入独立工具栏。

核心行为：

- 顶部快速收集默认进入 Inbox。
- Today 同时包含到期、已排到今天和用户手工加入今天的任务。
- Upcoming 按日期分组。
- Anytime 展示开放且无到期、无排期任务。
- Someday 展示 waiting 或用户明确放入稍后范围的任务。
- Completed 按完成日期分组并支持恢复。
- Trash 支持恢复和永久清理确认。

### 7.2 `/calendar`

桌面结构：

```text
左侧 240px：小月历、日历开关、筛选
中央弹性区：月/周/日/议程时间轴
右侧 300px：待排任务与详情检查器
```

390px 移动端：

- 默认议程视图。
- 月视图作为日期导航。
- “任务”“事件”使用底部 Sheet 编辑。
- 待排任务通过底部抽屉进入。
- 主要触控目标至少 44px。

工具栏：

- 上一段、今天、下一段。
- 月/周/日/议程切换。
- 日期跳转。
- 新建任务、新建事件。
- 搜索和筛选。

### 7.3 编辑器

任务编辑器分区：

1. 标题与完成。
2. 清单、状态、优先级、科目、标签。
3. 到期、计划时间、预计时长。
4. 重复与提醒。
5. 子任务、备注、关联资料。
6. 活动记录与删除。

事件编辑器分区：

1. 标题、事件类型和日历。
2. 全天/定时、开始结束、时区。
3. 重复范围。
4. 地点、URL、忙闲、提醒。
5. 备注、科目、关联资料。
6. 活动记录与删除。

编辑器使用本地 draft，在保存按钮触发一次结构性写入；高频单值切换可独立乐观提交。

### 7.4 快速输入

第一版采用确定性语法：

- `明天 9:00`、`周五`、`8/15`
- `30m`、`2h`
- `!1`、`!2`、`!3`
- `@清单名`
- `#标签`
- `/event`、`/task`

输入下方显示结构化预览，用户确认后写入。解析器以纯函数实现并覆盖中文日期边界测试。

### 7.5 动效与可访问性

- 新动效使用 `--motion-*` token，只改变 transform 和 opacity。
- 完成勾选可以使用 `--motion-reward`；普通打开、拖拽和 hover 使用标准运动 token。
- `html[data-motion="reduce"]`、`prefers-reduced-motion` 和 View Transition 压制保持完整。
- FullCalendar 自定义元素具备键盘可达入口。
- Sheet、Dialog 和 Popover 管理焦点圈、Escape、焦点归还和 aria 标签。
- 颜色之外使用图标、线型、标签和文字区分任务、事件、完成与冲突。

## 8. 提醒与后台任务

### 8.1 服务端 Worker

新增：

```text
scripts/planner-reminder-worker.ts
src/lib/jobs/planner-reminders.ts
src/app/api/push/subscribe/route.ts
src/app/api/push/unsubscribe/route.ts
```

Worker 行为：

1. 每 30 秒领取到期提醒，使用 `leased_until` 防止重复领取。
2. 发送 Web Push 或写入站内提醒。
3. 成功标记 sent。
4. 失败按 1m、5m、30m、2h 退避。
5. 410/404 endpoint 标记失效。
6. Worker 重启后继续处理未完成提醒。

部署增加独立进程或 systemd service，并记录健康检查与最后成功扫描时间。

### 8.2 Service Worker

在现有 `public/sw.js` 增加：

- `push`：解析经过最小化的通知 payload。
- `notificationclick`：聚焦或打开 `/tasks?focus=...`、`/calendar?focus=...`。
- `pushsubscriptionchange`：引导页面重新注册。

Cache Storage 继续只保存公共壳；任务和事件正文进入 IndexedDB。

### 8.3 通知隐私

设置提供：

- 完整标题。
- 仅显示“有一项计划到时”。
- 当前设备关闭通知。

锁屏通知 payload 只包含展示所需字段和不可猜测的实体 UUID。

## 9. 离线与同步

### 9.1 IndexedDB

新增 `ascend-planner-v1`：

- `snapshots`：workspace + range 作为键。
- `entities`：任务、事件、清单、日历的最小快照。
- `outbox`：operation id、entity type、base version、patch、createdAt。
- `meta`：last sync cursor、schema version。

### 9.2 同步 API

```text
GET  /api/planner/sync?cursor=...
POST /api/planner/sync
```

- GET 返回 workspace 内增量变更和新 cursor。
- POST 接受有上限的操作批次，按 operation id 幂等。
- 每个操作经过 Zod、workspace、版本和字段白名单校验。
- 服务端返回 accepted、conflict、rejected 三类结果。
- 退出账号清理当前 workspace 的 Planner IndexedDB 数据。

### 9.3 离线体验

- 离线时 Tasks 和 Calendar 展示最近快照及明确状态条。
- 创建、完成、改期和编辑进入 outbox。
- 删除使用软删除操作进入 outbox。
- 联网后按创建顺序同步，冲突进入冲突面板。
- 重复系列编辑和永久删除保持在线操作。

## 10. 搜索、筛选与智能排期

### 10.1 搜索

优先使用 SQLite FTS5：

- `planner_search` 索引任务标题/备注、事件标题/描述/地点、清单、日历和标签。
- 迁移阶段验证运行环境 FTS5 能力。
- 搜索结果返回实体类型、标题、上下文片段、日期和跳转目标。
- 查询支持 `type:task`、`type:event`、`list:`、`calendar:`、`tag:`、`subject:`、`before:`、`after:`。

### 10.2 智能视图

智能视图由查询定义生成，保持零数据复制：

- Today：今天到期、今天排期、手工加入 Today。
- Upcoming：未来 30 天到期或排期。
- Overdue：到期已过且状态开放。
- Unscheduled：有预计时长且缺计划时间。
- High Priority：P1 开放任务。
- Waiting：waiting 状态。

### 10.3 排期建议

输入：

- 任务预计时长、优先级、到期时间。
- 工作时间、已有 busy 事件、已排任务。
- 最小时间块、块间缓冲、每日容量。

输出：

- 1–3 个候选空档。
- 每个候选展示日期、时间、剩余容量和选择理由。
- 用户明确点击后写入排期。

算法第一版使用确定性贪心：

1. 过滤到期前可用工作时段。
2. 扣除 busy 事件和锁定任务块。
3. 按连续长度、离截止时间、当天容量评分。
4. 优先完整块，随后提供可拆分建议。

算法以纯函数实现，测试覆盖边界；生成结果保留解释字段。

## 11. 数据迁移与发布

### 11.1 迁移编号

- `0018_planner_core`：新任务、清单、日历、事件、标签和索引。
- `0019_planner_recurrence_reminders`：系列、例外、提醒和 Push。
- `0020_planner_sync_search`：增量同步字段、FTS、冲突索引。

所有迁移只追加，checksum 规则保持现状。

### 11.2 `day_tasks` 迁移

迁移步骤：

1. 为每个 workspace 创建 Inbox 和默认日历。
2. 按 `legacy_day_task_id` 幂等复制旧任务。
3. `done=1` 映射 completed，保留 `done_at`。
4. `scheduled_start` 存在时生成 UTC 计划开始和结束。
5. `scheduled_start` 为空时把旧 `day` 映射为 `due_date`。
6. `subject_code`、priority、estimated minutes、notes、sort order 原样保留。
7. 运行字段级一致性检查。
8. 新代码统一读取 Planner v2。
9. `day_tasks` 保留只读，备份与恢复验证完成后进入历史表清理评审。

### 11.3 考试节点迁移

- 读取 `app_settings.examCountdowns`。
- 写入“学习里程碑”日历的全天 exam 事件。
- 名称、日期、科目和目标分数进入结构化字段或描述。
- 使用稳定迁移键避免重复生成。
- 设置页考试编辑器切换到事件 repo。

### 11.4 切换前验证

新增 `scripts/verify-planner-migration.mjs`，检查：

- workspace 数、任务数、完成数一致。
- 标题、科目、优先级、时长、日期和备注一致。
- 定时任务 UTC 往返到原日期与时间。
- 每个 workspace 具备 Inbox 和默认日历。
- 重复运行迁移保持行数稳定。
- 导出包含 Planner schema version。

生产切换前运行备份与恢复演练。

## 12. 现有调用面迁移

| 调用面 | 调整 |
|---|---|
| `src/app/page.tsx` | 首页 Today 查询切到 Planner v2 |
| `src/app/day/[date]/page.tsx` | 使用 `listDayPlan`，组合任务与事件 |
| `src/app/calendar/page.tsx` | 按可见范围加载；页面客户端按日期范围请求 |
| `src/components/DayTasks.tsx` | 改用 PlannerTask 投影与新 actions |
| `src/components/CalendarView.tsx` | 拆成 Planner Shell、Calendar、Inbox、Inspector |
| `src/lib/repo/stats.ts` | 完成任务统计切到 `planner_tasks` |
| `src/lib/repo/days.ts` | DayData 增加事件摘要 |
| `src/lib/repo/export.ts` | 导出新表、RRULE、提醒和日历 |
| `src/lib/agent/operations.ts` | 扩展 task 字段并增加 event/list/calendar 操作 |
| `docs/agent-interface.md` | 更新能力清单和已知边界 |
| `scripts/verify-workspace-migration.mjs` | 纳入新表隔离检查 |
| `src/components/CommandPalette.tsx` | 增加任务、事件、跳转日期和搜索命令 |
| `src/components/Sidebar.tsx` | 增加 Tasks 入口，维持 Calendar 入口 |

## 13. 分阶段实施

### Phase 0｜契约与原型（3–5 天）

实施状态：已完成（2026-07-31）。契约与原型见 `docs/superpowers/specs/2026-07-31-planner-v2-phase-0.md`；时间、RRULE、投影、FTS5、Web Push 和 20 个验收 fixture 已通过测试。

目标：冻结语义和高风险技术选择。

任务：

1. 为任务、事件、到期、排期、全天、重复和提醒写类型契约。
2. 用纯函数验证时区往返、RRULE 展开和 FullCalendar event projection。
3. 验证 SQLite FTS5、依赖兼容和 Web Push 本机链路。
4. 写 20 个代表性用户场景作为后续验收 fixture。
5. 确认桌面、390px 移动端线框和键盘路径。

退出条件：

- 时间与重复测试矩阵通过。
- 数据模型完成评审。
- 依赖和后台 Worker 运行方式确定。

### Phase 1｜Planner v2 数据与兼容层（1–1.5 周）

实施状态：已完成（2026-07-31）。`0018_planner_core`、四类 repo、legacy migration、兼容投影、导出 schema v2、workspace/备份/Agent 调用面与 parity verifier 已通过隔离数据验证。

任务：

1. 实现 `0018_planner_core`。
2. 新增列表、任务、日历、事件 repo 与 workspace 隔离测试。
3. 实现 legacy migration 和 parity verifier。
4. 新增 PlannerTask → DayTask 兼容投影。
5. 更新备份、导出和迁移验证。

退出条件：

- 旧任务字段级迁移一致。
- 新旧每日任务投影输出一致。
- 重复运行迁移保持幂等。

### Phase 2｜完整待办（1.5–2 周）

实施状态：已完成（2026-07-31）。`/tasks`、智能视图、清单、标签、三层子任务、独立到期与排期、批量操作、Completed/Trash、30 天清理、乐观回滚和 Planner v2 Agent task 契约已通过两个 workspace 隔离测试、类型检查、lint 与生产构建。

前端质量补充：视觉整改实现与主矩阵已通过（2026-07-31），完成审计正在补齐状态/软键盘证据。默认/批量任务行单一前导控件、共享 Planner 表单、Quick Capture、Sidebar、单列 Inspector、dirty 保存、Drawer/Sheet 回焦与 fixed/sticky 零相交均已通过三视口隔离生产验证；静态原型、空/密集/错误/冲突/恢复和软键盘占用证据完成后再进入用户最终确认。

任务：

1. 建立 `/tasks` 页面、智能视图、清单和详情检查器。
2. 完成 Inbox、到期、排期、子任务、状态、标签和批量操作。
3. 完成软删除、恢复和 Completed/Trash。
4. 迁移每日页、首页和训练任务入口。
5. 扩展 Agent task 契约。

退出条件：

- 用户可从 Inbox 收集、组织、安排、完成、恢复任务。
- Today、Upcoming、Anytime、Overdue 查询与日期边界一致。
- 两个 workspace 数据隔离测试通过。

### Phase 3｜完整日历（2–2.5 周）

实施状态：已完成（2026-07-31）。独立事件 CRUD、workspace 范围 API、任务/事件/考试统一投影、全天/多日/跨午夜、地点、类型、忙闲、拖拽缩放、响应式议程、Luxon IANA 时区和 Planner Agent event 契约已通过全量测试与生产构建。

前端质量补充：视觉整改实现与主矩阵已通过（2026-07-31），完成审计正在补齐状态/软键盘证据。Calendar 概览已收为文本摘要，工具栏降噪，Composer/Inspector/Inbox 复用共享 Planner 表单，待排任务按需展开；900px Drawer、390×844 Sheet、中文文案、日期格式、回焦和全局浮层零相交均已通过隔离生产验证。月/周/日/议程逐视图与空/密集状态证据补齐后再进入用户最终确认。

任务：

1. 拆分 `CalendarView`，建立范围查询和独立事件 CRUD。
2. 完成日历容器、事件类型、全天、多日、地点和忙闲。
3. 完成任务拖入/移出时间轴与事件拖拽/缩放。
4. 迁移考试节点。
5. 完成桌面三栏和移动议程/Sheet。

退出条件：

- 月、周、日、议程完成任务与事件统一展示。
- 任务到期与计划时间保持独立。
- 全天、多日、跨午夜和重叠场景通过验收。

### Phase 4｜重复、提醒与时区（2–2.5 周）

实施状态：部分完成（2026-07-31）。`0019_planner_recurrence_reminders`、事件范围展开、DST/COUNT/UNTIL/例外、fixed schedule / after completion 任务系列、提醒锚点与租约、失败退避、应用内通知、加密 Push 订阅、Service Worker、Worker 和任务/事件编辑入口已实现。完整“本次/未来/全部”系列编辑和真实 Push 网关演练继续作为闸门项。

任务：

1. 实现 `0019_planner_recurrence_reminders`。
2. 完成重复事件主项、展开与例外。
3. 完成 fixed schedule / after completion 重复任务。
4. 完成提醒编辑、Worker、Push 订阅、稍后提醒和重试。
5. 完成 workspace 时区、工作时间和 DST 测试。

退出条件：

- 重复系列三种编辑范围行为稳定。
- Worker 重启、重复领取和失效 endpoint 场景通过。
- 锁屏隐私模式与通知跳转通过。

### Phase 5｜搜索、离线与智能排期（2–3 周）

任务：

1. 实现 `0020_planner_sync_search`。
2. 建立 FTS、筛选语法和搜索结果跳转。
3. 建立 IndexedDB snapshot/outbox 与增量同步 API。
4. 完成确定性快速输入。
5. 完成容量、冲突和排期建议。

退出条件：

- 离线创建、完成、改期、重连和冲突处理通过。
- 10,000 条任务/事件下范围查询与搜索满足性能预算。
- 排期建议具备解释字段，用户确认后执行。

### Phase 6｜硬化与发布（1–1.5 周）

任务：

1. 补齐 E2E、键盘、减弱动效、触控、深色模式和响应式验证。
2. 执行备份、迁移、恢复、Worker 和 Push 演练。
3. 更新 Agent、导出、帮助文本和运行文档。
4. 隔离实例运行 7 天 dogfood，记录同步、提醒和重复问题。
5. 生成交付报告。

退出条件：

- 全部门禁通过。
- 7 天使用期间无数据丢失、重复提醒和重复实例。
- 阻断级缺陷清零。

## 14. 测试计划

### 14.1 Repo

- workspace 隔离覆盖每个新表和复合查询。
- 任务 CRUD、子任务层级、批量写入、软删除和恢复。
- 到期与排期分离。
- 事件定时、全天、多日和例外。
- RRULE daily/weekly/monthly/yearly、工作日、COUNT、UNTIL。
- 固定重复与完成后重复。
- reminder lease、重试、取消和幂等。
- expectedVersion 冲突。
- legacy migration 和考试迁移幂等。

### 14.2 纯函数

- 时区转换、DST、月末、闰年。
- FullCalendar 投影和 exclusive end。
- 快速输入解析。
- 智能视图分类。
- 排期空档与评分。
- 客户端乐观排序镜像 SQL。

### 14.3 Component

- Dialog/Sheet 焦点和 Escape。
- 乐观完成、添加、拖拽、删除与回滚。
- 系列编辑范围选择。
- 任务详情和事件详情字段联动。
- 移动议程和待排抽屉。
- 通知权限状态。

### 14.4 E2E

1. Inbox 创建任务 → 设置到期 → 拖入周视图 → 完成。
2. 创建多日考试 → 修改单次重复实例 → 删除未来实例。
3. 创建完成后重复任务 → 完成 → 生成下一实例。
4. 设置提醒 → Worker 发送 → 点击通知定位实体。
5. 离线创建与改期 → 重连 → 服务端一致。
6. 两设备修改同一任务 → 显示版本冲突 → 选择恢复。
7. 回收站恢复和永久清理确认。
8. Agent 创建/更新任务和事件 → Web 页面即时可见。

### 14.5 性能预算

- 可见范围首次 repo 查询：10,000 个实体数据集下 p95 ≤ 100ms。
- `/calendar` 服务器响应：本机生产构建 p95 ≤ 500ms。
- 月视图首屏渲染：桌面 p95 ≤ 1.5s。
- 拖拽、勾选和快速添加：视觉响应 ≤ 100ms。
- 搜索：10,000 个实体下 p95 ≤ 150ms。
- 单次范围查询展开实例 ≤ 2,000，总 payload ≤ 500KB。

## 15. 验收场景

### 15.1 日常使用

- 10 秒内把一条想法收入 Inbox。
- 30 秒内完成到期、清单、优先级和预计时长设置。
- 从待排区拖到日历后形成准确时间块。
- Today 同时呈现今天到期和今天计划的任务，并清晰区分来源。
- 完成任务后历史计划块保留完成状态。

### 15.2 高级日历

- 创建全天、多日、跨午夜、重复和带例外事件。
- 月、周、日与议程对同一实体展示一致。
- 调整单次重复实例不会改变其他实例。
- 改变未来系列后历史实例保持稳定。
- 切换时区后定时事件保持同一瞬时值，全天事件保持日期。

### 15.3 可靠性

- 迁移前后任务数、完成数和核心字段一致。
- Action 超时重试不会创建重复任务或事件。
- Worker 重启不会重复发送已确认提醒。
- 离线 outbox 重放保持幂等。
- 所有数据读取与写入受 workspace 隔离。
- 导出文件完整覆盖 Planner v2。

### 15.4 可访问性与设备

- 仅键盘完成创建、编辑、排期、搜索、完成和关闭。
- 390px 宽度无页面级横向溢出。
- 触控目标达到 44px。
- 减弱动效模式关闭位移动效。
- 深色与浅色皮肤保持文本、焦点和状态对比度。

## 16. 风险与控制

| 风险 | 影响 | 控制 |
|---|---|---|
| 新旧任务语义切换 | 首页、每日页、统计、Agent 和导出可能出现差异 | 一次性调用面清单、兼容投影、字段 parity verifier、生产备份 |
| RRULE 与时区边界 | 重复实例错日或重复生成 | RFC 表达、成熟库、实例唯一键、DST 固定矩阵 |
| FullCalendar 客户端体量 | 首屏和移动性能下降 | 范围查询、动态加载、议程默认、实例上限 |
| Push 运行依赖 | 漏提醒或重复提醒 | 独立 Worker、lease、幂等、健康检查、退避 |
| 离线冲突 | 两设备覆盖修改 | expectedVersion、冲突面板、字段级摘要 |
| 功能范围扩张 | 核心闭环延迟 | Phase 闸门、后置范围、每阶段独立可用 |
| 源码断言测试过多 | 重构自由度下降 | 关键行为转向 repo、纯函数和 Playwright E2E |

## 17. 工程门禁

每个 Phase 执行相关测试，最终执行：

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run verify:migration
npm run smoke
npm run responsive:audit
npm run verify:backup
node scripts/verify-planner-migration.mjs
```

最终使用隔离实例验证：

- 新 workspace。
- 从现有生产备份恢复的 workspace。
- 两个 workspace 并行操作。
- 桌面 1440px、平板 1024px、手机 390px。
- 在线、断网、重连、Worker 重启和 Push endpoint 失效。

交付报告使用 `[COMPUTED]`、`[INFERRED]`、`[KNOWN]` 标记证据。

## 18. 开工顺序

第一批开发严格按以下顺序执行：

1. 冻结 PlannerTask、CalendarEvent、时间和重复契约。
2. 写失败测试：迁移、workspace 隔离、到期/排期分离、全天 exclusive end。
3. 实现 `0018_planner_core` 与 repo。
4. 实现迁移 parity verifier。
5. 切换 Tasks 核心页面。
6. 切换 Calendar 范围查询与事件模型。
7. 进入重复、提醒、离线和智能能力。

第一个恢复点应包含：新表、迁移、repo、兼容投影、测试和迁移验证，保持 UI 行为与当前版本一致。第二个恢复点再引入 `/tasks` 与新的 Calendar 交互。
