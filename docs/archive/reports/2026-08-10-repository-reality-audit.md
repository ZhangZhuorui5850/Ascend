# Ascend Repository Reality Audit

日期：2026-08-10

分支：`codex/ascend-product-convergence`

基线：`eb152b7`（从 `codex/release-schema-planner-sync` 切出）

状态：Gate 1

## 1. 审计结论

### 1.1 总判断

- [COMPUTED] Ascend 当前工程基线健康：`npm test` 的 95 个测试文件、573 项测试全部通过，`npm run lint` 与 `npm run typecheck` 通过。
- [COMPUTED] 当前 Task 领域并未形成单一事实源。`day_tasks` 与 `planner_tasks` 都是可写表，并分别被高频产品表面直接读取。
- [COMPUTED] 当前兼容策略是 `day_tasks → planner_tasks` 单向镜像，不是无损适配器。源码明确标注 `Planner v2 → legacy` 不同步（`src/lib/repo/planner.ts:63-68`）。
- [COMPUTED] `/tasks` 使用 `planner_tasks`，首页与 `/day/[date]` 使用 `day_tasks`；Calendar 在无范围参数时临时拼接两个表，Analytics 与全局搜索仍主要读取 `day_tasks`。
- [COMPUTED] Planner-only task 在 Calendar 中被临时赋予 SQLite `rowid` 作为数字兼容 ID；Calendar 的完成、改期和删除仍调用只接受 `day_tasks.id` 的 legacy action。这不仅会失败，还可能在数值碰撞时修改错误的 legacy task。
- [COMPUTED] 任务学习语义已在 legacy `day_tasks` 上部分落地，但 Planner v2 不具备对应学习关联与完成证据模型；Planner v2 完成任务只改变状态，不产生学习活动或证据。
- [COMPUTED] Web、CLI/MCP 没有共享 Application Layer。CLI 与 MCP 共享 `agentOperations`，但 Web Server Actions 和 Agent 都直接编排 repo，且 Agent 同时公开 legacy `task.*` 与 v2 `planner.task.*` 两组可写操作。
- [COMPUTED] 当前 Universal Capture 实际是文件收纳器，只能上传 Asset；它不能从同一输入创建 Task、Mistake、Note 或 Study Evidence。
- [COMPUTED] 当前首页硬编码“任何到期复习都优先于任务”，不存在可解释、可测试的 Next Action Ranking Engine。
- [INFERRED] 在 Task canonical source 收敛前直接重做 Today 或 Analytics，会把现有分叉隐藏到新 UI 下，增加迁移与回归成本。因此 Gate 3 必须先于 Gate 4。

## 2. 审计方法与证据等级

- `[COMPUTED]`：来自当前分支源码、Git 状态、实际命令或测试结果。
- `[KNOWN]`：来自项目已冻结规则、正式 spec 或开发指南。
- `[INFERRED]`：基于当前事实做出的产品或架构推断，必须由后续实现/测试验证。

本审计以当前代码为准，不把历史交付报告当作现状。例如历史 Planner 报告记录过 `day_tasks` 只读触发器，但当前迁移 `0029_planner_legacy_dual_write` 已显式删除这些触发器（`src/lib/migrations.ts:855-863`）。

## 3. Source of Truth Matrix

