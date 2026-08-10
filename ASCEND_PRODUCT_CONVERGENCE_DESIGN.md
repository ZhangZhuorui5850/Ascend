# Ascend Product Convergence Design

日期：2026-08-10

分支：`codex/ascend-product-convergence`

状态：Gate 2 设计冻结候选

依据：`ASCEND_CURRENT_STATE_AUDIT.md` 与 `docs/agent-development-guide.md`

## 1. Product North Star

Ascend 定位为：

> Personal Learning Execution System — 个人学习执行系统。

产品首要价值不是保存更多数据，而是让用户更快开始下一件有价值的学习行动，并以最低成本形成可用于调整下一步的证据。

North Star 行为指标：

1. 用户进入后 30 秒内开始或完成一个真实动作。
2. 80% 以上日常操作可从 Today + Capture 完成。
3. 同一 Task 从任意入口操作后，Today / Planner / Calendar / Agent / Analytics 的语义一致。
4. 普通 Task 一击完成；学习证据渐进展开。

非目标：

- 不推倒重写 Auth、Workspace、Planner、Knowledge、Review、Library、Backup、MCP。
- 不在本轮继续扩展 Admin、多用户、Theme、Animation、Extension、高级文件管理或新图表。
- 不用 LLM 决定基础 Next Action 排序。

## 2. Daily Core Loop

```text
Plan → Do → Capture → Verify → Review → Adjust
  ↑                                      │
  └──────────────────────────────────────┘
```

每个阶段的最小实体：

| 阶段 | 用户问题 | 主要实体 | 默认入口 |
| --- | --- | --- | --- |
| Plan | 我要什么时候做什么？ | PlannerTask / CalendarEvent | Planner |
| Do | 现在最值得做什么？ | NextAction / TodayItem | Today |
| Capture | 刚才发生了什么？ | CaptureIntent | Global Capture |
| Verify | 学会了吗？ | LearningEvidence | 完成后的渐进反馈 |
| Review | 需要复习或复测什么？ | ReviewCandidate | Today Review / Review |
| Adjust | 下一步怎样改？ | reschedule / retest / plan update | Today / Planner |

## 3. Information Architecture

### 3.1 一级导航

```text
今天  /          唯一日常入口
计划  /tasks     Task 主视图；Calendar 是计划视图
学习  /subjects  Subject / Chapter / Knowledge Point
复习  /review    Review + Mistake retest 执行入口
资料  /assets    Asset
```

次级入口统一进入“更多”：

```text
分析 /analytics
模考 /mock-exams
算法训练 /practice/algorithms
扩展 /extensions
设置 /settings
```

### 3.2 稳定路由策略

- `/` 直接成为 Today，不新增与它竞争的 `/today` 主路由。
- `/day/[date]` 保留为历史档案、补录和复盘；访问当天日期可引导回 `/`。
- `/calendar` 在 URL 上保留，信息架构上归属“计划”，与 `/tasks` 使用同一个 active nav 与共享 Planner shell。
- 旧链接保持可达，不通过一次大规模 URL 重写制造部署风险。

### 3.3 统一词典

| Canonical | 允许的说明性文案 | 禁止作为同义导航名 |
| --- | --- | --- |
| 今天 | Today | 主页、总览、今日执行、今日工作台 |
| 计划 | Planner | 任务系统、学习日历（一级） |
| 学习 | Knowledge | 科目、知识体系（一级并存） |
| 复习 | Review | 待处理、错题回炉（一级并存） |
| 资料 | Assets | 收纳、资料库（一级并存） |
| 分析 | Analytics | 统计、洞察（同一层并存） |

## 4. Today Design

Today 只保留四个主区块。

### 4.1 NOW

最高视觉权重，只展示一个 `NextAction`：

```text
NOW
红黑树删除操作练习
预计 45 分钟 · 20:00
因为：已排期且距离开始 15 分钟
[开始]
```

要求：

- 一个 strongest CTA；其他操作使用低权重链接。
- 推荐必须带 1–3 条人类可读 reason，不显示抽象总分。
- 空状态优先创建 25 分钟内的第一件事。

### 4.2 TODAY

统一 timeline 展示 PlannerTask 与 CalendarEvent，但保持不同实体与图形语义：

