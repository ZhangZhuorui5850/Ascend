# Ascend Planner 高级前端重设计执行计划

日期：2026-07-31  
状态：视觉整改实现与主矩阵通过；完成审计正在补齐状态/软键盘证据  
父计划：`docs/superpowers/plans/2026-07-31-advanced-calendar-tasks.md`  
依赖状态：父计划 Phase 0–Phase 3 已通过；Phase 4 内核可供前端接入；Phase 5 搜索、离线和智能排期按能力落地后增量接入  
目标用户：1–2 名个人用户，覆盖桌面、平板、390px 手机、在线与多设备使用  
预计投入：单名熟悉本仓库的工程师 8–12 个工作日

## 1. 目标与完成定义

本计划把现有 Planner v2 功能整理为稳定、克制、可理解、可触达的个人计划工作区。

完成后的体验应满足：

1. 用户在 10 秒内把想法收入 Inbox。
2. 用户在两次交互内打开常用任务字段并完成修改。
3. 桌面任务页保持三栏工作区，三个区域各自稳定滚动。
4. 平板任务详情与事件详情通过侧边 Drawer 展示。
5. 390px 手机使用键盘感知底部 Sheet 编辑任务和事件。
6. 日历月、周、日和议程视图使用一致的任务、事件与里程碑视觉语义。
7. 新增、完成、删除、选择、拖拽、缩放、冲突和失败恢复具备清晰的状态反馈。
8. 所有动效响应系统减少动效设置，并遵循项目 `--motion-*` token。
9. 所有写入继续经过 Server Action 或规划中的同步 API、`requireWorkspace()` 和 repo。
10. 两个 workspace、桌面、平板、390px、键盘、触控和生产构建通过隔离验证。

本计划完成的证据包括：

- 实现代码与测试。
- 前后对比截图。
- 响应式、键盘、减少动效和写入恢复审计。
- 隔离实例 verify 结果。
- `docs/reports/` 下带 `[COMPUTED]`、`[INFERRED]`、`[KNOWN]` 标签的交付报告。

### 1.1 阶段状态

| Phase | 状态 | 闸门证据 |
|---|---|---|
| Phase 0｜契约、失败测试与技术原型 | 已通过 | spec、10 张基线截图、12 条契约/原型测试、隔离生产构建 |
| Phase 1｜设计系统与共享原语 | 已通过 | 5 条原语契约测试、全量命令、隔离生产构建与 390px smoke |
| Phase 2｜Tasks 工作区 | 已通过 | 11 条 Tasks/reducer 测试、三视口生产 E2E、删除撤销与冲突恢复 |
| Phase 3｜Calendar 工作区 | 已通过 | 31 条定向测试、四视图与三视口生产 E2E、改期冲突恢复 |
| Phase 4｜硬化与收口 | 已通过 | 58 files / 376 tests、三视口深浅色/reduce、100/200 实例性能与 CSS 单一来源审计 |
| Phase 5｜隔离验证与交付 | 补证中 | 60 个测试文件 / 393 项测试、lint、typecheck、生产构建、三视口主矩阵与六张 viewport 截图通过；静态原型、Calendar 四视图、状态矩阵和软键盘证据待补齐 |

状态只在对应闸门证据落盘后更新。实施期间每完成一个任务，立即在本表和对应 Phase 标记进度，并记录验证命令与结果。

2026-07-31 视觉复核曾撤回本计划的完成结论。产品整改现已完成：任务行、共享表单、Quick Capture、Sidebar、Inspector、Calendar 层级与待排任务密度均已收口；三视口、五套实际 skin、light/dark、reduce motion、回焦与 fixed/sticky 相交主矩阵通过。逐项完成审计仍在补齐静态原型、Calendar 四视图、空/密集/错误/冲突/恢复与软键盘占用证据；完成后才进入用户最终视觉确认。

## 2. 当前基线

### 2.1 已有能力

- [COMPUTED] `/tasks` 已具备智能视图、清单、标签、子任务、到期与排期、提醒、重复、批量操作、完成、回收站和乐观恢复。
- [COMPUTED] `/calendar` 已具备 FullCalendar 月/周/日、移动议程、独立事件、任务投影、全天与多日、拖拽、缩放、提醒和范围加载。
- [COMPUTED] Next.js 版本为 16.2.12，React 为 19.2.4，FullCalendar 为 6.1.21。
- [COMPUTED] `next.config.ts` 已开启 `experimental.viewTransition`。
- [COMPUTED] 项目已有 `--motion-*` token、减少动效策略、页面 View Transition 和移动底部导航。
- [COMPUTED] 高频 Planner 写入已有乐观状态、Server Action 返回值和失败回滚基础。

### 2.2 结构问题

- [COMPUTED] `PlannerTasks.tsx` 为 782 行，组件同时管理列表、检查器、提醒、重复、标签、子任务、Push 和所有乐观状态。
- [COMPUTED] `CalendarView.tsx` 为 1156 行，组件同时管理 FullCalendar、议程、日期弹层、事件编辑、提醒、任务排期和范围请求。
- [COMPUTED] `summit.css` 为 3277 行，`globals.css` 为 11547 行。
- [COMPUTED] `summit.css` 中 `.calendarLayout` 存在两处顶级定义，日历样式受到较长级联链影响。
- [COMPUTED] 任务检查器把基础字段、标签、提醒、重复、子任务和系统事实连续展开。
- [COMPUTED] 1180px 以下任务检查器进入主网格下一行，760px 以下进入页面普通流。
- [COMPUTED] 日历右栏同时容纳事件创建器与待排任务，移动端两段内容形成连续长页。
- [COMPUTED] Planner 列表主要使用颜色和即时 DOM 更新表达选择、完成与删除，语义动效仍有提升空间。

### 2.3 实机审计结论

审计视口：

| 视口 | Tasks | Calendar |
|---|---|---|
| 1440×1000 | 三栏成立；右侧详情形成超长独立内容；常用字段与低频配置权重接近 | 月历结构清晰；右栏创建器占据高密度首屏；待排任务入口较弱 |
| 900×1100 | 详情落到任务列表下方；上下文切换距离过长 | 日历与编辑器纵向串接；页面信息重心分散 |
| 390×844 | 任务列表后连续展示完整详情、提醒与重复；操作路径过长 | 议程之后连续展示事件表单和待排任务；移动底部导航与编辑流程争夺空间 |