| Domain | UI | Action / API | Application | Repo / Logic | CLI / MCP | DB | 当前判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Task create | `DayTasks`、`PlannerQuickCapture` | `addTaskAction`、`createPlannerTaskAction` | 缺失 | `repo/planner.addTask`、`repo/planner-tasks.createPlannerTask` | `task.create`、`planner.task.create` | `day_tasks` + 单向镜像；或只写 `planner_tasks` | 两个可写入口、两个事实源 |
| Task complete | `DayTasks` 完成证据面板、Planner row | `toggleTaskAction`、`updatePlannerTaskAction` | 缺失 | `toggleTask`、`updatePlannerTask` | `task.update(done)`、`planner.task.update(status)` | legacy 写 evidence/session；v2 只写 status | 行为不一致 |
| Reschedule | Day/Calendar、Planner inspector | `scheduleTaskAction`、`updatePlannerTaskAction` | 缺失 | `scheduleTask`、`updatePlannerTask` | legacy/v2 两组 update | legacy `day + scheduled_start`；v2 `due_* + scheduled_*` | Due/Schedule 语义分叉 |
| Study record | `QuickLog`、legacy task completion | `addStudySession`、`toggleTaskAction` | 缺失 | `createStudySession`、`toggleTask` | legacy task/study 操作 | `study_sessions` + legacy task evidence columns | 数据落库，但业务入口分散 |
| Mistake | `QuickLog`、Mistakes、Algorithm | `addMistake`、algorithm actions | 缺失 | `repo/reviews`、algorithm repos | Agent mistake/algorithm 操作 | `mistakes`、`review_events`、algorithm tables | 主表单一，编排分散 |
| Review | `ReviewQueue`、`MistakeReattempt` | `scoreReview`、`reattemptMistakeAction` | 缺失 | `repo/reviews` | Agent review 操作 | `review_events` + `knowledge_points`/`mistakes` 状态 | 事务较完整，但无应用命令 |
| Asset | `CapturePanel`、Library | `/api/assets`、library actions | 缺失 | `lib/assets`、`repo/library` | Agent asset 操作 | `assets`、`asset_links`、blob storage | 关联能力存在，入口与业务命令分离 |

## 4. Task 事实源审计

### 4.1 当前真实读路径

#### 首页 / Today 候选

`src/app/page.tsx:38-51` 调用 `listTasks()`，直接读取 `day_tasks`。首页状态与任务数量也由 `getHomeSnapshot()` 的 `day_tasks` 子查询产生（`src/lib/repo/stats.ts:70-96`）。

#### Day

`src/app/day/[date]/page.tsx:46-57` 通过 `getDay()` 与 `listTasks()` 获取 legacy DayTask；`src/lib/repo/days.ts:76-126` 再次确认 Day 的 task read model 来自 `repo/planner.listTasks()`。

#### Planner Tasks

`src/app/tasks/page.tsx:30-46` 直接调用 `listTaskView()` 读取 `planner_tasks`。

#### Calendar

`src/app/calendar/page.tsx:31-42` 调用无范围参数的 `listCalendarTasks()`。该函数：

1. 读取全部 `day_tasks`；
2. 读取 `legacy_day_task_id IS NULL` 的 Planner-only task；
3. 把 Planner-only task 映射成 `DayTask`，并用 `planner_tasks.rowid` 作为数字 `id`（`src/lib/repo/planner.ts:179-220`）。

这不是稳定领域 ID，也不是可写 compatibility ID。

#### Analytics / Search

- 首页 task count 与周容量读取 `day_tasks`（`src/lib/repo/stats.ts:79-82,145-152`）。
- 全局搜索 task 只查 `day_tasks`（`src/lib/repo/search.ts:129-167`）。
- 因此在 `/tasks` 创建的 Planner-only task 可能出现在 Calendar，却不会进入首页、Day、容量统计或搜索。

### 4.2 当前真实写路径

#### Legacy path

`src/app/actions/planner.ts` 的 create/update/complete/reschedule/delete 直接调用 `src/lib/repo/planner.ts`。每次 legacy task 写入后调用 `mirrorDayTaskToPlanner()`，将一部分字段 upsert 到 `planner_tasks`。

#### Planner v2 path

`src/app/actions/planner-tasks.ts` 直接调用 `src/lib/repo/planner-tasks.ts`，只写 `planner_tasks`。没有反向同步或 legacy projection rebuild。

#### Agent path