- 有 schedule 的 Task/Event 按时间排序。
- 无 schedule、但 Today due 的 Task 放“未排时”。
- 不把 Due 渲染成虚假的时间占用。
- checkbox 仅适用于 Task；Event 没有完成状态。

### 4.3 REVIEW

只显示 summary 与一个入口：到期知识点数、Mistake retest 数、预计用时。展开执行进入 `/review` 或 Today 内专注状态，不在首页铺开完整 review system。

### 4.4 CAPTURE

Today 固定显示 `+ 记录`。桌面支持 Cmd/Ctrl+K，移动端使用底栏主按钮。所有入口打开同一个 Global Capture primitive。

## 5. Planner Design

### 5.1 Canonical entity

`planner_tasks` 是唯一 Task identity、状态、Due、Schedule、List、Series、Reminder 与 Trash 事实源。

```text
PlannerTask
├─ identity / hierarchy / list
├─ title / notes / subject
├─ status / priority
├─ Due (commitment boundary)
├─ Schedule (execution allocation)
├─ recurrence / reminders
└─ deleted_at / version / audit
```

### 5.2 View model

Planner 提供：Inbox、Today、Upcoming、Anytime、Overdue、Completed、Trash、Calendar。Waiting/Canceled 可保留为过滤器，不与高频视图争夺视觉权重。

### 5.3 Due / Schedule contract

Application 层只接受原子 value object：

```ts
type Due =
  | { kind: "none" }
  | { kind: "date"; date: string }
  | { kind: "instant"; at: string; timeZone: string };

type Schedule =
  | { kind: "none" }
  | { kind: "timed"; startAt: string; endAt: string; timeZone: string }
  | { kind: "all_day"; date: string };
```

禁止半组 schedule 字段静默清空现有值。

## 6. Universal Capture

### 6.1 CaptureIntent

```ts
type CaptureIntent =
  | { kind: "task"; text: string; due?: Due; schedule?: Schedule; estimatedMinutes?: number }
  | { kind: "study"; text: string; actualMinutes?: number; outcome?: string }
  | { kind: "mistake"; text: string; cause?: string }
  | { kind: "note"; text: string; day: string }
  | { kind: "asset"; files: FileReference[]; note?: string };
```

### 6.2 交互原则

- 文本输入默认建议一种类型，但最终类型始终可见、可一键切换。
- 解析日期、时间、时长时展示 preview；不确定时保留原文，不做隐式错误写入。
- Task 创建目标：一次主要文本输入 + 一次确认。
- Asset drag/paste 直接进入 asset mode；subject/point association 默认折叠并允许后补。
- 不要求用户先选择 Subject → Chapter → Point 才能记录。

### 6.3 第一阶段解析

使用 deterministic parser：日期词、HH:mm、分钟/小时、明确关键词。LLM 不参与写入分类。解析失败时仍可把完整原文保存为用户显式选择的类型。

## 7. Task Completion UX

### 7.1 Quick complete

```text
点击 ✓
→ 乐观完成
→ application completeTask(mode="quick")
→ toast：已完成 [撤销]
→ 行内出现：顺利 / 有困难 / 补充记录
```

普通任务没有前置表单。

### 7.2 Learning task progressive disclosure

- Quick complete 会写一条最小 completion evidence，表示“完成但未补充验证”，不伪造实际分钟。
- “顺利”只补 outcome/confidence。
- “有困难”先要求一句问题描述，并建议创建 Mistake / Retest。
- “补充记录”才展开 actual minutes、output、verification method/result、confidence 与 retest date。

### 7.3 Reopen

Reopen 不删除旧 evidence；写入明确的 reopen event。再次完成生成新的 completion cycle，避免旧 evidence 被误当成本轮证据。

## 8. Canonical Domain Model

### 8.1 保留实体

- Goal：短期先继续由 settings / exam countdown 表达；不在 foundation 强行新增复杂 Goal tree。
- Knowledge：Subject / Chapter / KnowledgePoint。
- Planner：Task / Event / Reminder / Series。
- Review：Knowledge review / Mistake retest。
- Asset：文件与知识关联。

### 8.2 新增实体

#### LearningTaskLink

一对一扩展通用 PlannerTask，不把学习字段塞回 `planner_tasks`：