### 2.4 保留的产品资产

- 暖白纸张、深墨色、朱红强调色与 Summit Atelier 品牌语言。
- 应用壳层、桌面侧栏、顶部栏与移动底部导航。
- 任务、事件、考试节点的领域差异。
- FullCalendar 的日期计算、视图、拖拽与缩放能力。
- 乐观写入、版本冲突和失败回滚语义。
- workspace 隔离、Planner v2 数据模型和当前迁移链。

## 3. 设计与技术决策

### 3.1 技术组合

采用以下稳定技术：

1. `motion`
   - `LazyMotion` 与 `m` 控制客户端动画体积。
   - `AnimatePresence` 处理新增、完成和删除退场。
   - `LayoutGroup` 与 `layout` 处理列表重排和选中背景。
   - `MotionConfig reducedMotion="user"` 统一系统减少动效。
   - `useReducedMotion` 处理 Drawer 内容、共享元素和高位移动效的降级。

2. `@base-ui/react`
   - Drawer：平板侧边详情与移动底部 Sheet。
   - `Drawer.VirtualKeyboardProvider`：移动表单与软键盘协调。
   - Dialog：永久清理、覆盖冲突等高风险确认。
   - Popover：清单、标签、日期快捷操作和日期卡片。
   - Collapsible：提醒、重复、备注和系统信息的渐进展开。
   - Toast：成功、失败、撤销、冲突与恢复反馈。

3. FullCalendar
   - `eventContent` 与 render hooks 提供 Ascend 自定义事件内容。
   - `eventDrop`、`eventResize` 和 `revert()` 继续负责时间轴交互与失败恢复。
   - FullCalendar 管理事件定位；Motion 管理周边面板、状态层和业务列表。

4. Next.js 16
   - Server Component 继续负责初始数据读取。
   - 客户端边界缩小到状态、手势、Drawer 和 Motion 所需区域。
   - `next/dynamic` 用于较重的客户端日历或低频编辑器。
   - Next View Transition 用于路由级过渡，组件级动效由 Motion 负责。
   - Server Action 在原始事件上下文的 `startTransition` 中立即启动。

依赖进入实现前记录：

- 当前稳定版本。
- 许可证。
- 安装后 lockfile 变化。
- 生产构建兼容性。
- Tasks 与 Calendar 路由的客户端包体变化。

### 3.2 动画所有权

每个视觉属性由一个系统管理：

| 对象 | 位移/缩放所有者 | 透明度/内容所有者 |
|---|---|---|
| Base UI Drawer | Base UI CSS 变量与状态属性 | Drawer 背景由 CSS；内部区块由 Motion |
| Planner 任务行 | Motion layout | Motion AnimatePresence |
| FullCalendar 事件块 | FullCalendar | CSS 状态与业务反馈层 |
| 日期 Popover | Base UI 定位 | Motion 或 Base UI 状态 CSS，二选一 |
| 路由切换 | React/Next View Transition | View Transition |
| Toast | Base UI Toast | Base UI 状态 CSS |

### 3.3 写入与动画时序

高频写入遵循：

```text
用户事件
├── 同步写入乐观状态
├── 立即 startTransition 调用 Server Action
└── 同一帧启动视觉反馈
```

实现约束：

- Server Action 调用前的代码保持同步。
- 动画完成与网络请求并行。
- Action 调用保持在原始用户事件上下文。
- `revalidatePath` 继续承担结构性写入的缓存失效。
- 失败结果恢复实体、选择、排序和输入草稿。
- 删除撤销调用现有 restore Action，并带新的稳定 `clientMutationId`。

### 3.4 CSS 架构

目标结构：

```text
src/styles/
├── tokens.css
├── summit.css
└── planner/
    ├── primitives.module.css
    ├── tasks.module.css
    ├── calendar.module.css
    └── motion.module.css
```

规则：

- `tokens.css` 保存颜色、间距、字体、圆角、阴影和跨功能语义 token。
- `summit.css` 保存应用壳层与跨页面结构。
- Planner 与 Calendar 的布局、组件和响应式规则进入功能 CSS Modules。
- 新动效使用现有 `--motion-*` token。
- 新动画属性限定为 transform、opacity 和必要的颜色变化。
- CSS transition 精确列出属性。
- `html[data-motion="reduce"]`、`prefers-reduced-motion` 和 View Transition 压制覆盖新交互。
- 样式迁移按组件进行，每次迁移后删除对应旧规则，保持单一来源。

## 4. 目标信息架构

### 4.1 Tasks 桌面

适用：宽度 ≥ 1180px。

```text
┌──────── 232px ────────┬──────────── 弹性主区 ────────────┬──── 380px ────┐
│ 智能视图              │ 快速收集 / 过滤 / 批量工具        │ 任务详情       │
│ 清单                  │ 分组任务列表                       │ 常用字段       │
│ 标签                  │                                    │ 渐进配置       │
└───────────────────────┴────────────────────────────────────┴──────────────┘
```

- 工作区高度为可视区域减去页面标题和应用栏。
- 左栏、中栏、右栏各自滚动。
- 快速收集与任务分组标题保持可见。
- 任务详情顶部显示完成、标题、关闭和写入状态。
- 详情底部显示粘性保存状态区。
- 用户选择任务后，列表滚动位置保持稳定。

### 4.2 Tasks 平板

适用：761–1179px。

- 左栏宽度 200–220px。
- 任务列表占据剩余区域。
- 任务详情使用右侧 Drawer，目标宽度 420px。
- Drawer 打开后焦点进入标题。
- Drawer 关闭后焦点回到触发任务行。
- 批量工具在任务列表顶部使用粘性浮条。

### 4.3 Tasks 手机

适用：≤760px。

- 智能视图使用可横向滚动的分段导航。
- 页面首屏展示快速收集和任务列表。
- 快速收集默认展示标题与添加按钮。
- 清单、到期、优先级进入可展开的更多选项。
- 任务详情使用底部 Sheet。
- Sheet snap point 建议为约 42% 与接近全屏。
- Sheet 使用 `Drawer.VirtualKeyboardProvider`。
- Sheet 顶部包含拖动把手、完成按钮、标题摘要和关闭按钮。
- Sheet 内部独立滚动。
- Sheet 粘性操作区计算 `safe-area-inset-bottom` 与移动导航高度。

