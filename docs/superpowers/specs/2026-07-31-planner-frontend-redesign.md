# Ascend Planner 前端重设计交互规格

日期：2026-07-31  
状态：Phase 0 冻结  
父计划：`docs/superpowers/plans/2026-07-31-planner-frontend-redesign.md`

## 1. 保留契约

1. Planner v2 的 `planner_tasks`、`calendar_events`、清单、标签、提醒与重复模型保持原样。
2. 客户端写入继续调用现有 Server Action；Action 继续执行 `requireWorkspace()`、repo 写入、版本检查和 Planner 视图 revalidation。
3. 高频写入在原始用户事件内同步更新乐观状态并立即启动 `startTransition`；视觉反馈与网络请求并行。
4. 失败恢复实体、排序、选择和表单草稿；版本冲突显示服务端冲突结果与刷新入口。
5. FullCalendar 继续拥有事件定位、拖拽和缩放；Motion 只管理业务列表、选择背景、面板内容和反馈层。

## 2. 响应式状态机

| 视口 | Tasks | Calendar |
|---|---|---|
| `>=1180px` | 232px 左栏、弹性任务区、380px Inspector；三栏独立滚动 | 弹性时间画布、360px 单上下文栏；两区独立滚动 |
| `761–1179px` | 左栏 + 任务区；详情进入 420px 右侧 Drawer | 时间画布占满；待排、创建和详情进入右侧 Drawer |
| `<=760px` | 横向智能视图、快速收集、任务列表；详情进入双 snap point 底部 Sheet | 默认议程；创建、详情和排期进入底部 Sheet |

断点由纯函数视图模型与 CSS media query 共同表达。服务端首屏使用稳定标记，客户端水合后只切换交互容器，避免依赖随机值或本地日期产生结构差异。

## 3. 焦点、键盘与触控

- 任务行与事件条目保存稳定触发器 ref。Drawer、Sheet、Popover 关闭后将焦点归还触发器。
- `Escape` 关闭最上层 Drawer、Sheet、Popover 或 Dialog。
- 任务列表支持上下方向键移动选择、`Enter` 打开详情、`Space` 完成当前任务。
- 日历视图切换、日期卡片与点击式改期均可由键盘完成。
- 手机主操作目标最小 44×44px，表单字体最小 16px。
- Sheet 操作区计算 `safe-area-inset-bottom` 与移动导航高度；底部表单使用 `Drawer.VirtualKeyboardProvider`。

## 4. 弹层与叠层

叠层顺序固定为：

1. 应用内容与 FullCalendar。
2. 粘性工具栏和任务批量栏。
3. Popover。
4. Drawer/Sheet backdrop 与 popup。
5. Dialog。
6. Toast。

Base UI 负责 portal、焦点圈、Escape、外部点击和焦点归还。Drawer 使用受控 `open`、`swipeDirection` 和 snap point；移动 Sheet 使用虚拟键盘 Provider。Popover、Dialog、Collapsible 和 Toast 复用同一套 Planner 状态色与阴影 token。

## 5. Motion 所有权

- Planner 客户端边界使用 `LazyMotion` 和 `MotionConfig reducedMotion="user"`。
- 任务行使用 `layout="position"`、`LayoutGroup` 与 `AnimatePresence mode="popLayout"`。
- 新增、删除和面板内容只改变 transform 与 opacity；完成勾选可使用 `--motion-reward`。
- Base UI Drawer 位移只由 Base UI CSS 变量控制；Motion 仅负责 Drawer 内部内容。
- FullCalendar 事件位置只由 FullCalendar 控制；自定义 `eventContent` 使用静态结构与 CSS 状态。
- `html[data-motion="reduce"]`、`prefers-reduced-motion` 和 View Transition 三层规则移除位移、缩放和布局动画，保留短 opacity、图标、文本和 aria-live。

## 6. 写入状态

统一状态为 `idle → optimistic/pending → saved | conflict | error → restored`。

- 成功：实体附近显示短状态；跨区域操作使用 Toast。
- 删除：行立即退场，成功 Toast 提供撤销；撤销调用 restore Action 并生成新的 `clientMutationId`。
- 失败：实体恢复原位置，选中状态和草稿保持，实体短暂显示错误边框，assertive aria-live 宣读结果。
- 冲突：详情区保持打开，显示服务端快照摘要、刷新实体与重试入口。
- 日历拖拽或缩放失败：恢复本地实体并调用 FullCalendar `revert()`。
- 所有拖拽操作提供同一 Action 驱动的点击式日期时间入口。

## 7. Phase 0 基线证据

隔离实例：

- 临时源码副本：`/tmp/ascend-planner-baseline.DbLdqZ/app`
- 独立数据：`/tmp/ascend-planner-baseline.DbLdqZ/data/workbench.sqlite`
- 独立端口：`3124`
- fixture：36 条任务、18 个事件、空集合、版本冲突、无日期任务触发的 Calendar 错误

页面测量：

| 页面 | 1440×1000 | 900×1100 | 390×844 |
|---|---:|---:|---:|
| Tasks 页面高度 | 2145px | 2599px | 3767px |
| Calendar 页面高度 | 1369px | 2864px | 3623px |
| 页面级水平溢出 | 0 | 0 | 0 |