`src/lib/agent/operations.ts:242-391` 暴露 legacy `task.*`，`393-505` 又暴露 v2 `planner.task.*`。同一客户端可以用两套不同 ID、状态与删除语义操作“任务”。

### 4.3 P0 数据完整性风险

#### Calendar compatibility ID 可能命中错误记录

- [COMPUTED] Calendar 将 Planner-only task 的 `planner_tasks.rowid` 伪装成 `DayTask.id`。
- [COMPUTED] Calendar 的完成、删除、改期调用 `toggleTaskAction`、`deleteTaskAction`、`scheduleTaskAction`，这些 action 最终按数字 ID 查询 `day_tasks`（`src/components/calendar/CalendarWorkspace.ts:193-267`；`src/lib/repo/planner.ts:319-574`）。
- [INFERRED] 如果该 rowid 与某条真实 `day_tasks.id` 相同，用户操作 Planner-only task 时可能修改另一条 legacy task；若不相同则报“任务不存在”。

该风险必须用回归测试先复现并固定，再修改实现。

#### 镜像是有损的

legacy → v2 镜像仅复制 title、notes、subject、status、priority、day/schedule、estimated minutes、sort、completed time。它不复制：

- `knowledge_point_id`
- `activity_type`
- `completion_criteria`
- `source_type` / `source_id`
- `actual_minutes`
- `completion_output`
- planned/actual verification fields
- verification outcome

对应证据见 `src/lib/repo/planner.ts:69-139` 与 `src/lib/repo/planner.ts:247-316`。

#### 状态回写可能阻断 legacy 更新

- [COMPUTED] 在 `/tasks` 把 legacy 镜像设为 waiting/canceled/completed 不会更新 `day_tasks`；下一次 Day 写入会尝试把 Planner 状态覆盖回 open/completed。
- [COMPUTED] v2 把任务设为 canceled 时写入 `canceled_at`，但 legacy mirror 的 upsert 修改 status 时不清除 `canceled_at`（`src/lib/repo/planner.ts:105-120`）。这可能违反 `planner_tasks` 的 status/timestamp CHECK（`src/lib/migrations.ts:628-635`）并导致 Day 更新失败。
- [COMPUTED] legacy mirror 不调用 `refreshEntityReminders()`；只有 v2 update 调用（`src/lib/repo/planner-tasks.ts:312`）。从 Day/Calendar 改期后，Planner reminder 可能仍锚定旧时间。

#### 删除/恢复会产生 ghost task

- 在 `/tasks` 软删 legacy mirror 后，原 `day_tasks` 仍存在；下次 legacy 更新会以 `deleted_at = NULL` 复活 mirror。
- Day 硬删后再从 Planner Trash 恢复 mirror，不会重建 `day_tasks`。该行仍有 `legacy_day_task_id`，又不会被 Calendar 当作 Planner-only task 补入，因而可能只在 `/tasks` 可见。
- v2 purge 一个 mirror 不会删除 legacy row；后者下一次写入又会重建 mirror。

#### 迁移同样有损

`migrateLegacyDayTasks()` 只回填 Planner 核心字段（`src/lib/migrations.ts:1420-1485`）；legacy 学习字段仍留在 `day_tasks`。因此当前 planner task 记录不能独立表达其学习语义。

## 5. Task 语义差异

### 5.1 ID

- legacy：自增整数 `day_tasks.id`。
- v2：字符串 UUID `planner_tasks.id`。
- 桥接：`legacy_day_task_id` 可将 legacy 映射到 v2；Planner-only task 没有反向稳定 ID。

### 5.2 Status

- legacy：`done` 二值。
- v2：`open | waiting | completed | canceled`，并有 `deleted_at`。
- legacy projection 会把 waiting/canceled 都压成 `done = 0`，产生信息损失（`src/lib/repo/planner-tasks.ts:418-443`）。

### 5.3 Due 与 Schedule