### 4.4 任务详情分区

默认展开：

1. 标题、完成状态、清单、优先级。
2. 到期、计划日期、开始时间、预计时长。

摘要折叠：

3. 标签与子任务。
4. 提醒与重复。
5. 备注。
6. 活动事实、版本和删除。

摘要示例：

- `提前 10 分钟 · 应用内`
- `每周重复 · 共 12 次`
- `3 个子任务 · 完成 1 个`
- `2 个标签`

### 4.5 Calendar 桌面

适用：宽度 ≥ 1180px。

```text
┌─────────────────────── 紧凑状态条 ─────────────────────────┐
├───────────────────────────────┬─────────────────────────────┤
│ 日历工具栏与时间画布           │ 360px 上下文栏              │
│ 月 / 周 / 日 / 议程            │ 待排任务 / 事件详情 / 创建器 │
└───────────────────────────────┴─────────────────────────────┘
```

- 状态条保留已排时间、待排任务、完成率和近期节点。
- 日历工具栏统一前后导航、今天、日期、视图和新建入口。
- 右栏一次展示一个上下文。
- 默认上下文为待排任务。
- 新建事件通过右栏 Composer 或小型 Popover 启动。
- 选择事件后切换到事件详情。
- 关闭详情后恢复先前的待排任务滚动位置。

### 4.6 Calendar 平板

- 日历画布占满主工作区。
- 待排任务、事件创建和事件详情使用右侧 Drawer。
- 工具栏压缩为日期导航、视图菜单和新增按钮。
- 周视图保持时间轴；月视图保留清晰事件密度。

### 4.7 Calendar 手机

- 默认进入议程列表。
- 顶部显示横向日期条、今天按钮和新增按钮。
- 每日内容使用分组卡片。
- 卡片组合事件、任务、里程碑和完成进度。
- 月视图承担日期导航。
- 任务排期、事件创建和事件详情使用底部 Sheet。
- Sheet 表单使用单列布局。
- 日期与时间在空间允许时使用双列。
- 主操作区保持可触达并避开移动导航。

### 4.8 日历实体视觉语义

| 实体 | 主标记 | 辅助信息 | 完成/历史 |
|---|---|---|---|
| 任务 | 圆形勾选或任务色条 | 优先级、预计时长 | 降低对比度并保留标题 |
| 普通事件 | 日历颜色条 | 时间、地点 | 保持事件样式 |
| 专注块 | 实心时间块 | 时长、关联任务 | 完成图标 |
| 考试/里程碑 | 菱形或里程碑图标 | 日期、科目 | 历史样式 |
| 冲突 | 警告边框与文本 | 冲突原因 | 解决入口 |

颜色、图标、线型和文字共同表达状态。

## 5. 动效规格

### 5.1 Token

使用或扩展项目 token：

| 语义 | 用途 |
|---|---|
| `--motion-instant` | 按压与高频状态 |
| `--motion-fast` | hover、focus、切换 |
| `--motion-base` | 列表插入、选择与布局 |
| `--motion-panel` | Popover、Drawer、Sheet |
| `--motion-reward` | 完成勾选与阶段清零 |
| `--motion-ease-standard` | 常规进入与布局 |
| `--motion-ease-exit` | 退出 |
| `--motion-ease-snappy` | 完成与吸附 |

如现有 token 缺少相应语义，在 `summit.css` 的运动 token 区追加命名 token，并由三类减少动效规则统一覆盖。

### 5.2 卡片与 Popover

参考视觉状态：

```ts
closed: { opacity: 0, scale: 0.96, y: 12 }
open:   { opacity: 1, scale: 1, y: 0 }
exit:   { opacity: 0, scale: 0.98, y: 6 }
```

- transform origin 根据触发器位置设置。
- Backdrop 使用 opacity。
- 进入使用标准或轻弹簧。
- 退出时长短于进入。
- 日期卡片根据可用空间从上方或下方进入。

### 5.3 任务行

- 列表容器使用 `LayoutGroup`。
- 行使用 `layout="position"`。
- `AnimatePresence mode="popLayout"` 处理增删。
- 新任务从快速收集方向轻微上移并淡入。
- 完成任务先播放勾选，再进入完成状态和分组重排。
- 删除任务淡出并收拢布局。
- 删除成功显示带撤销操作的 Toast。
- 写入失败恢复原位置并短暂显示错误边框。
- 选择背景使用共享 `layoutId`。

### 5.4 Drawer 与 Sheet

- Drawer 的手势位移使用 Base UI CSS 变量。
- Drawer 内容区块进入使用 opacity 与小幅 y。
- 平板右侧 Drawer 使用 x 方向。
- 手机 Sheet 使用 y 方向和两个 snap point。
- 软键盘打开时主输入与操作区保持可见。
- 用户连续打开不同任务时复用同一 Drawer 容器，只替换内部内容。

### 5.5 日历拖拽

- FullCalendar mirror 采用半透明、轻阴影和清晰标题。
- 可放置日期或时间槽显示高亮。
- 吸附时间通过紧凑提示展示。
- 提交期间显示非阻塞 pending 标记。
- 失败调用 `revert()` 并播放一次短回弹。
- 成功反馈在实体附近显示短暂状态，Toast 用于跨区域结果。

### 5.6 减少动效

- `MotionConfig reducedMotion="user"` 放在 Planner 客户端边界上层。
- 大面积位移与缩放切换为短 opacity。
- 列表直接进入最终布局。
- Drawer 直接进入目标 snap point。
- 完成、失败和冲突继续通过图标、文本、颜色与 aria-live 表达。

## 6. 组件边界

### 6.1 新建共享组件

```text
src/components/ui/
├── MotionProvider.tsx
├── PlannerDrawer.tsx
├── PlannerPopover.tsx
├── PlannerCollapsible.tsx
├── PlannerToast.tsx
├── PlannerSegmentedControl.tsx
└── PlannerStatusIndicator.tsx
```

共享组件职责：

- 封装 Base UI anatomy、portal、焦点和默认 aria。
- 封装 Motion token 与减少动效。
- 暴露受控状态和最小业务无关 API。
- 保持服务端可导入文件与客户端实现边界清晰。

### 6.2 Tasks