[COMPUTED] 三个 Tasks 视口的 Inspector 都处于普通文档流。  
[COMPUTED] 900px 与 390px Calendar 都连续渲染时间画布和上下文栏。  
[COMPUTED] 390px 初始 Calendar 未稳定进入议程结构。  
[COMPUTED] 无日期、无排期任务进入旧 Calendar 投影时触发 `localeCompare` 空值错误。  
[COMPUTED] 版本提升后完成任务显示“任务版本冲突”，原完成状态恢复。  
[KNOWN] Headless Chromium 注入 `caret-color` 造成开发模式 hydration 属性提示，截图环境记录该噪声。

开发模式客户端资源基线：

| 路由 | JS/CSS 请求 | transfer bytes | encoded bytes |
|---|---:|---:|---:|
| `/tasks` | 7 | 2,823,175 | 3,227,953 |
| `/calendar` | 7 | 3,548,826 | 3,838,730 |

该数值用于同一开发环境的相对比较；最终交付以生产构建静态资源为准。

基线截图：

- `docs/screenshots/planner/before/tasks-desktop.png`
- `docs/screenshots/planner/before/tasks-tablet.png`
- `docs/screenshots/planner/before/tasks-mobile.png`
- `docs/screenshots/planner/before/tasks-empty-mobile.png`
- `docs/screenshots/planner/before/tasks-conflict-tablet.png`
- `docs/screenshots/planner/before/calendar-desktop.png`
- `docs/screenshots/planner/before/calendar-tablet.png`
- `docs/screenshots/planner/before/calendar-mobile.png`
- `docs/screenshots/planner/before/calendar-empty-mobile.png`
- `docs/screenshots/planner/before/calendar-error-desktop.png`

## 8. 依赖原型记录

| 依赖 | 版本 | 许可证 | registry unpacked size | 用途 |
|---|---:|---|---:|---|
| `motion` | 12.43.0 | MIT | 683,139 bytes | LazyMotion、layout、presence、reduced motion |
| `@base-ui/react` | 1.6.0 | MIT | 9,282,630 bytes | Drawer、Dialog、Popover、Collapsible、Toast |
| FullCalendar | 6.1.21 | MIT | 已有依赖 | 时间画布、拖拽、缩放与事件定位 |

[COMPUTED] 版本和许可证来自 2026-07-31 的 npm registry 元数据。  
[KNOWN] Base UI 1.6.0 提供稳定 Drawer 与 `Drawer.VirtualKeyboardProvider`。  
[KNOWN] Motion 的 `MotionConfig reducedMotion="user"` 会关闭 transform 与 layout 动画，同时保留 opacity 和颜色反馈。

[COMPUTED] `npm audit --omit=dev` 为 0。完整 `npm audit` 的 9 个 high 位于 ESLint → minimatch → brace-expansion 开发依赖链；registry 提供的自动修复会升级到 ESLint 10，当前锁定已通过 lint 的 ESLint 9 工具链，生产依赖不受影响。

## 9. Phase 0 验证基线

| 命令 | 结果 | 时间 |
|---|---|---:|
| `npm test` | 50 files / 331 tests 通过 | 3.85s |
| `npm run lint` | 通过 | 8.75s |
| `npm run typecheck` | 通过 | 6.96s |
| `npm run build` | 隔离副本生产构建通过 | 10.33s |

生产构建确认 Next.js 16.2.12、React 19.2.4、View Transition 与 Planner v2 当前实现兼容。

## 10. Phase 1 闸门

| 证据 | 结果 |
|---|---|
| `npm test` | 54 files / 348 tests 通过 |
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| 隔离副本 `npm run build` | 通过，10.41s |
| 390px 生产运行时 smoke | Tasks/Calendar 水平溢出 0，Toast Provider 已挂载，控制台错误 0 |
| CSS motion audit | Planner 原语与 motion module 的字面时长 0 |

共享层已提供 Motion Provider、Drawer/Sheet、Popover、Collapsible、Toast、Segmented Control 与 mutation status indicator；`FeedbackProvider` 已切换到 Base UI Dialog 与 Toast。

## 11. Phase 2 闸门

Tasks 工作区已经拆分为兼容入口、状态 Workspace、Sidebar、Quick Capture、分组列表、Motion 任务行、渐进 Inspector 和响应式 Drawer/Sheet。写入继续使用原 Planner Server Action；乐观 reducer 保留实体顺序、选择与草稿，并处理 RSC 在 draft replace 前回流时的实体去重。

| 生产 E2E 证据 | 结果 |
|---|---|
| 1440×1000 | `232px / 475.844px / 380px` 三栏；工作区高 724px、底部 998px；水平溢出 0 |
| 900×1100 | `212px / 658px` 两栏；详情进入 420px Drawer；水平溢出 0 |
| 390×844 | 主体为智能视图、收集和列表；详情进入 390px Sheet；水平溢出 0 |
| 焦点 | Drawer/Sheet 打开后标题获得焦点；Escape 关闭并归还任务行 |
| 键盘 | 上下方向键移动任务选择；Enter 打开；Space 完成 |
| 减少动效 | Chromium reduced-motion 下任务行位移 transition 为 `1e-06s` |
| 写入恢复 | 快速收集仅产生一个实体；删除后行退出；Toast 撤销恢复；版本冲突恢复原行并显示 assertive 状态 |
| 控制台 | 三视口 Tasks E2E 错误 0 |