```text
learning_task_links
├─ workspace_id
├─ task_id (PK, FK planner_tasks.id)
├─ knowledge_point_id
├─ activity_type
├─ completion_criteria
├─ planned_verification_method
├─ source_type / source_id
├─ created_at / updated_at
└─ version
```

#### LearningEvidence

append-oriented execution record：

```text
learning_evidence
├─ id (TEXT UUID)
├─ workspace_id
├─ task_id (nullable)
├─ completion_cycle
├─ day
├─ knowledge_point_id
├─ activity_type
├─ actual_minutes (nullable)
├─ output
├─ outcome / difficulty
├─ verification_method / result / outcome
├─ confidence (nullable)
├─ source_type / source_id
├─ idempotency_key
├─ corrected_by / voided_at
└─ created_at
```

Evidence 不因 task reopen 被覆盖。纠错通过新记录或显式 void，不做无审计的原地覆盖。

#### AssetRelation

后续建立 Asset ↔ Task/Evidence 的稳定关系：

```text
asset_relations(asset_id, entity_type, entity_id, workspace_id, created_at)
```

第一阶段只支持白名单 entity type，并验证同 workspace ownership。

## 9. Learning Evidence Write Semantics

### 9.1 completeTask transaction

同一 SQLite transaction 中：

1. 按 workspace + canonical task ID 读取 task。
2. 校验 expectedVersion / completion state。
3. 更新 task status 与 timestamps。
4. 写最小或完整 LearningEvidence。
5. 若有关联知识点，以相同规则更新 knowledge state。
6. 若请求 retest，幂等创建 canonical PlannerTask + LearningTaskLink。
7. 更新 reminder / recurring series。
8. 写 entity change / operation idempotency record。

任何一步失败，整笔回滚。

### 9.2 recordStudy transaction

Manual Capture 与 task completion 都调用同一个 `recordStudy()` 核心：

- 统一验证 subject/knowledge ownership；
- 统一更新 Knowledge 状态与 review schedule；
- 统一产生 LearningEvidence；
- legacy `study_sessions` 在过渡期只作为 projection，不再拥有独立业务规则。

### 9.3 public field rule

任何公开字段必须满足 contract test：

```text
input schema → application command → repo write → DB row → read model → export/restore
```

否则字段不得出现在公开 action/API/UI。

## 10. Application Layer

新增：

```text
src/lib/application/
├─ tasks/create-task.ts
├─ tasks/update-task.ts
├─ tasks/complete-task.ts
├─ tasks/reopen-task.ts
├─ tasks/reschedule-task.ts
├─ tasks/delete-task.ts
├─ tasks/restore-task.ts
├─ learning/record-study.ts
├─ learning/record-mistake.ts
├─ learning/complete-review.ts
├─ capture/capture.ts
├─ today/get-today.ts
├─ today/get-next-action.ts
└─ days/close-day.ts
```

规则：

- Application 文件不得 import `next/*`、cookies 或 UI types。
- Command 接受 `db + WorkspaceScope + typed input`，返回领域 result。
- Repo 只做持久化与局部 invariant；跨 repo 事务与业务编排属于 Application。
- Server Action 只做 auth、input parse、调用 command、映射 `{ok,error}`、revalidate。
- Agent operation 只做 schema/confirmation、调用同一 command、序列化结果。

## 11. Next Action Ranking Engine

### 11.1 Candidate

```ts
type NextActionCandidate =
  | { kind: "task"; taskId: string; ...signals }
  | { kind: "review"; reviewId: string; ...signals }
  | { kind: "mistake_retest"; mistakeId: number; ...signals };
```

### 11.2 Deterministic score

第一版信号：

- 已开始/即将开始的 schedule window
- overdue duration
- due proximity
- review overdue duration
- task priority
- nearest exam proximity + subject match
- estimated duration 与当前可用窗口的适配
- reschedule/defer count（数据建立后启用）

输出：`candidate + score breakdown + reasons + generatedAt`。固定 tie-breaker 为 schedule/due、priority、stable ID。任何相同数据产生相同结果。

Review 不再因为“存在”就无条件压过所有 Task；只有分数更高时成为 NOW。

## 12. Agent Surface

### 12.1 Canonical operations

长期只保留一组 Task 语义：