```text
src/components/planner/
├── PlannerTasksWorkspace.tsx
├── PlannerSidebar.tsx
├── PlannerQuickCapture.tsx
├── PlannerTaskGroups.tsx
├── PlannerTaskList.tsx
├── PlannerTaskRow.tsx
├── PlannerBatchBar.tsx
├── PlannerTaskInspector.tsx
├── PlannerTaskSheet.tsx
├── PlannerTaskBasics.tsx
├── PlannerTaskSchedule.tsx
├── PlannerTaskLabels.tsx
├── PlannerTaskReminders.tsx
├── PlannerTaskRecurrence.tsx
├── PlannerTaskSubtasks.tsx
├── planner-optimistic.ts
├── planner-view-model.ts
└── tasks.module.css
```

`src/components/PlannerTasks.tsx` 在迁移期间保留为兼容入口，最终只负责组合或转出 `PlannerTasksWorkspace`。

### 6.3 Calendar

```text
src/components/calendar/
├── CalendarWorkspace.tsx
├── CalendarOverview.tsx
├── CalendarToolbar.tsx
├── CalendarCanvas.tsx
├── CalendarAgenda.tsx
├── CalendarEventContent.tsx
├── CalendarContextRail.tsx
├── CalendarEventComposer.tsx
├── CalendarEventInspector.tsx
├── CalendarTaskInbox.tsx
├── CalendarDayPopover.tsx
├── CalendarMobileSheet.tsx
├── CalendarMutationFeedback.tsx
├── calendar-events.ts
├── calendar-view-model.ts
└── calendar.module.css
```

`src/components/CalendarView.tsx` 在迁移期间保留为兼容入口，最终只负责组合或转出 `CalendarWorkspace`。

### 6.4 状态边界

状态按职责拆分：

- 服务端初始实体：页面 Server Component。
- 当前视图、选中实体、Drawer 状态：Workspace。
- 表单草稿：Inspector/Composer。
- 乐观实体集合：专用 reducer 或 hook。
- Toast 与全局反馈：统一 Provider。
- FullCalendar 可见范围：CalendarCanvas。
- 范围请求和 stale response 防护：Calendar Workspace hook。

## 7. 分阶段实施

### Phase 0｜契约、失败测试与技术原型（1–1.5 天）

目标：冻结交互语义、响应式行为和技术组合。

实施状态：已完成（2026-07-31）。交互规格、三视口基线、空/错误/冲突 fixture、响应式与恢复纯函数契约、Motion/Base UI/FullCalendar 导入原型和隔离生产构建已通过。Phase 0 闸门命令：`npm test`（53 files / 343 tests）、`npm run lint`、`npm run typecheck`、隔离副本 `npm run build`。

#### 任务 0.1：建立基线证据

文件：

- 新建 `docs/superpowers/specs/2026-07-31-planner-frontend-redesign.md`
- 新建或扩展截图目录 `docs/screenshots/planner/`
- 更新 `docs/superpowers/plans/2026-07-31-planner-frontend-redesign.md` 状态

步骤：

1. 在隔离实例创建正常、高密度、空、错误和冲突 fixture。
2. 采集 1440×1000、900×1100、390×844 的 Tasks 与 Calendar。
3. 记录首屏结构、页面高度、水平溢出、触控目标、焦点路径和客户端错误。
4. 记录当前构建、测试和响应式审计结果。
5. 记录当前 Tasks 与 Calendar 路由客户端资源基线。

#### 任务 0.2：先写失败测试

文件：

- 更新 `src/components/PlannerTasks.test.ts`
- 更新 `src/components/CalendarView.test.ts`
- 新建 `src/components/planner/planner-view-model.test.ts`
- 新建 `src/components/calendar/calendar-view-model.test.ts`
- 更新 `scripts/responsive-audit.mjs`

失败断言：

1. 900px 任务详情使用 Drawer。
2. 390px 任务详情使用底部 Sheet。
3. 390px Calendar 默认议程。
4. 390px 事件创建使用底部 Sheet。
5. Drawer 关闭后焦点回到触发元素。
6. Escape 关闭 Popover/Drawer。
7. 任务完成失败恢复状态与原位置。
8. 拖拽失败调用 `revert()`。
9. 拖拽功能具备点击式日期时间入口。
10. 新 Planner 组件样式使用运动 token。

现有源码字符串断言逐步转为纯函数测试和 Playwright 行为测试；安全路径与 Action 调用边界保留必要静态断言。

#### 任务 0.3：技术原型

原型范围：

1. Base UI Drawer：
   - 桌面/平板右侧 Drawer。
   - 390px 双 snap point 底部 Sheet。
   - 虚拟键盘下的标题输入和粘性按钮。
2. Motion：
   - 三条任务的新增、完成、删除和重排。
   - 删除撤销 Toast。
   - 减少动效模式。
3. FullCalendar：
   - 自定义 `eventContent`。
   - 拖拽 mirror、落点反馈和失败回弹。
4. Portal：
   - 应用壳层、移动底部导航、Drawer、Popover、Toast 的 z-index 和 safe area。

原型代码进入最终共享组件或测试 fixture，保持可继续演进。

#### Phase 0 闸门

- 目标线框与交互 spec 完成。
- 失败测试稳定复现当前问题。
- Base UI、Motion、FullCalendar 与 Next 16 生产构建兼容。
- Drawer 虚拟键盘、焦点恢复和减少动效原型通过。
- 包体变化和依赖许可证已记录。
- 父计划的数据与写入契约保持完整。

### Phase 1｜设计系统、共享原语与 CSS 边界（1.5–2 天）

目标：建立后续 Tasks 与 Calendar 共用的可靠交互层。

实施状态：已完成（2026-07-31）。`motion@12.43.0`、`@base-ui/react@1.6.0` 已锁定；共享 Motion、Drawer/Sheet、Popover、Collapsible、Toast、Segmented Control 与状态原语已实现；Base UI Dialog/Toast 已接入全局 FeedbackProvider；Planner CSS Modules、语义 token、三层减少动效规则与生产构建已通过。

#### 任务 1.1：依赖与 Provider

文件：

- 更新 `package.json`
- 更新 `package-lock.json`
- 新建 `src/components/ui/MotionProvider.tsx`
- 更新 `src/components/AppShell.tsx` 或 Planner 最近公共客户端边界

步骤：

