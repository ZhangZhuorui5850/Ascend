# 添加任务乐观更新 + 全站动效批次 设计文档（2026-07-17）

> 状态：批次一、P1 收尾、批次二、批次三及存量合规修复均已实施并通过隔离实例验收；批次四的 P2 降级项按设计保持现状。交付报告见 `docs/reports/2026-07-17-optimistic-task-add.md` 与 `docs/reports/2026-07-17-motion-batches-2-4.md`。可选的行级 ViewTransition 实验继续作为独立分支候选。
> 所有结论遵守 `docs/agent-development-guide.md` 的四条动效守门规则（箭头规则 / 仪式感预算 / 物理规律 / 第 10 天测试）。

---

## 1. 问题诊断：添加任务为什么有停顿

**根因（[KNOWN]）**：添加任务没有乐观更新，新条目要等一整条服务端往返才出现。

链路：`DayTasks.add()`（`src/components/DayTasks.tsx:64`）→ `await addTaskAction`（`src/app/actions/planner.ts:23`）→ `requireWorkspace()` 鉴权 → SQLite 写库 → `refresh()`（`next/cache`，在同一次 Action 响应中携带整页更新后的 RSC）→ 流回客户端 → React 提交。用户感受到的"稍有停顿"= 这条链路的总时延（本机 `next start` 下约一两百毫秒，且随 /day 页 RSC 体量增长）。

对照：**勾选完成为什么不卡**——`TaskLine.toggle` 有本地乐观覆盖 `completionOverrides`（`DayTasks.tsx:28,54-62`），点击瞬间 UI 先变，Action 只负责写库、失败回滚。"添加"缺同款机制。

**同病相怜的写路径（本批一并考虑）**：DayNotes 增删（`DayNotes.tsx`，`router.refresh()` 等服务端）、SubjectWorkbench 章节/知识点增删（`SubjectWorkbench.tsx:138-141`）、FileExplorer 全部增删移（`FileExplorer.tsx:106,236`）、MistakeReattempt 评分（`MistakeReattempt.tsx:14-21`）。

## 2. 技术调研结论

### 2.1 项目现有底座（复用，不另起炉灶）

- **动效 token**（`src/styles/summit.css:27-38`，皮肤禁止覆盖）：时长 `--motion-fast 120ms / --motion-quick 200ms / --motion-page 360ms / --motion-slow 400ms / --motion-reward 550ms / --motion-stagger 45ms`；缓动 `--motion-ease / -enter / -exit / -snappy`。新动效一律引用 token，禁止裸写 `cubic-bezier(` 与裸 ms。
- **三重减弱保护**（新动画必须全中）：`html[data-motion="reduce"]`（globals.css:66-73 + summit.css:2441）、`@media (prefers-reduced-motion)`（globals.css:3448 等）、view-transition 压制（summit.css:2416-2445）。类名走通用选择器的动画自动被覆盖，无需逐条豁免。
- **已有动画词汇**（新动效风格要与之同族）：`checkPop`（勾选弹跳）、`sealStamp`（成就印章，预算受限）、`riseIn`（卡片上移入场）、`drawerIn` / `captureMenuIn` / `toast-in`、`calendar-popover-in-*`、页面级 `summit-page-in/out/forward`。
- **乐观更新先例**：单值字段用自研 `useOptimisticValue`（`useOptimisticValue.ts`，2026-07-13 批次二收编）；DayTasks/CalendarView 勾选用 `completionOverrides`。注意 `CalendarView.test.ts:26` 的 `not.toContain("useOptimistic(")` 是**锁定该组件勾选方案**的源码断言，不是全局禁用——列表插入是新场景，见 2.2。

### 2.2 前沿技术逐项评估

