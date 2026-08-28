# Ascend 全站动效系统升级与验收报告

日期：2026-08-10  
分支：`codex/ascend-product-convergence`

## 交付结论

- [COMPUTED] 本轮将页面切换、弹层进退场、按钮反馈、任务状态反馈和无障碍减弱动效收敛为同一套语义与时间尺度，不再把所有导航统一处理为“向前进入”。
- [COMPUTED] 命令面板与移动端“更多”菜单迁移到 Base UI Dialog，获得焦点锁定、初始/结束焦点、Escape 关闭、背景惰性和可验证的退出阶段。
- [COMPUTED] Capture Drawer/Sheet 补齐进入和退出动画；退出时长短于进入，只改变 `opacity` 与 `transform`。
- [COMPUTED] Today、Capture、Tasks、Calendar、顶部栏和全局导航补齐 hover、press、selection、completion 等微交互，并统一使用 `--motion-*` 令牌。
- [COMPUTED] 清理了页面自身入场与 Next View Transition 的重复动画、两个重复 keyframe，以及两处裸时长违规。
- [COMPUTED] Tasks 的智能视图与清单、科目工作台的目录/图谱与聚焦改为稳定工作区内切换；URL 和前进/后退保留，但不再重新请求同一个动态页面。
- [COMPUTED] 修正第一版局部切换仍被 React Transition 提升为页面 View Transition 的边界错误；筛选现在是同步本地状态，页面转场只服务真实路由。
- [COMPUTED] Tasks 结果子树按视图建立独立边界：筛选不重演全部任务行，真实新增、完成、删除和重排仍保留局部 Motion。
- [COMPUTED] Inspector 选择改从统一任务源解析，筛选不会再自动跳到新视图首项；Quick Capture 和右栏都保持挂载。
- [COMPUTED] 启用 Next 16 React Compiler，并安装 `babel-plugin-react-compiler@1.0.0`；生产构建验证通过。
- [COMPUTED] Tasks 服务端一次准备统一任务源，服务端仓库与客户端共用同一视图过滤函数；不以重复查询换取“预加载”假象。
- [KNOWN] 本轮使用隔离数据目录和本地 production build 验收，没有改动真实业务数据。

## 动效语言

### 时间尺度

| 语义 | 令牌 | 时长 | 用途 |
| --- | --- | ---: | --- |
| 即时确认 | `--motion-instant` | 90ms | reduce 模式、极短状态确认 |
| 快速退出 | `--motion-fast` | 120ms | 弹层退出、旧页面离场 |
| 基础反馈 | `--motion-base` / `--motion-quick` | 180ms | hover、press、控件状态 |
| 面板进入 | `--motion-panel` | 220ms | Dialog、Drawer、Sheet |
| 页面进入 | `--motion-page` | 280ms | 路由新页面 |
| 慢速强调 | `--motion-slow` | 360ms | 低频、较大范围状态变化 |
| 奖励反馈 | `--motion-reward` | 520ms | 完成确认等低频正反馈 |

[INFERRED] 这套比例把高频输入反馈控制在约 200ms 内，把结构变化放在 220–280ms，并保证退出快于进入；目标是让操作感觉直接，同时保留层级与方向信息。

### 空间尺度

- [COMPUTED] 常规位移收敛为 4px、8px、12px 三档；避免大幅位移造成界面“飘动”。
- [COMPUTED] 高频按钮按压使用约 `0.94–0.98` 的缩放反馈；信息密集列表优先使用 1px/4px 位移或颜色变化。
- [COMPUTED] 页面和弹层动画只使用 `opacity` 与 `transform`，避免以宽高、定位或布局属性驱动动画。

## 页面切换语义

| 场景 | transition type | 视觉含义 |
| --- | --- | --- |
| 主导航、Planner 任务/日历、设置等同级页面 | `nav-switch` | 同级替换，弱方向性 |
| Today 进入具体日期、科目列表进入科目详情、完成 Onboarding | `nav-forward` | 深入下一层 |
| 日期页返回 Today、科目详情返回列表、Review 返回 Today | `nav-back` | 返回上一层 |
| Tasks 智能视图/清单、科目目录/图谱/聚焦 | 无页面 transition | 组件内派生，只反馈真实内容差异 |

- [COMPUTED] Topbar 在 View Transition 中作为稳定锚点，不随页面内容重复进出。
- [COMPUTED] 旧页面使用 120ms 离场，新页面使用 280ms 进入。
- [COMPUTED] 取消 `.pageStack` 子项默认重复入场，避免一次路由切换同时触发 View Transition 和旧 `riseIn`。
- [COMPUTED] Tasks 以视图 key 仅重建中央结果边界；边界自身没有 presence 动画，内部稳定视图仍保留任务行插入、移除和重排反馈。

## 导航连续性