1. 安装并锁定 `motion` 与 `@base-ui/react` 当前稳定版本。
2. 增加 `LazyMotion`、`MotionConfig reducedMotion="user"`。
3. 保持 Provider 层级最小。
4. 验证 Server Component 与客户端边界。

#### 任务 1.2：共享交互原语

文件：

- 新建 `src/components/ui/PlannerDrawer.tsx`
- 新建 `src/components/ui/PlannerPopover.tsx`
- 新建 `src/components/ui/PlannerCollapsible.tsx`
- 新建 `src/components/ui/PlannerToast.tsx`
- 新建 `src/components/ui/PlannerSegmentedControl.tsx`
- 新建 `src/components/ui/PlannerStatusIndicator.tsx`
- 更新或适配 `src/components/FeedbackProvider.tsx`

行为：

- 受控 open state。
- Title、Description、Close 与 aria 约束。
- Escape、外部点击、焦点圈和焦点归还。
- Drawer snap point、手势与虚拟键盘。
- Toast success/error/conflict/undo。
- reduced motion。

#### 任务 1.3：Token 与样式迁移底座

文件：

- 更新 `src/styles/tokens.css`
- 更新 `src/styles/summit.css`
- 新建 `src/styles/planner/primitives.module.css`
- 新建 `src/styles/planner/motion.module.css`

新增或确认：

- Planner 表面层级。
- selected、pending、conflict、danger、success 状态。
- Drawer、Popover、Toast 阴影与 z-index。
- compact/comfortable 密度。
- 44px 触控与 32px 桌面紧凑目标。
- safe area 和移动导航高度 token。

#### 任务 1.4：共享原语测试

文件：

- 新建 `src/components/ui/planner-primitives.test.ts`
- 更新 `scripts/responsive-audit.mjs`

验证：

- 焦点进入、循环和归还。
- Escape 与关闭按钮。
- 减少动效。
- 390px 虚拟键盘。
- Toast 撤销操作。
- 深浅色状态对比。

#### Phase 1 闸门

- 共享原语可在隔离页面或实际 Planner 入口运行。
- `npm test`、`npm run lint`、`npm run typecheck`、`npm run build` 通过。
- 新 CSS 动效只使用 token。
- 新弹层具备焦点与键盘语义。
- Tasks 与 Calendar 现有写入行为保持通过。

### Phase 2｜Tasks 工作区重构（2–2.5 天）

目标：建立高效收集、组织、编辑和完成体验。

实施状态：已完成（2026-07-31）。Tasks 已拆为 Workspace、Sidebar、Quick Capture、分组列表、Motion 任务行、渐进 Inspector 与响应式 Drawer/Sheet；乐观 reducer 覆盖 RSC 回流去重、原位恢复和选择恢复；Base UI Toast 撤销继续调用现有 restore Action。

#### 任务 2.1：拆分状态与视图模型

文件：

- 新建 `src/components/planner/planner-optimistic.ts`
- 新建 `src/components/planner/planner-view-model.ts`
- 新建相应测试
- 重构 `src/components/PlannerTasks.tsx`

步骤：

1. 提取 optimistic reducer、任务分组、选择恢复和草稿回滚。
2. 测试新增、replace、patch、remove、restore 和批量恢复。
3. 保持客户端排序与 repo 排序一致。
4. 处理选中任务完成、删除、切换视图和 RSC 回流后的选择状态。

#### 任务 2.2：桌面与平板布局

文件：

- 新建 `PlannerTasksWorkspace.tsx`
- 新建 `PlannerSidebar.tsx`
- 新建 `PlannerTaskGroups.tsx`
- 新建 `PlannerTaskList.tsx`
- 新建 `PlannerTaskRow.tsx`
- 新建 `PlannerTaskInspector.tsx`
- 新建 `tasks.module.css`

步骤：

1. 建立桌面三栏独立滚动。
2. 建立平板两栏与右侧 Drawer。
3. 保持快速收集和批量工具清晰可见。
4. 使用共享选中背景与布局动画。
5. 将删除移入清晰的行操作菜单或危险操作入口。

#### 任务 2.3：移动任务体验

文件：

- 新建 `PlannerTaskSheet.tsx`
- 新建 `PlannerQuickCapture.tsx`
- 更新 `tasks.module.css`

步骤：

1. 智能视图改为横向分段导航。
2. 快速收集默认保持单行核心输入。
3. 更多字段通过 Collapsible 展开。
4. 任务详情使用双 snap point Sheet。
5. Sheet 使用虚拟键盘 Provider。
6. 粘性操作区避开底部导航和 safe area。

#### 任务 2.4：渐进任务详情

文件：

- 新建 `PlannerTaskBasics.tsx`
- 新建 `PlannerTaskSchedule.tsx`
- 新建 `PlannerTaskLabels.tsx`
- 新建 `PlannerTaskReminders.tsx`
- 新建 `PlannerTaskRecurrence.tsx`
- 新建 `PlannerTaskSubtasks.tsx`

步骤：

1. 常用字段与时间默认展开。
2. 标签、提醒、重复、子任务、备注和系统信息显示摘要。
3. 展开状态按实体与当前会话保存。
4. 表单错误定位到对应区块并自动展开。
5. 冲突展示服务端快照摘要与刷新入口。

#### 任务 2.5：Tasks 语义动效

步骤：

1. 新增任务插入动画。
2. 完成勾选与分组重排。
3. 删除退场、Toast 撤销和失败恢复。
4. selected `layoutId`。
5. 批量工具展开。
6. pending、success、error、conflict 状态。

Action 在用户事件内立即启动；视觉退场与请求并行。

#### 任务 2.6：Tasks 测试

覆盖：

- 桌面三栏。
- 平板 Drawer。
- 390px Sheet。
- 快速收集键盘提交。
- 完成、删除、撤销、失败恢复。
- 标签、提醒、重复、子任务分区。
- 焦点恢复和 aria-live。
- 两个 workspace 隔离 smoke。

#### Phase 2 闸门

闸门结果：已通过。`npm test` 为 55 files / 357 tests，`npm run lint` 与 `npm run typecheck` 通过，隔离副本生产构建通过。生产 E2E 实测 1440px 为 `232px / 475.844px / 380px` 三栏且工作区底部 998px；900px Drawer 宽 420px；390px Sheet 宽 390px；三个视口水平溢出均为 0。Drawer/Sheet 标题焦点进入与 Escape 焦点归还通过，方向键选择、减少动效、快速收集、删除 Toast 撤销和版本冲突恢复通过。