```text
task.create
task.update
task.complete
task.reopen
task.reschedule
task.delete
task.restore
task.list
```

这些操作内部使用 Planner UUID 与 application commands。

### 12.2 Compatibility

- 现有 `planner.task.*` 在迁移期作为 canonical alias，返回 deprecation metadata。
- 现有 numeric legacy `task.*` 只允许解析已有 `legacy_day_task_id`；禁止用 rowid 制造新 ID。
- legacy update 不再执行多个独立 repo mutation；适配为单个 application transaction。
- CLI 与 MCP 继续共享 `agentOperations`，但 operations 不再直接拥有业务规则。

## 13. Compatibility Strategy

### 13.1 过渡原则

`day_tasks` 可以暂时存在，但不能继续作为独立事实源。

分三步：

1. **Read bridge**：为 legacy numeric ID 建立明确 resolver；禁止 Planner-only task 伪造 numeric ID。
2. **Write convergence**：所有 legacy Web/Agent write 转入 application command，只写 canonical Planner + Evidence；必要时维护可重建 projection。
3. **Read convergence**：Home/Day/Calendar/Search/Stats/Export 改读 canonical query model。

### 13.2 Runtime protection

- 所有产品写路径切走后，恢复数据库只读 guard 或以 contract test 禁止直接写 `day_tasks`。
- `repo/planner.ts` 的 legacy mutation 标记 deprecated，只能被 compatibility adapter 调用，最终删除。
- 删除 `planner_tasks.rowid → DayTask.id` 兼容方案。

## 14. Migration Strategy

### Phase A — append-only schema

1. 新增 `learning_task_links`、`learning_evidence`、必要索引与 operation idempotency。
2. 为 legacy task、study session、training source 建立稳定 Planner UUID 映射。
3. migrations 只能追加，不修改旧 migration/checksum。

### Phase B — backfill

1. 确保每个 `day_tasks` 有且只有一个 Planner mirror。
2. 把 legacy learning metadata 写入 LearningTaskLink。
3. 把已完成 task evidence 与关联 study session 合并回填为 LearningEvidence；保留 legacy origin ID。
4. 对冲突/孤儿数据 fail loud，生成可修复报告，不静默跳过。

### Phase C — dual read verification

在切换 consumer 前，对每个 workspace 比较：

- task count / open / completed / deleted
- due / schedule local representation
- learning link/evidence count
- task → study → knowledge association
- Today/Calendar item set

### Phase D — consumer switch

依次切换 Calendar → Today/Day → Search → Stats/Analytics → Export/Restore → Agent legacy alias。每一步保留交叉视图 regression test。

### Phase E — legacy freeze

关闭独立 legacy writes，确认备份恢复和生产数据迁移后再考虑移除旧表。删除旧表不是本轮前置目标。

## 15. Visual Baseline

### 15.1 Type scale

```text
Page title      32px desktop / 28px mobile
Section title   20px / 18px
Body & controls 15–16px
Support text    12–13px
```

正文统一现代 sans；serif 只用于有限品牌标题；mono 只用于代码/时间/稳定数字场景。非装饰信息不低于 12px。

### 15.2 Color

- Cinnabar 是 brand/action emphasis，不等于 error。
- Risk、Error、Warning 使用独立 semantic tokens。
- 每个页面仅一个最强 primary surface/CTA。

### 15.3 CSS boundary

- `globals.css` 只保留 reset、shell、真正跨域 primitive。
- 新 Today/Capture/Onboarding 使用 CSS Modules。
- 先建立 tokens 与 contract test，再逐域搬迁，避免一次机械拆分 11k 行 global CSS。
- 每次生产 build 检查 CSS ordering；Next 16 文档明确全局样式导航后不会卸载，不能依赖路由顺序解决冲突。

## 16. Mobile UX

390px Today 默认只呈现：

```text
NOW
今天的执行列表
Review summary
固定 + 记录
```

要求：

- 主要触控目标 ≥44×44px。
- 键盘弹出时 Capture 主要输入和确认按钮仍可见。
- 使用 Base UI Drawer/Dialog/Popover；支持 focus trap、Esc、backdrop、回焦与 screen reader title。
- 无水平溢出；不把桌面 7 个 Day 模块依次堆成长页。
- reduced motion 同时遵守系统和应用设置。