- legacy 只有必填 `day` 和可选 `scheduled_start`。
- mirror 规则在有具体时刻时把 `day` 解释为 Schedule；没有具体时刻时把同一个 `day` 解释为 Due（`src/lib/repo/planner.ts:92-139`）。
- v2 独立保存 `due_date/due_at` 与 `scheduled_start_at/scheduled_end_at`。

同一个 legacy 字段随“是否填时刻”改变领域含义，不可作为长期 canonical contract。

Planner v2 action 也有输入组合风险：create 只传 `scheduledDate` 或只传 `scheduledStart` 时会静默得到空 schedule；update 只传半组字段时会清空已有 schedule（`src/app/actions/planner-tasks.ts:101-120,148-175`）。正式 application command 必须把 schedule 作为一个原子 value object 校验。

### 5.4 Completion

- legacy task 点击完成会先打开完整证据面板，用户再选择“仅标记完成”或“保存证据并完成”（`src/components/DayTasks.tsx:418-615`）。这不满足普通任务一击完成。
- legacy completion 可写 task evidence、可选 upsert `study_sessions`、可选安排复测（`src/lib/repo/planner.ts:319-433`）。
- v2 completion 只更新 status，并可能推进 recurring series（`src/lib/repo/planner-tasks.ts:209-317`）；它不会产生学习证据。

### 5.5 Delete

- Planner v2 使用 `deleted_at`、Trash、restore 与 purge。
- legacy Day delete 会先解除 `study_sessions.task_id`，随后硬删除 `day_tasks`，最后把镜像 Planner task 标记为 deleted（`src/lib/repo/planner.ts:564-573`）。
- Day UI 的确认文案写明“删除后无法恢复”；Planner UI 支持撤销与 Trash。

### 5.6 Reopen 与 Evidence

legacy task 取消完成时不会清理已有 evidence 字段；再次直接“仅标记完成”可能保留上一轮 evidence。当前没有 completion attempt/cycle 实体，因此无法准确表示多次完成、撤销与重新完成。

此外，同样的“关联知识点学习记录”存在语义分叉：QuickLog 的 `createStudySession()` 会调用 `markPointLearned()`，任务完成时的 `recordAsStudy` 只 upsert session，不更新知识状态或 review schedule（`src/lib/repo/reviews.ts:41-65`；`src/lib/repo/planner.ts:392-403`）。

## 6. Learning Evidence 审计

### 6.1 已经真实落地的字段

legacy task create/update/complete 的公开字段并非全部 silent drop：

- `knowledgePointId` 会校验并落入 `day_tasks.knowledge_point_id`；
- `activityType`、`completionCriteria`、planned verification 会落入 `day_tasks`；
- completion evidence 会落入 `day_tasks`；
- `recordAsStudy=true` 会 upsert `study_sessions` 并关联 legacy numeric task ID；
- 符合条件时可创建 `training_retest` task。

证据见 `src/lib/repo/planner.ts:247-433`。

### 6.2 未形成闭环的部分

- [COMPUTED] Planner v2 task 没有 `LearningTaskLink` 或对应字段。
- [COMPUTED] 没有正式 `learning_evidence` 表；task evidence 被塞在 legacy `day_tasks` 单行中。
- [COMPUTED] `study_sessions` 只复制 actual minutes 与 output，不复制 verification method/result/outcome。
- [COMPUTED] v2 completion 不会创建 `study_sessions`、review/retest 或 knowledge update。
- [COMPUTED] Analytics 主要消费 `study_sessions` 与 legacy task，因此无法看到 Planner-only task execution。
- [INFERRED] 当前设计无法无歧义表达一个 task 的多次执行尝试、撤销、复测与 evidence history。
- [COMPUTED] 已完成 legacy task 后再改标题、知识点、科目或日期，不会同步已有 `study_sessions`；取消完成也不会撤销 session。
- [COMPUTED] `study_sessions.task_id` 是 INTEGER，只能关联 legacy task，无法关联 Planner UUID。