- 1440px 三栏保持可视工作区高度。
- 900px 详情通过 Drawer 展示。
- 390px 页面主体只展示导航、收集和列表；详情进入 Sheet。
- 常用字段两次交互内可达。
- 新增、完成、删除和恢复动效通过正常与减少动效验证。
- Tasks Action、repo 和 workspace 测试保持通过。
- 390px 页面级水平溢出为 0。

### Phase 3｜Calendar 工作区重构（2–2.5 天）

目标：建立清晰的时间画布、上下文编辑和移动议程。

实施状态：已完成（2026-07-31）。Calendar 已拆为兼容入口、Workspace、概览、工具栏、FullCalendar Canvas、自定义事件内容、单一上下文栏、Composer、Inspector、待排任务、Base UI 日期 Popover、移动议程与 Drawer/Sheet。空日期 Planner 任务投影、范围请求 stale response、事件时区跨午夜分组和点击式改期均由独立纯函数测试覆盖。

#### 任务 3.1：拆分 Calendar 状态

文件：

- 新建 `src/components/calendar/calendar-events.ts`
- 新建 `src/components/calendar/calendar-view-model.ts`
- 新建相应测试
- 重构 `src/components/CalendarView.tsx`

提取：

- 任务/事件/考试投影。
- 日期与时间格式化。
- 乐观 event patch。
- 可见范围请求与 stale response 防护。
- selected event、selected day 和 context rail state。
- FullCalendar drop/resize 结果处理。

#### 任务 3.2：桌面时间画布与上下文栏

文件：

- 新建 `CalendarWorkspace.tsx`
- 新建 `CalendarOverview.tsx`
- 新建 `CalendarToolbar.tsx`
- 新建 `CalendarCanvas.tsx`
- 新建 `CalendarContextRail.tsx`
- 新建 `calendar.module.css`

步骤：

1. 压缩概览为紧凑状态条。
2. 自定义工具栏。
3. 右栏一次展示待排、创建或详情。
4. 保持右栏和日历主区独立滚动。
5. 保存上下文切换前的滚动位置。

#### 任务 3.3：FullCalendar 视觉层

文件：

- 新建 `CalendarEventContent.tsx`
- 更新 `CalendarCanvas.tsx`
- 更新 `calendar.module.css`

步骤：

1. 使用 `eventContent` 渲染任务、事件和里程碑。
2. 处理窄事件、短事件、重叠和高密度日期。
3. 保留 FullCalendar 的可访问名称与点击入口。
4. 增加 mirror、可放置槽、pending 和 conflict 状态。
5. 失败时调用 `revert()` 并恢复本地实体。

#### 任务 3.4：日期卡片与编辑器

文件：

- 新建 `CalendarDayPopover.tsx`
- 新建 `CalendarEventComposer.tsx`
- 新建 `CalendarEventInspector.tsx`
- 新建 `CalendarTaskInbox.tsx`

步骤：

1. 日期卡片使用共享 Popover。
2. 事件 Composer 使用渐进字段。
3. 事件详情、提醒和重复使用摘要分区。
4. 待排任务保持独立列表和明确排入入口。
5. 点击式“移动到日期/时间”与拖拽共享 Action。

#### 任务 3.5：移动议程与 Sheet

文件：

- 新建 `CalendarAgenda.tsx`
- 新建 `CalendarMobileSheet.tsx`
- 更新 `calendar.module.css`

步骤：

1. 390px 默认议程。
2. 增加横向日期条与今天入口。
3. 每日分组卡片合并任务、事件和节点。
4. 新建、详情和排期使用底部 Sheet。
5. Sheet 与移动底部导航、安全区和软键盘协调。

#### 任务 3.6：Calendar 测试

覆盖：

- 月/周/日/议程切换。
- 自定义任务、事件和里程碑内容。
- 右栏上下文互斥。
- 平板 Drawer。
- 390px 议程与 Sheet。
- 全天、多日、跨午夜和时区展示。
- 拖拽、缩放、失败 revert。
- 点击式日期时间替代路径。
- 范围请求 stale response。
- 两个 workspace。

#### Phase 3 闸门

闸门结果：已通过。`npm test` 为 56 files / 368 tests，`npm run lint`、`npm run typecheck` 和隔离副本生产构建通过。生产 E2E 实测月、周、日、议程四视图切换；1440px 为 `727.844px / 360px` 画布与单上下文栏，900px 上下文进入 420px Drawer，390px 默认议程且表单进入 390px Sheet。三个视口水平溢出均为 0，Drawer/Sheet 标题焦点进入和 Escape 焦点归还通过。FullCalendar 自定义 eventContent、Base UI 日期 Popover、任务点击排期、事件点击改期与版本冲突恢复通过，控制台错误为 0。

- 桌面首屏主要空间用于时间画布。
- 右栏一次展示一个编辑上下文。
- 900px 侧栏内容进入 Drawer。
- 390px 默认议程，事件表单进入 Sheet。
- 月视图高密度日期保持可读。
- 拖拽和点击式改期共享结果语义。
- FullCalendar 定位与 Motion 之间无视觉抖动。
- Calendar Action、repo、范围 API 和时区测试保持通过。

### Phase 4｜反馈、可访问性、性能与跨页面一致性（1–1.5 天）

目标：完成产品级硬化。

#### 任务 4.1：统一写入状态

为 Tasks 与 Calendar 统一：

- idle。
- optimistic/pending。
- saved。
- conflict。
- error。
- restored。

规则：

- 高频成功反馈优先在实体附近表达。
- 删除、批量操作和跨区域结果使用 Toast。
- 冲突保持可见，提供刷新实体与重试入口。
- 输入草稿在验证与网络失败后保持。
- aria-live 分为 polite 与 assertive。

#### 任务 4.2：键盘与触控

键盘路径：

1. 快速收集。
2. 上下选择任务。
3. 打开详情。
4. 完成任务。
5. 关闭 Drawer/Popover。
6. 切换日历视图。
7. 打开日期卡片。
8. 使用菜单改期。

触控路径：