| 技术 | 评估 | 本项目用法 |
| --- | --- | --- |
| React 19 `useOptimistic` | ✅ 采用 | 官方列表乐观方案（本仓 Next 文档 `node_modules/next/dist/docs/01-app/02-guides/forms.md:384` 推荐同款）。`useOptimisticValue` 是单值对账 hook，不适配"列表插条目"；列表场景用官方 hook，需在 `startTransition` 内调 Action。 |
| React `<ViewTransition>` 组件（元素级） | ⚠️ 二期实验 | `experimental.viewTransition` 已开（next.config.ts:41），AppShell 页面级已在用（AppShell.tsx:75）。行级包裹可让删除时**兄弟行整体流动补位**（"流上去"的完全体），但乐观临时行→真实行的 key/name 交换会触发多余 enter/exit 闪动，需 `addTransitionType` + `default:"none"` 精细控制。风险见 §3.1 二期。 |
| CSS `@starting-style` | ❌ 本场景不用 | 对元素首次渲染即触发——任务行在整页加载/RSC 重渲染时也会全体重播入场，与首页 intro 编排冲突。改用"仅乐观 pending 行挂动画类"精确圈定。面板开合（display:none→block 过渡）场景可用，见 §3.3。 |
| `interpolate-size: allow-keywords` + `::details-content` | ⚠️ 仅 Chromium 的渐进增强 | `<details>` 高度 auto 过渡的最新标准解。截至 2026-07：Chromium 已实现；WebKit 的 `interpolate-size` 仍是开放实现事项（Safari 已支持 `::details-content` 但缺高度关键字插值这一环）；Firefox 在跟踪中。实际动画效果范围 ≈ Chromium，其余浏览器无动画直落。用局部 `@supports (interpolate-size: allow-keywords)` 把 opt-in 限定在 `.dayModule` 等目标区域，不放 `:root`。 |
| `transition-behavior: allow-discrete` | ✅ 配合上两条 | display/visibility 参与过渡所需。 |
| `linear()` 弹簧缓动 / scroll-driven animations / FLIP 库 | ❌ 不引入 | 现有 token 缓动已够表达；无滚动叙事场景；不加依赖。 |

### 2.3 顺手修的存量违规（调研中发现，[COMPUTED]）

1. `--motion-page` 与 `--motion-ease-exit` 定义了但无人引用，页面过渡写的是字面量 `360ms`（summit.css:2156）——接线。
2. `AppShell.tsx:75` 的 `enter="summit-page-enter" / exit="summit-page-exit"` 类钩子在两份 CSS 中无对应规则，属未接线死代码——补规则或删 prop。
3. 遗留 `transition: width`（globals.css:679, 1131, 9678）违反"只动 transform/opacity"——迁移为 `transform: scaleX()`（首页 `summit-track-grow` 已示范，summit.css:2228）。
4. `prefers-reduced-motion` 三处策略不一致（globals.css:3448 最激进 `none !important`，summit.css:2131 是 `1ms`）——统一为近零时长方案（保留结束态、transition 事件仍触发，与 data-motion 方案一致）。

## 3. 方案设计（按批次）

### 批次一（P0）：任务添加乐观更新 + "上浮入列"动画 —— 核心诉求

**改动面**：`src/components/DayTasks.tsx` + `src/app/globals.css`（或 summit.css），Server Action 零改动。

1. **乐观插入**：`useOptimistic<DayTask[], DayTask>(tasks, (state, t) => sortDayTasks([...state, t]))`。
   - `add()` 改为 `startTransition(async () => { addOptimisticTask(tempTask); const r = await addTaskAction(...); ... })`；输入框在 transition 外**立即清空**（回车手感：字消失、条目浮现，零等待）。
   - 临时任务：负数 id（`tempIdRef` 自 -1 递减，支持并发多条不撞 key）+ `pending: true` 标记；pending 行禁用勾选/删除/编辑。
   - **排序镜像**：新建 `sortDayTasks` 纯函数复刻 `listTasks` 的 ORDER BY（`src/lib/repo/planner.ts:33-37`：`scheduled_start` 非空优先→时刻→priority→sort_order→id），保证乐观位置与服务端回流位置一致。放 `src/components/day-tasks-sort.ts` 并配 vitest（对照 SQL 语义的用例表）。⚠️ 评审指出"对账零位移"仅对**单条** pending 草稿成立，多条并发场景见收尾-1。
   - **对账**：`refresh()` 的 RSC 随 Action 响应在同一 transition 内回流，`useOptimistic` 在 transition 结束时自动回落到新 `tasks` prop——临时行原位换成真实行。⚠️ 评审指出"肉眼不可见"仅在响应慢于动画时成立：key 不同导致回流 commit 卸载临时 DOM，快响应会截断进行中的动画（见收尾-2 的 presence 方案）。失败：不 refresh → 乐观行自动消失 + 既有 `notify(error)` toast，符合"action 不抛错"协议。
   - `adoptPlan()`（昨晚计划转任务，DayTasks.tsx:41）走同一条路。