### 6.3 Export / Backup 信息损失

- workspace export 导出 `planner_tasks` 而不导出 `day_tasks`，因此 task-level knowledge link、activity/source、actual minutes、completion output 和 verification 字段会丢失。
- export 的 `study_sessions` 读取模型没有 `task_id`；review export 没有 event type、operation ID 和 attempt evidence；knowledge point export 没有 `self_confidence`（`src/lib/repo/export.ts`）。
- [INFERRED] 在修复 export schema 与 restore 验证前，不能声称现有 Learning Evidence 可以通过备份完整恢复。

### 6.4 其他 silent drop / orphan 风险

- `addTaskAction` 公布 `plannedVerificationMethod`，但 `addTask()` 接受的是 `verificationMethod`；该公开字段在 create path 被静默忽略（`src/app/actions/planner.ts:35-53`；`src/lib/repo/planner.ts:247-264`）。create/update 对同一概念使用了不同字段名。
- Agent legacy `task.update` 的 update → schedule → toggle 是三个独立 repo 调用，不在同一事务；后一步失败时前面的写入不会回滚（`src/lib/agent/operations.ts:327-375`）。
- legacy task 传 `done=false` 同时携带新 evidence 会成功返回，但 SQL 保留旧 evidence，新输入被忽略。
- 删除 knowledge point/subject 时没有清理 `day_tasks` 与 `planner_tasks` 的对应引用，可能留下 orphan task link（`src/lib/repo/knowledge.ts:415-436,1016-1021`）。
- `createStudySession()`、`createMistake()` 只在传 knowledge point 时验证并推导 subject；只传 subject code 时可由非 UI 入口写入 ghost subject。
- `createReviewEvent()` 可插入不存在的 knowledge point ID，后续 knowledge state update 静默不发生。
- Point detail 当前不读取 `study_sessions` 或 task completion evidence，因此用户在知识点界面看不到相关学习执行记录。
- Asset 只有 Subject/Chapter/KnowledgePoint links，没有 Task/Evidence link；Asset 删除仍是硬删除。
- Asset 写 action/API 只失效 `/assets`，但 Asset 还显示在 Day、Subject、Point、Home/Analytics，跨视图 revalidation 不完整。

## 7. Web / CLI / MCP 一致性

### 7.1 当前结构

```text
Web Server Actions ───────────────→ repo
CLI ─→ agentOperations ───────────→ repo
MCP ─→ agentOperations ───────────→ repo
```

仓库中不存在 `src/lib/application/`。CLI 与 MCP 共享操作注册表，但 Web 没有共享相同业务命令。

### 7.2 可观察差异

- Web Planner create action 不暴露 repo/Agent 已支持的全部字段，例如 subject、完整 due instant/timezone 等。
- Agent 同时允许 legacy 与 v2 task write，调用者必须理解内部数据迁移状态。
- legacy `task.delete` 的描述声称移入 Planner 回收站，但实现先硬删 legacy row；Planner-only `planner.task.delete` 才是纯 v2 soft delete。
- Web 的 cache revalidation 属于 transport concern；业务事务、证据生成、复测安排等仍应下沉到共享 application command。

## 8. 产品与交互现状

### 8.1 日常入口竞争

侧栏同时提供“总览、任务、今日执行、学习日历”（`src/components/Sidebar.tsx:63-73`），四个入口都在回答“今天做什么”。TopBar 又使用“主页、今日工作台、日历、科目、统计”等另一套词（`src/components/TopBar.tsx:11-28`）。

移动底栏实际同时显示总览、任务、今日执行、学习日历、收纳、更多，共六项；`/tasks` 还缺少 TopBar route metadata，会回退成“登峰 / 学习工作台”。

### 8.2 首页债务优先

`src/app/page.tsx:62-70` 的状态机规定：只要存在任意到期 review/mistake，就进入 `due`，task 只有在 pending count 为 0 时才可能成为 NOW。该规则没有结合计划开始时间、考试紧迫度、延期、priority、可用时间等因素。