- 手机主要操作目标 44×44px。
- 相邻危险操作保持充足间距。
- Sheet 拖动把手与内容滚动协调。
- 拖拽功能具备单击式替代入口。

#### 任务 4.3：减少动效与主题

矩阵：

| 模式 | Light | Dark |
|---|---|---|
| 正常动效 | 必测 | 必测 |
| 系统减少动效 | 必测 | 必测 |
| 应用内 reduce 设置 | 必测 | 抽测 |

验证：

- transform/layout 动画降级。
- 信息反馈完整。
- 焦点、边框与状态对比清晰。
- Drawer、Popover 和 Toast 主题一致。

#### 任务 4.4：性能

记录并控制：

- Tasks 与 Calendar 客户端资源变化。
- FullCalendar 首次加载。
- Drawer 首次打开。
- 100 条任务列表的完成与删除。
- 200 个可见日历实例的月视图。
- 连续拖拽和连续完成时的长任务。

目标：

- 用户操作后 100ms 内出现视觉响应。
- 动画期间主线程长任务保持在 50ms 内。
- Drawer 与任务列表交互无明显布局跳变。
- 月视图切换保持父计划的 1.5s 首屏预算。
- LazyMotion 和按需编辑器维持合理初始包体。

#### 任务 4.5：CSS 收口

步骤：

1. 删除已迁移的 Planner/Calendar 旧全局规则。
2. 合并重复 `.calendarLayout`。
3. 清理已失效 media query。
4. 确认所有皮肤依赖语义 token。
5. 确认 View Transition 与 Motion 作用域分离。

#### Phase 4 闸门

闸门结果：已通过。`npm test` 为 58 files / 376 tests，`npm run lint`、`npm run typecheck` 和隔离副本生产构建通过。生产矩阵覆盖 1440px、900px、390px 的 Light/Dark、系统 reduced motion 与应用内 reduce，水平溢出、无名称控件、移动输入字号、触控目标、焦点进入/归还、客户端错误和未处理 Promise 均为 0。旧 Planner/Calendar 全局 CSS 已移除，响应式与 smoke 脚本切换到稳定语义契约。

性能负载使用隔离库的 100 条 Planner v2 任务和 200 个当月事件：Tasks 首屏 1170ms，Calendar 月视图 766ms；连续 10 次完成的最大视觉响应 10.9ms，连续 10 次删除为 47.1ms，交互期 Long Task 为 0。月格使用 `dayMaxEvents={2}` 聚合高密度内容；移动议程按日期单次分组，200 事件下首屏从 2.5s 降至约 750ms。客户端资源记录为桌面脚本 474KB、平板/手机脚本 440KB；高密度 Calendar 编码资源 772–832KB，主要包含 200 个事件的 RSC 数据。

- WCAG 2.2 AA 核心路径通过。
- 390px、900px、1440px 深浅色通过。
- 减少动效保持完整信息反馈。
- 触控、键盘与点击式拖拽替代路径通过。
- 客户端错误、hydration warning 和未处理 Promise 为 0。
- CSS 规则具备单一来源。

### Phase 5｜隔离验证、文档与交付（1 天）

目标：完成可发布证据链。

#### 任务 5.1：自动门禁