2. **入场动画（"流上去"）**：动画类只挂在 pending 行——`.taskLine[data-entering]`，keyframes `taskRiseIn`：`translateY(10px) + opacity 0 → 0/1`，时长 `var(--motion-quick)`、缓动 `var(--motion-ease-enter)`，只动 transform/opacity。真实行回流时不带该属性，不重播。三重减弱保护由通用覆盖自动命中（已实测）。⚠️ "不重播"以牺牲快响应下的动画完整性为代价（key 交换截断），收尾-2 将改为 presence 驱动：`data-entering` 由本地 entering 状态挂载、`onAnimationEnd` 清除，key 用 clientKey 稳定。
3. **删除退场（对称补齐）**：点删除 → 行挂 `data-leaving`（`taskFallOut`：`opacity→0 + translateY(-6px)`，`var(--motion-fast)`，**退出比进入快**）→ **同一事件上下文内立即** `startTransition(async () => deleteTaskAction(...))`，退场动画与服务端往返并行。⚠️ "往返 ≥ 动画时长"无框架保证，快响应会提前卸载元素截断退场——收尾-2 的 exiting 快照负责把视觉生命周期与请求解耦。
   ⚠️ **实施中验证出的框架级约束（[COMPUTED]，批次二必读）**："先等动画播完再提交"的形状全部不可用——`refresh()` 携带的 RSC 回流只在**从事件上下文直接启动、且 action 调用前没有其他 await** 的 transition 里被应用。`setTimeout` 里启动 transition、或 transition 内先 `await` 延迟再调 action（含嵌套 `startTransition` 补救），在整页硬加载的页面上都会静默丢弃回流（服务端已写库、UI 不更新、行残留）。ReviewQueue 现存的"盖章 360ms 后 `router.refresh()`"能工作是因为它走 `router.refresh()` 而非 action 内 `refresh()`，批次二改造时不要照搬延迟提交。
4. **勾选整行过渡**：`.taskLine` 补 `transition: opacity var(--motion-fast) var(--motion-ease)`，done 态由硬切改为轻过渡（勾选图标已有 `checkPop`，不动）。

**二期实验（可选，另开分支验证后再定）**：行级 `<ViewTransition name={`task-${id}`}>` + `addTransitionType('task-remove')`，让删除时下方兄弟行以 morph 流动补位。已知风险：乐观临时行与真实行 name 不同，settle 提交可能触发多余 enter/exit 闪动，需 `default:"none"` + 类型映射兜住；Safari 表现有差异；两个 API 分别为 Next 实验特性与 React Canary API。**验收标准：无闪动才合入，否则保持批次一方案**（缺口补位靠布局即时收缩，视觉上已可接受）。

### 批次一收尾（2026-07-17 评审 P1，已实施）

**收尾-1：连续添加倒序并对账跳位。** 现状：临时 id 依次 `-1、-2`，但每条草稿的 `sort_order` 都从原始 `tasks` prop 计算（`DayTasks.tsx` `buildDraftTask`），快速连加两条得到相同 `sort_order`，比较器落到 id 升序 → 第二条（-2）排到第一条（-1）前面；服务端按提交顺序回流时再跳回来。Next 客户端串行派发 Server Action（本仓文档 `server-actions.md`），场景稳定可复现。
- 改法：新增 `draftOrderRef`（独立于临时 id 的递增序号），草稿 `sort_order = max(tasks 内 sort_order, 0) + draftOrderRef.current++` 的组合口径，保证多条草稿彼此严格递增且与提交顺序一致；对账后重置基准。
- 测试：`day-tasks-sort.test.ts` 或组件源码断言补"连续三次添加仍保持输入顺序"（三条草稿 sort_order 严格递增 → 排序结果与提交顺序一致 → 与服务端最终顺序一致）。