首页首屏之后仍包含 ledger、周容量、弱点、科目风险等多个信息区。它们都有数据价值，但与“现在开始一件事”的视觉优先级竞争。

### 8.3 Today 与 Day 未分离

`/day/[date]` 对今天与历史日期复用同一长页面。默认展开任务、复习、随手记、复盘，侧栏再展示 Quick Log、Asset、Activity Trail（`src/app/day/[date]/page.tsx:76-193`）。今天与历史仅在少量文案和 review queue 上分支。

### 8.4 Universal Capture 尚不存在

`CapturePanel` 的 submit 要求至少一个附件，并只 POST `/api/assets`（`src/components/CapturePanel.tsx:257-323`）。面板要求用户即时选择日期、科目、章节、知识点、文件夹和备注；不能接住纯文本 task/mistake/study note。

`Cmd/Ctrl+K` 只是搜索/导航菜单，其中“收纳资料”打开同一 Asset 面板（`src/components/CommandPalette.tsx:90-112,192-205`）。

### 8.5 Onboarding 价值延迟

当前 onboarding 是“目标 → 科目 → 节奏/复习容量/考试 → 确认”四步，结束后进入首页；它不创建用户今天的第一件真实任务（`src/components/OnboardingWizard.tsx`）。

### 8.6 Overlay 一致性

- Planner drawer/popover/toast 与全局 confirm 已采用 Base UI。
- Capture、Command Palette、移动端 More Sheet、移动导航仍是自定义 overlay。
- Capture 没有 focus trap、打开后的明确 initial focus、Esc close 与 trigger focus return；AppShell 只给移动侧栏注册 Escape（`src/components/AppShell.tsx:39-54,94-115`）。

### 8.7 响应式断点缺陷

- AppShell 在 ≤900px 把汉堡按钮切换为移动抽屉开关。
- CSS 在 ≤900px 隐藏 Sidebar，但恢复 `.sidebar.mobileOpen { display:flex }` 的规则只存在于 ≤820px 区间。
- [INFERRED] 821–900px 点击汉堡会出现 backdrop，但 Sidebar 仍不可见。这一断层应在大型导航重构前以行为测试固定并修复。

## 9. Autosave 与删除

### 9.1 DayJournal autosave

优点：显示 dirty/saving/saved/error，800ms debounce，blur 时尝试 flush（`src/components/DayJournal.tsx:7-49`）。

缺口：组件 unmount 只清 timer，不 flush dirty data（`:24-28`）；没有 `pagehide`/导航前 flush；没有对并发请求排序，较早响应可能覆盖状态；error 后没有显式 retry action。

状态文本没有 `aria-live`；保存失败后如果用户不再修改，blur 不会重试；`saveDayEntry()` 只失效 `/calendar`，但 `tomorrow` 还影响首页的昨日计划，遗漏 `/`。

### 9.2 删除语义

Planner task 已有 soft delete → toast undo → Trash → purge。Day task、Day note、knowledge、asset 等仍多为硬删除或“删除后无法恢复”。全局产品没有统一 trash contract。

## 10. Visual / CSS Reality

- [COMPUTED] `globals.css` 11,517 行，`summit.css` 2,472 行，tokens 600 行，Planner CSS modules 2,002 行；加上领域 CSS 后总量约 18,170 行。
- [COMPUTED] CSS 中 12px 出现 77 次、11px 61 次、10px 60 次、9px 33 次；还有 8–13.5px 的大量半像素规格。
- [COMPUTED] `font-family: var(--font-serif)` 出现 40 次，mono 21 次，sans 显式使用仅 4 次。
- [COMPUTED] 全局规则把全部 h1/h2/h3 强制为 serif，而不是“serif 仅限少量品牌标题”。
- [COMPUTED] `tokens.css` 与后置 `summit.css` 重复拥有 sidebar/topbar/content/radius/shadow 等基础 token；Capture、MobileNav、Card、Button、Header 等又有多轮覆盖。
- [COMPUTED] 尽管 motion token 已建立，global/summit 中仍存在裸 `cubic-bezier` 与裸 ms/ease，尚未满足项目动效守门规则。
- [INFERRED] 当前主要问题确实是 token 与层级治理，而不是缺少视觉装饰。