运行：

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run verify:migration
npm run verify:planner-migration
npm run smoke
npm run responsive:audit
npm run verify:backup
node scripts/verify-planner-migration.mjs
```

记录每条命令的退出码、运行时间和失败修复。

#### 任务 5.2：verify skill

在隔离实例验证：

- 新 workspace。
- 迁移 workspace。
- 两个 workspace 并行。
- 1440×1000、900×1100、390×844。
- Light、Dark、reduce motion。
- Tasks 新增、完成、删除、撤销和失败恢复。
- Calendar 创建、拖拽、缩放和失败 revert。
- 提醒与重复数据。
- 在线写入和 RSC 回流。
- 移动软键盘与底部 Sheet。

#### 任务 5.3：视觉交付

截图至少覆盖：

- Tasks：Inbox、Today、Completed、Trash。
- Task Inspector：基础、时间、提醒、重复、冲突。
- Calendar：月、周、日、议程。
- Calendar：事件创建、事件详情、待排任务。
- 空状态、高密度状态、错误和恢复。
- 三个目标视口、深浅色和减少动效。

#### 任务 5.4：文档

更新：

- 本执行文档状态。
- 父计划 Phase 2/3 的前端质量补充状态。
- `docs/agent-development-guide.md` 中稳定的 Planner 动效或弹层规则。
- 相关帮助文本和 Agent 界面文档。
- `docs/reports/2026-07-31-planner-frontend-redesign-delivery.md`。

报告使用：

- `[COMPUTED]`：命令、截图、测量、代码和数据库直接证据。
- `[KNOWN]`：产品与架构已确认事实。
- `[INFERRED]`：体验判断、风险和后续建议。

#### Phase 5 闸门

闸门结果：工程验证通过，视觉验收撤回。最终 `npm test` 为 58 files / 376 tests，`npm run lint`、`npm run typecheck`、Next.js 16.2.12 生产构建、32 项生产 smoke、响应式审计、workspace 迁移审计、Planner 迁移审计与备份完整性验证全部通过。verify skill 使用 `/tmp/ascend-planner-verify.TH5cx7` 隔离数据根和 3123 端口，覆盖新 workspace、迁移 workspace、两 workspace 并行、三档视口、Light/Dark/reduce、RSC 回流、任务与事件提醒/重复、任务冲突回滚与撤销、日历拖拽/缩放/conflict revert、390px Sheet 焦点与软键盘目标。运行时错误为 0。上述证据证明功能和数据契约稳定；视觉复核发现的缺陷进入独立整改计划。

前后视觉证据共 48 张：10 张基线截图与 38 张完成态截图。完成态覆盖 Tasks 的 Inbox、Today、Completed、Trash、Inspector、提醒、重复、冲突与恢复，以及 Calendar 的月、周、日、议程、创建、详情、待排任务、Drawer、Sheet、三视口、深浅色和减少动效。交付报告见 `docs/reports/2026-07-31-planner-frontend-redesign-delivery.md`。

- [x] 所有自动门禁通过。
- [x] verify skill 完成工程目标矩阵。
- [ ] 前后截图通过人工视觉评审。
- [x] 两个 workspace 数据隔离通过。
- [x] Planner 核心写路径通过生产交互验证。
- [x] 交付报告、执行文档和父计划状态已修订。

## 8. 测试矩阵

### 8.1 Tasks

| 场景 | Unit | Component/Source | Playwright |
|---|---:|---:|---:|
| optimistic reducer | ✓ |  |  |
| 分组与排序 | ✓ |  | ✓ |
| 快速收集 |  | ✓ | ✓ |
| 完成与失败恢复 | ✓ | ✓ | ✓ |
| 删除与撤销 | ✓ | ✓ | ✓ |
| 批量操作 | ✓ | ✓ | ✓ |
| Drawer/Sheet 焦点 |  | ✓ | ✓ |
| 提醒与重复摘要 | ✓ | ✓ | ✓ |
| workspace 隔离 | ✓ |  | ✓ |

### 8.2 Calendar

| 场景 | Unit | Component/Source | Playwright |
|---|---:|---:|---:|
| event projection | ✓ |  | ✓ |
| 范围与 stale response | ✓ | ✓ | ✓ |
| 自定义 eventContent | ✓ | ✓ | ✓ |
| 月/周/日/议程 |  | ✓ | ✓ |
| 拖拽与 revert | ✓ | ✓ | ✓ |
| 缩放与 revert | ✓ | ✓ | ✓ |
| 点击式改期 | ✓ | ✓ | ✓ |
| 全天/多日/跨午夜 | ✓ |  | ✓ |
| Drawer/Sheet |  | ✓ | ✓ |
| workspace 隔离 | ✓ |  | ✓ |

### 8.3 视觉与可访问性

- 390px 页面级水平溢出。
- 900px Drawer 结构。
- 1440px 独立滚动区域。
- 44px 移动目标。
- 16px 移动表单字体。
- safe area。
- 移动导航与 Sheet。
- 焦点可见与焦点归还。
- Escape。
- aria-live。
- reduced motion。
- Light/Dark。
- 200% zoom。

## 9. 文件级变更清单

### 9.1 必改

- `package.json`
- `package-lock.json`
- `src/components/PlannerTasks.tsx`
- `src/components/PlannerTasks.test.ts`
- `src/components/CalendarView.tsx`
- `src/components/CalendarView.test.ts`
- `src/components/AppShell.tsx`
- `src/components/FeedbackProvider.tsx`
- `src/styles/tokens.css`
- `src/styles/summit.css`
- `scripts/responsive-audit.mjs`
- `scripts/smoke.mjs`

### 9.2 新建

- `src/components/ui/` 下 Planner 交互原语。
- `src/components/planner/` 下 Tasks 子组件、纯函数和测试。
- `src/components/calendar/` 下 Calendar 子组件、纯函数和测试。
- `src/styles/planner/` 下 CSS Modules。
- `docs/superpowers/specs/2026-07-31-planner-frontend-redesign.md`
- `docs/reports/2026-07-31-planner-frontend-redesign-delivery.md`
- Planner 前后截图。

### 9.3 条件修改

以下文件只在验证证明需要时调整：

- `src/app/tasks/page.tsx`
- `src/app/calendar/page.tsx`
- `src/app/actions/planner-tasks.ts`
- `src/app/actions/planner-events.ts`
- `src/app/actions/planner-reminders.ts`
- `src/components/Sidebar.tsx`
- `next.config.ts`

条件修改保持现有 Action、repo、workspace 和 revalidation 契约。

## 10. 风险与控制

| 风险 | 影响 | 控制 |
|---|---|---|
| 动画延迟 Server Action | RSC 回流可能丢失 | Action 在原始事件内立即启动；动画与请求并行 |
| Drawer Portal 与应用壳层叠层冲突 | 焦点、导航与操作区受遮挡 | Phase 0 建立 z-index、safe area 和焦点原型 |
| 移动软键盘改变视口 | 输入与保存按钮移出可视区 | Base UI VirtualKeyboardProvider、动态视口和 Playwright 实机尺寸验证 |
| Motion 与 FullCalendar 同时写 transform | 日历事件抖动 | FullCalendar 独占事件定位；Motion 作用于周边业务层 |
| CSS Modules 迁移期间双重规则 | 视觉级联漂移 | 按组件迁移并同步删除旧规则 |
| 乐观退场与 RSC 回流竞态 | 行闪烁或重复 | 稳定 key、mutation id、optimistic reducer 和回流测试 |
| selected entity 在回流后失效 | Drawer 展示陈旧实体 | 以 id/version 对齐新实体，缺失时关闭并归还焦点 |
| 依赖增加客户端体积 | Planner 首屏变慢 | LazyMotion、tree-shaken Base UI、动态加载低频编辑器、基线对比 |
| 低频字段折叠降低发现性 | 用户难以找到提醒或重复 | 摘要行、图标、搜索命令和错误自动展开 |
| 移动导航与 Sheet 争夺空间 | 主操作受遮挡 | 统一导航高度 token、safe area 和双 snap point |

## 11. 回滚与恢复点

实施期间保留以下恢复边界：

1. Phase 0：只有文档、测试和技术原型。
2. Phase 1：共享原语与 token 可独立回退。
3. Phase 2：`PlannerTasks.tsx` 兼容入口保持页面调用稳定。
4. Phase 3：`CalendarView.tsx` 兼容入口保持页面调用稳定。
5. Phase 4：旧 CSS 在每个组件完成验证后移除。
6. Phase 5：发布前保留构建产物、数据库备份和前版截图。

本任务范围内暂不提交或推送 Git。所有现有用户改动原样保留。

## 12. 开工顺序

严格按以下顺序推进：

1. 写视觉与交互 spec。
2. 建立隔离数据 fixture 和前截图。
3. 写响应式、焦点、失败恢复和减少动效的失败测试。
4. 验证 Motion、Base UI Drawer 与 FullCalendar 技术原型。
5. 建立共享原语和 CSS 边界。
6. 重构 Tasks。
7. 重构 Calendar。
8. 完成反馈、可访问性、性能和 CSS 收口。
9. 运行全量门禁与 verify skill。
10. 更新计划状态并生成交付报告。

第一个可发布恢复点为 Phase 2：Tasks 形成完整桌面、平板和手机体验。第二个可发布恢复点为 Phase 3：Calendar 形成完整时间画布和移动议程。Phase 4 与 Phase 5 共同构成最终发布闸门。