**收尾-2：快响应截断进出场动画（视觉生命周期与请求生命周期分离）。** 现状：临时行与真实行 key 不同（负 id ↔ 真实 id），回流 commit 会卸载临时 DOM；入场 200ms/退场 120ms 依赖元素持续存在，而"往返 ≥ 动画时长"没有框架保证——本机快响应（<100ms）会截断动画或产生透明度跳变。当前验收注入了 300ms 延迟，恰好只覆盖了慢路径。
- 请求侧不变：仍在点击事件上下文里立即提交。
- **入场 presence**：`addTaskAction` 返回新建任务（repo `addTask` 本就返回 `DayTask`，action 补透传 `{ok, task}`）；客户端用 ref 存 `clientKey → task.id` 映射（每条草稿持有唯一 clientKey，action resolve 时在 transition 闭包内同步写入 ref——闭包即天然的 mutation 关联，无需把 clientMutationId 送到服务端）。行 key 取 `映射[task.id] ?? task.id`，草稿→真实行复用同一 DOM 节点，动画自然播完。`data-entering` 改由本地 entering 状态驱动（`onAnimationEnd` 清除），不再与草稿态绑定，避免属性中途摘除导致动画取消。
- **退场 presence**：本地 `exitingTasks` 快照列表；canonical 移除后该行仍由快照渲染（与 displayTasks 按同一比较器合并定位），`onAnimationEnd`（reduce 近零时长下事件照常触发）或超时兜底后移出快照。
- 验收：0ms（本地直连）/ 50ms / 300ms 三档响应时间下，进出场动画均完整播放、无跳变；连加三条顺序正确。

**收尾-3：新写路径规则与存量调用点冲突。** 指南新规（带 `refresh()` 的 action 必须事件上下文直接进 transition）与本组件现存调用矛盾：顺延 `carryOverTasksAction(...).then(report)`（两处）、`updateTaskAction` 直调（标题 blur/科目 select/详情字段），对应 action 均带 `refresh()`。
- 统一改为事件上下文 `startTransition` 形状；blur/change 回调属于事件上下文，可直接套用。
- 同时把规则的实测边界补进指南：**直接事件回调 / Promise `.then` 链 / confirm 弹窗的异步回调 / 整页硬加载后**四种情况各自是否丢回流，用隔离实例矩阵实测后写明（当前只实测了"setTimeout 启动"与"transition 内先 await"两种反例、"事件直启"一种正例；`.then` 链与 confirm 回调是批次二 DayNotes/FileExplorer 的前置问题）。

### 批次二（P1，已实施）：同类列表增删动效收编

分两档。**纯本地列表**直接套批次一沉淀的 `data-entering` / `data-leaving` + token 化 keyframes；**带业务状态机的组件**必须先写一张状态转换表（状态 × 触发 → 下一状态 + 视觉），评审通过再动手——"统一套用"对它们不成立：

| 组件 | 现状 | 改法 |
| --- | --- | --- |
| CapturePanel 附件（CapturePanel.tsx:125,152） | 纯本地 state 硬插删 | 最容易：本地列表直接挂 entering/leaving |
| SettingsForm 倒计时行（SettingsForm.tsx:100-116） | 纯本地硬插删 | 同上 |
| DayNotes 卡片（DayNotes.tsx:104） | 增删等 refresh 硬切 | 增：乐观 + 入场。删的难点：先 `confirm()` 异步确认再提交，与"事件上下文立即提交"规则衔接未验证——依赖收尾-3 的 confirm 回调边界结论；若 confirm 回调丢回流，需在确认 resolve 后的用户可感知事件里重新入口或改造 confirm 协议 |
| ReviewQueue 卡片（ReviewQueue.tsx:85,106-131） | 盖章后 360ms 硬消失 | 先写状态表：**在线成功 / 离线入队 / 失败 / 撤销（undoBar 8s）**四态各自的视觉与退场时机分别定义；印章保留（成就预算内），退场用 `taskFallOut` 同族并走收尾-2 的 presence 模型；队首 `focused` 高亮加 `--motion-fast` 过渡 |
| MistakeReattempt（MistakeReattempt.tsx:14-21） | 评分后卡片硬消失 | 同 ReviewQueue 状态表模式；**顺手修正现存 bug：失败后也执行 `router.refresh()`**，应仅成功刷新、失败走 toast |
| CommandPalette 过滤行 | 随 query 硬变 | **不做**（高频重排，动画是噪音，第 10 天测试不过） |