## 11. Dead / Stale / Misleading Surface

- `projectTaskToFullCalendar()` 仅被单元测试引用，生产 Calendar 没有使用 canonical PlannerTask projection。
- `listLegacyDayTaskProjection()` 只被迁移验证使用，不是 Day/Calendar 运行时适配层。
- 历史文档仍描述 legacy read-only trigger，但当前 trigger 已删除。
- `task.delete` 的 Agent 描述与实现的 legacy hard delete 行为不完全一致。

## 12. 测试覆盖判断

### 12.1 已有强项

- Repo、migration、planner recurrence/reminder、workspace isolation、review、asset、auth 有大量单元/集成测试。
- Planner 前端已有响应式、乐观更新、技术原语合同测试。
- 当前基线全部通过，适合作为大改造基线。

### 12.2 关键缺测

- 从 `/tasks` 创建后在 Today、Day、Calendar、Search、Analytics 的一致性。
- Planner-only task 在 Calendar 完成/改期/删除的目标 ID 正确性。
- 同一业务行为从 Web、CLI、MCP 发起的最终数据库等价性。
- task complete + evidence + reopen + re-complete 的历史语义。
- legacy data migration 到 canonical learning link/evidence 的无损性。
- DayJournal 在 debounce 未触发时导航/卸载的数据持久性。
- Capture 纯文本分类与 fallback 行为。
- 390px Today 首屏、键盘弹出、overlay focus return。
- 761/820/821/900/901/1179/1180px 的 Shell 与 Planner 断点边界。
- overlay 的真实 Tab/Shift+Tab trap、Escape、backdrop 与 trigger focus return；当前部分测试只是源码字符串断言。
- CLI/MCP integration 的 create/update/complete/delete 写操作；现有集成测试主要覆盖初始化/status。

## 13. P0 / P1 排序

### P0 — 数据可信度

1. 为 Calendar compatibility ID 风险补回归测试并修复。
2. 建立 `planner_tasks` 唯一 canonical write path。
3. 建立 LearningTaskLink / LearningEvidence，迁移 legacy 学习字段。
4. 建立 application commands，使 Web、CLI、MCP 共用业务事务。
5. 将 Today/Day/Calendar/Search/Analytics task read model 切到 canonical 数据。
6. 统一 task delete/restore，停止 legacy hard delete。
7. 修复 autosave unload/ordering/retry。

### P1 — 每日使用成本

1. `/` 收敛为 Today，成为唯一日常入口。
2. 导航收敛为 今天 / 计划 / 学习 / 复习 / 资料。
3. 普通 task 一击完成，evidence 渐进展开。
4. 建立 deterministic Next Action Ranking Engine。
5. Universal Capture 支持 task/mistake/study/note/asset。
6. Today 与历史 Day 分离，移动 Today 只保留执行/复习/记录。

## 14. Gate 1 退出条件

- [x] 已回答 Task 是否存在多个事实源：存在。
- [x] 已定位 ID/status/due/schedule/delete/complete/projection 分叉。
- [x] 已定位 learning fields 的真实落库与断链位置。
- [x] 已确认 Web/CLI/MCP 没有 Application Layer。
- [x] 已建立 Source of Truth Matrix。
- [x] 已记录 UX、visual、autosave、overlay 与测试缺口。
- [x] 基线 test/lint/typecheck 已通过。

Gate 2 可以开始，但 Gate 3 不应在正式设计冻结前修改业务源码。