- [KNOWN] 原 Tasks 筛选链接每次会重新执行 `/tasks` 动态 Server Component 和数据库查询，视觉层还会让整个任务组退场/入场。
- [COMPUTED] 当前智能视图与清单使用本地状态切换，通过 `window.history.pushState` 保留深链接；`popstate` 恢复浏览器前进/后退。
- [COMPUTED] 本地视图更新不再使用 `useTransition`，避免与 AppShell 页面级 `ViewTransition` 组合成整页刷新观感。
- [COMPUTED] 首次进入 Tasks 读取一次与原实现相同的最多 2,000 项任务源，每个视图继续保留最多 500 项；今天、近期、随时、逾期、等待、完成、回收站与清单筛选均在已挂载工作区内派生。
- [COMPUTED] 科目工作台已有完整章节和知识点数据，因此目录/图谱与聚焦也改为本地切换。资料库文件夹、分页和搜索需要新的服务端数据，继续使用数据驱动导航，不做不受控的全量预载。
- [COMPUTED] Planner Drawer 在桌面 Drawer 与移动 Sheet 形态切换时按 surface 重建 Base UI Root，并使用稳定 snap points，消除了 uncontrolled default snap point 警告。

## 交互升级范围

### 导航与全局操作

- Sidebar、移动端主导航、Topbar、Today 快捷入口采用正确的同级/深入/返回语义。
- 主按钮、次按钮、危险按钮、记录入口、顶部图标和命令项补齐 hover、press 与箭头连续性。
- 移动端“更多”菜单具有明确关闭按钮、Escape 关闭、焦点管理、背景遮罩和完整退出动画。

### 弹层与面板

- 命令面板由条件挂载改为 Base UI Dialog presence 生命周期，关闭时节点会保留到退出动画结束。
- Capture 在桌面端从右侧进入、移动端从底部进入；遮罩、Popup 与退出阶段使用统一令牌。
- Planner Drawer、Sheet、Dialog、Popover、Toast 补齐 ending-style，退出时不再瞬间消失。

### 页面内反馈

- Today：主要行动、时间线行、任务复选框、完成确认和 Capture 卡片。
- Capture：类型 Tab、输入区、解析预览、附件、拖放遮罩、提交按钮和加载状态。
- Tasks：视图导航、快速收集、工具按钮、完成状态。
- Calendar：工具栏、事件、日期条和 agenda 项。

## 无障碍与确定性

- [COMPUTED] 系统 `prefers-reduced-motion` 与应用 `html[data-motion="reduce"]` 均能关闭位移和 View Transition 动画。
- [COMPUTED] 命令面板打开后搜索框自动聚焦，关闭后焦点返回触发按钮；移动端菜单背景内容处于 inert 状态。
- [COMPUTED] Planner 字段的 focus 背景与边框立即切换到设计令牌，避免颜色过渡产生不可验证的中间色；柔和反馈保留在阴影上。
- [COMPUTED] 390px 真实浏览器巡检中 `documentElement.scrollWidth === innerWidth`，弹层打开时无横向溢出。

## 验证结果

| 门禁 | 结果 |
| --- | --- |
| `npm test` | 通过；118 个测试文件、680 项测试 |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过 |
| `npm run build` | 通过；Next.js 16.2.12 production build |
| `npm run audit:motion` | 通过；56 个受控 legacy fingerprints |
| `node scripts/css-audit.mjs` | 通过；errors 为空 |
| `npm run responsive:audit` | 通过；9 条路由 × 6 种视口，另含 Planner desktop/tablet/mobile、PWA、安全区、主题和快捷键 |
| `git diff --check` | 通过 |
| 真实交互巡检 | Edge 开发态与隔离 production；Tasks 本地切换、URL、草稿连续性、Inspector 连续性均通过 |

- [COMPUTED] 隔离 production 的 CDP 网络事件验证：Inbox 切换到等待没有 `/tasks` 或 RSC 请求；仅出现 Web Vitals 与 icon 请求。
- [COMPUTED] 同一次 production 交互中没有 `Animation.animationStarted` 事件；Quick Capture 保留“生产态输入保持”，Inspector 文本在切换前后完全一致。
- [COMPUTED] 390px 实测 `documentElement.scrollWidth === innerWidth === 390`，移动智能视图栏可见、桌面侧栏隐藏。
- [COMPUTED] 隔离 production 实例的应用控制台没有 Ascend error/warn；浏览器扩展自身日志不计为应用缺陷。

## 边界与剩余风险

- [KNOWN] 自动化矩阵和桌面浏览器移动视口不能替代真实 iPhone Safari/PWA 的手感验收。
- [KNOWN] 本轮没有采集 60fps Performance trace，也没有对低端移动设备做帧耗时测量；因此不能声称已证明所有设备上无掉帧。
- [KNOWN] production build 后已重新启动 `localhost:3000` 的开发实例；当前 Next 16.2.12 与 React Compiler 配置可正常启动并访问 Tasks。
- [INFERRED] 下一步若继续提升，应优先做真实 iPhone 的路由、软键盘、Sheet 手势和 reduce 模式验收，并对 Calendar 密集视图采集 Performance trace，而不是继续增加视觉特效。