SubjectWorkbench / FileExplorer 的树结构增删（涉及 dnd、层级、`treeBusy` 串行化）**本批不动**，等批次一模式验证后单独立项。

#### ReviewQueue / MistakeReattempt 状态转换表（批次二实施基线）

| 当前状态 | 触发 | 下一状态与数据动作 | 视觉 |
| --- | --- | --- | --- |
| idle | 在线评分成功 | stamped → leaving → removed；同时建立 8s undo | 成就章完整播放，随后 `taskFallOut` 同族退场，队首高亮转给下一项 |
| idle | 离线评分成功入队 | offline-queued | 成就章常驻，卡片留在原位并锁定重复评分，顶部显示待同步数 |
| idle | Action 失败 | idle + error | 卡片留在原位，恢复按钮，全局区域显示错误 |
| removed / offline-queued | 撤销成功 | idle（服务端刷新恢复 canonical） | 清除本地 stamp/退场 tombstone，恢复卡片；undoBar 消失 |
| stamped / leaving | 系统或站内减弱动效 | removed | 近零时长或 computed-duration 兜底完成 presence 清理 |

MistakeReattempt 采用同一在线成功 / 失败子集；它没有离线队列和撤销条。Action 失败保持卡片，成功完成普通退场后刷新。

### 批次三（P1，已实施）：状态切换与面板开合

1. **`<details>` 开合**（day 页 dayModule、SubjectWorkbench 设置、Onboarding 精确设置）：局部 `@supports (interpolate-size: allow-keywords)` 内声明 `interpolate-size` + `::details-content` 过渡 `height/content-visibility` + `transition-behavior: allow-discrete`，opt-in 限定在目标区域。实际动画范围 ≈ Chromium（见 §2.2 兼容性），其余浏览器无动画直落、无兜底成本。现有 `summit-details-in` 内容淡入保留叠加。**这是"只动 transform/opacity"守门规则的一个书面豁免**：disclosure 高度动画属渐进增强例外，仅此一处，且被 `@supports` 与三重减弱保护共同圈定。
2. **面板开合**：CommandPalette（CommandPalette.tsx:56，目前 `return null` 硬开）与 `FeedbackProvider.confirm` 弹窗——入场用 `captureMenuIn` 同族 keyframes（120-130ms）；退场因条件卸载暂不做（成本/收益不成比例）。日历 DaySchedulePopover 已有方向性入场（calendar-popover-in-*），不动。
3. **Tab / 分段控件**（QuickLog segmented、PointDetailPanel pointPanelTabs、Calendar viewSwitch、Subject sortModeSwitch）：active 背景补 `background/color var(--motion-fast)` 过渡即可，**不做滑动指示器**（结构改动大、收益小）。
4. **拖拽指示线**（SubjectWorkbench/MindMap/FileExplorer 的 dropBefore/after/inside）：指示线 `opacity var(--motion-fast)` 过渡，消除闪跳。
5. **进度条合规迁移**（§2.3-3）：DayTasks taskProgress、日历日进度等 `width` 过渡改 `scaleX`。工作量按**组件**评估而非按 CSS 行数：多处宽度是 TSX 内联 `style={{width}}`，迁移涉及组件代码改 `transform: scaleX()`、补 `transform-origin: left`、以及每处的视觉回归（圆角端头在 scaleX 下会被压扁，需逐处确认观感）。

### 批次四（P2，已按设计降级）