验证命令：

| 命令 | 结果 |
|---|---|
| `npm test` | 55 files / 357 tests 通过 |
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| 隔离副本 `npm run build` | Next.js 16.2.12 生产构建通过 |

截图：

- `docs/screenshots/planner/after/tasks-phase2-desktop.png`
- `docs/screenshots/planner/after/tasks-phase2-tablet.png`
- `docs/screenshots/planner/after/tasks-phase2-tablet-drawer.png`
- `docs/screenshots/planner/after/tasks-phase2-mobile.png`
- `docs/screenshots/planner/after/tasks-phase2-mobile-sheet.png`

## 12. Phase 3 闸门

Calendar 工作区已经拆分为兼容入口、状态 Workspace、概览、工具栏、FullCalendar Canvas、自定义事件内容、单一上下文栏、事件 Composer/Inspector、待排任务、Base UI 日期 Popover、移动议程与 Drawer/Sheet。FullCalendar 继续独占事件定位、拖拽、缩放和 mirror；自定义事件内容保持静态 DOM 与 CSS 状态。

| 生产 E2E 证据 | 结果 |
|---|---|
| 四视图 | 月、周、日、议程均切换到对应 FullCalendar/Agenda 结构 |
| 1440×1000 | `727.844px / 360px` 时间画布与单上下文栏；布局底部 1002px；水平溢出 0 |
| 900×1100 | 画布单栏；上下文进入 420px Drawer；水平溢出 0 |
| 390×844 | 默认议程，FullCalendar 时间画布未挂载；事件表单进入 390px Sheet；水平溢出 0 |
| FullCalendar 视觉 | 自定义 `eventContent` 按 task/event/milestone 输出，FullCalendar 保持定位所有权 |
| 日期卡片 | Base UI Popover 定位、Escape 关闭和触发元素焦点归还 |
| 点击式排期 | 待排任务通过原 `scheduleTaskAction` 进入时间轴 |
| 点击式改期 | Inspector 与拖拽共享 `updatePlannerEventAction` 和时间转换语义 |
| 失败恢复 | 事件版本冲突恢复原实体并显示 assertive conflict 状态 |
| 时区 | Asia/Shanghai 跨 UTC 午夜事件归入本地日期 |
| 控制台 | 三视口 Calendar E2E 错误 0 |

验证命令：

| 命令 | 结果 |
|---|---|
| `npm test` | 56 files / 368 tests 通过 |
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| 隔离副本 `npm run build` | Next.js 16.2.12 生产构建通过 |

截图：

- `docs/screenshots/planner/after/calendar-phase3-desktop.png`
- `docs/screenshots/planner/after/calendar-phase3-tablet.png`
- `docs/screenshots/planner/after/calendar-phase3-tablet-drawer.png`
- `docs/screenshots/planner/after/calendar-phase3-mobile.png`
- `docs/screenshots/planner/after/calendar-phase3-mobile-sheet.png`

## 13. Phase 4 闸门

Tasks 与 Calendar 共享 `runPlannerMutation` 网络恢复边界，传输异常统一转成可恢复 Action 结果。任务实体、事件实体、批量更改、提醒和待排操作继续调用原 Server Action；乐观实体、选中状态和输入草稿在失败后恢复。

| 硬化证据 | 结果 |
|---|---|
| 三视口主题 | 1440×1000、900×1000、390×844 的 Light/Dark 通过 |
| 减少动效 | 系统 `prefers-reduced-motion` 与应用内 `data-motion="reduce"` 通过；目标 transition/animation 最大 1ms |
| 键盘与焦点 | 任务方向键、Enter、Escape、Drawer/Sheet 初始焦点和触发器归还通过 |
| 触控 | 900px 与 390px Planner 核心控件、Drawer/Sheet 表单目标至少 44px；390px 输入字号至少 16px |
| 运行时 | 水平溢出、pageerror、console error、hydration warning、未处理 Promise 均为 0 |
| CSS | Planner/Calendar 旧全局规则移除；Tasks、Calendar、Primitives module 成为单一来源 |
| 100 条任务 | 首屏 1170ms；10 次完成最大 10.9ms；10 次删除最大 47.1ms；Long Task 0 |
| 200 个事件 | 月视图 766ms；月格两条事件后聚合；月视图连续切换 Long Task 0 |
| 移动议程 | 事件按日期单次分组并展开全天跨度；200 事件下首屏约 750ms |
| 客户端资源 | 桌面脚本 474KB；平板与手机脚本 440KB |
| 自动命令 | `npm test` 58 files / 376 tests；lint、typecheck、隔离生产构建通过 |

Phase 4 截图位于 `docs/screenshots/planner/after/*-phase4-{desktop,tablet,mobile}-{light,dark}.png`。