## 17. Onboarding

三步：

1. 你准备学什么？可创建/选择一个 Subject。
2. 最近最重要的目标是什么？
3. 今天第一件要完成的事是什么？创建 canonical Task。

系统使用 weekly/review 默认值；考试、容量与高级知识结构后补。完成 onboarding 的 transaction 必须同时保存设置与第一个真实 Task，随后进入 Today 并把该 Task 作为 NOW 候选。

## 18. Feature Freeze

除 Bug / Security / Data Integrity 外暂停：

- Admin 与多用户扩展
- Extension mechanism 与新 plugin
- Theme / animation
- Library 高级能力
- 新 Analytics 图表
- 新复杂设置
- 新实验模块

任何例外必须在 PR/commit 中说明为什么属于上述三类。

## 19. Acceptance Criteria

### 19.1 Data integrity

- [ ] `planner_tasks` 是唯一 canonical task write source。
- [ ] 不再存在 rowid compatibility ID。
- [ ] legacy task 全量 backfill，无重复 mapping、无 orphan link。
- [ ] task public fields 可通过 export/restore round trip。
- [ ] complete/reopen/re-complete 保留正确 evidence cycles。
- [ ] task reschedule 会刷新 reminder anchor。

### 19.2 Cross-view consistency

从 Web Today、Planner、Calendar、CLI、MCP 任一入口 create/update/reschedule/complete/delete/restore 后：

- [ ] Today、Planner、Calendar、Search、Analytics、Agent 返回同一状态。
- [ ] DB workspace isolation 保持。
- [ ] operation 重放幂等。

### 19.3 UX

- [ ] 普通 task 1 click 完成，并可撤销。
- [ ] Capture 普通 task ≤1 个主输入 + ≤1 次确认。
- [ ] Today 首屏只有一个 strongest CTA。
- [ ] Review 不再无条件覆盖已排期且更紧迫的 Task。
- [ ] 390px 首屏可看到 NOW 与至少一个后续 Today item。

### 19.4 Accessibility / interaction

- [ ] Overlay focus trap、Esc、backdrop、initial focus、focus return 全部通过。
- [ ] page title / h1 唯一且描述性，满足 Next route announcement。
- [ ] reduced motion、keyboard path、aria-live 通过。
- [ ] autosave 有 visible state、navigation/pagehide flush、ordering、retry。

### 19.5 Engineering gates

- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run responsive:audit`
- [ ] `npm run smoke`
- [ ] `npm run verify:migration`
- [ ] `npm run verify:planner-migration`
- [ ] `npm run verify:backup`
- [ ] verify skill 的隔离 build/start/login/UI/data 证据

## 20. Git Strategy

分支：`codex/ascend-product-convergence`。

提交按可回滚 Gate 划分：

1. `docs(audit): establish convergence baseline`
2. `docs(design): freeze product and domain convergence`
3. `test(tasks): reproduce cross-view integrity failures`
4. `feat(domain): add learning task links and evidence`
5. `feat(application): converge task and learning commands`
6. `refactor(tasks): move surfaces to canonical task reads`
7. `feat(today): establish the daily execution surface`
8. `feat(capture): add universal capture`
9. `refactor(ui): converge navigation and visual system`
10. `test(e2e): verify cross-surface convergence`

规则：

- 每个 migration/应用层提交带对应测试，不把 schema、全站 UI 与 CSS 混在一个提交。
- 每次 stage 前检查 `git diff --check` 与 `git status --short`。
- 不改写用户已有提交，不使用 destructive reset/checkout。
- 只有一个 Gate 验证通过后才进入下一个 Gate；失败修复放在当前 Gate 内。

## 21. Gate 2 退出条件

- [x] Product North Star 与 Daily Core Loop 明确。
- [x] IA、Today、Planner、Capture、Completion UX 明确。
- [x] Canonical Task、LearningTaskLink、LearningEvidence 明确。
- [x] Application Layer 与 Agent compatibility 明确。
- [x] Migration、Visual、Mobile、Feature Freeze 明确。
- [x] Acceptance Criteria 与 Git strategy 明确。

设计冻结后，Gate 3 第一笔源码改动必须先写失败回归测试，证明 Calendar rowid 与跨视图分叉，再实施 schema/application foundation。