- 首页周专注柱 / analytics 柱图入场生长：**不做**——值驱动的常驻动画是墙纸（第 10 天测试不过）；首页柱已受 intro 编排节制，enough。
- MindMap 缩放补间（`style={{zoom}}` 硬变）：P2 观察，若做需迁 `transform: scale`，牵动布局，不在本批。
- NowCard→day 共享元素过渡：沿用 2026-07-17 首页重设计报告的"明确不做"结论。
- 新增成就动效：**不加**。sealStamp 与 `--motion-reward` 预算已用在 登顶/清零/勾选 三处，本批只保证这三处不被新动效稀释。

## 4. 守门规则合规自查

- **箭头规则**：本批全部是操作反馈动效，无新增首页常驻元素，不涉及。
- **仪式感预算**：未新增 sealStamp/`--motion-reward` 使用点；ReviewQueue/Mistake 退场用普通 token 时长。
- **物理规律**：transform/opacity（唯一书面豁免：批次三-1 的 disclosure 高度动画，渐进增强 + `@supports` 圈定）；token 化时长与缓动；退出（`--motion-fast` 120ms）快于进入（`--motion-quick` 200ms）；三重减弱保护逐条实测。已实施的删除**不依赖** `animationend`（请求与动画并行，功能独立于动画事件）；收尾-2 的 presence 模型将依赖 `animationend` + 超时兜底，需在 reduce 近零时长与系统级 `animation: none`（globals.css:3448）两条路径下分别实测事件是否触发。
- **第 10 天测试**：入场/退场只在用户主动增删时出现，属信息（"我加的东西进去了"）非墙纸；CommandPalette 过滤动画等噪音项已列入不做。

## 5. 测试与验收

- 惯例：源码断言测试（无 @testing-library）。新增/修改：
  - `day-tasks-sort.test.ts`：排序纯函数对照 `listTasks` ORDER BY 的用例表（已排时间优先、priority 次之等）。收尾-1 补：**连续三次添加的草稿 sort_order 严格递增、排序结果保持输入顺序**。
  - `DayTasks.test.ts`：断言 `useOptimistic(`、`startTransition(`、`data-entering`、`data-leaving` 出现；保留既有 `aria-checked={done}` 等断言不破坏。收尾-2 后补 presence 相关断言（action 返回 `task`、clientKey 映射、`onAnimationEnd`）。
  - 样式断言：`taskRiseIn` / `taskFallOut` keyframes 存在、引用 `var(--motion-` 而非裸 `cubic-bezier(`。
- `npm test` / `npm run lint` / `npm run build` 三绿。
- `/verify` 隔离实例验收矩阵（慢网络模拟用 CDP `Network.emulateNetworkConditions`，**不要用** `page.route` 拦截——对 RSC 流不可靠，见 verify SKILL 坑清单）：
  - 响应时间三档 **0ms（本地直连）/ 50ms / 300ms**：①回车添加 → 条目即时上浮、输入框即时清空、对账无跳位、动画完整不截断（收尾-2 后）；②删除 → 退场完整后消失；③**连加三条 → 显示顺序 = 输入顺序 = 对账后顺序**（收尾-1 后）。
  - 失败路径：断网/action 失败 → 乐观行消失 + 错误 toast、输入框回填。
  - 减弱动效两条路径分别测：`data-motion="reduce"`（近零时长）与系统 `prefers-reduced-motion`（globals.css:3448 `animation: none`）下功能均不损。
  - 写路径边界矩阵（收尾-3）：直接事件回调 / Promise `.then` 链 / confirm 弹窗回调 / 整页硬加载后，四种上下文各验证一次 `refresh()` 回流是否应用，结论写回指南。
  - 四皮肤抽查动画观感；首页 intro 编排不受影响（当日首次冷加载仍只播一次）。
- 生产实例是本机 `next start`，合入后需 build + 重启。

## 6. 实施顺序建议

批次一（已完成）→ 批次一收尾（已完成）→ 批次二（已完成，状态表见上）→ 批次三与 §2.3 存量违规修复（已完成）→ 批次四降级决策（已执行）。二期 ViewTransition 实验保持独立候选。
