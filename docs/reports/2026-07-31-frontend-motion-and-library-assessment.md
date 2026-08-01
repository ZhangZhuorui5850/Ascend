# Ascend 前端与动效体系深度评估

日期：2026-07-31  
范围：全站视觉体系、页面/组件动效、Planner 重点界面、候选动效库与示例站点  
结论：工程基础合格，产品动效体验不合格；不建议先引入新的通用动画引擎

证据标签：

- `[COMPUTED]`：由当前仓库代码、依赖、样式或落盘截图直接确认。
- `[INFERRED]`：基于直接证据作出的设计与工程判断。
- `[KNOWN]`：官方文档、当前项目规范或已确定的产品约束。

## 1. 执行结论

[INFERRED] 用户认为“现在的前端，特别是动效特别差”，这个判断有充分依据，但根因不是缺动画。当前页面已经存在路由入场、hover、弹层、列表 presence、任务重排、完成章、进度生长和 Drawer/Sheet 状态过渡。问题是这些效果大多停留在“元素出现/消失得柔和一点”，没有持续解释：

1. 我刚才做了什么。
2. 哪个对象发生了变化。
3. 它去了哪里。
4. 请求正在保存、已经成功，还是发生了回滚。
5. 当前页面与上一个页面有什么空间关系。

因此，当前系统呈现为“有动画的静态界面”，而不是“通过运动解释状态的交互系统”。

### 1.1 评分

评分不是审美投票，而是按本报告的固定维度进行的设计审计。满分 100。

| 维度               |    权重 | 当前得分 | 判断                                                                        |
| ------------------ | ------: | -------: | --------------------------------------------------------------------------- |
| 状态反馈与因果     |      20 |        9 | 有 Toast、乐观更新和部分 presence，但保存/成功/回滚缺少对象级连续反馈       |
| 空间连续性与导航   |      15 |        5 | 有全页 View Transition，但缺少正确的页面关系与 shared element               |
| 直接操控与物理感   |      15 |        6 | Planner 任务有 layout 动画，Calendar 由 FullCalendar 管理拖拽；其他页面很少 |
| 节奏、层级与注意力 |      15 |        7 | 有 duration/easing token，但多处旧值并存，主要运动都像统一的淡入上浮        |
| 视觉一致性         |      15 |        6 | Planner 视觉复核已证明原生控件、边框、遮挡与层级问题；运动无法弥补          |
| 可访问性           |      10 |        7 | CSS reduce 防护较完整，但应用内 reduce 未完整控制 Motion 组件               |
| 性能与降级         |      10 |        8 | 多数效果使用 transform/opacity；WebGL 尚未进入核心路径                      |
| **总分**           | **100** |   **48** | **工程底座可用，产品动效体验未达到发布标准**                                |

[INFERRED] 静态视觉和运动体验不是两个独立问题。Planner 截图中原生表单、过量轮廓、常驻 Inspector、移动 sticky footer 遮挡等问题，会让任何新增动画显得更忙。建议把当前糟糕观感约分解为：静态层级与控件一致性 55%，运动语义与连续性 35%，纯粹“特效不够炫”不超过 10%。

### 1.2 最重要的选型结论

- [KNOWN] 保留并扩大现有 `motion` 的正确使用；它已经能覆盖布局、presence、shared layout 和可中断交互。
- [KNOWN] 保留 Next/React View Transition，但从“全页统一淡入”改成有页面关系的 shared element、同级 crossfade、前进/返回语义。
- [INFERRED] 把 Transitions.dev 当作配方和审稿标准，不要全量复制或让它成为第二套设计系统。
- [INFERRED] 不引入 React Spring、AutoAnimate 或 GSAP 到核心产品路径；它们会与现有 Motion、Base UI、FullCalendar 和 View Transition 重叠。
- [INFERRED] Canvas UI、Metal、Beam、OriginKit 只适合独立品牌试验，不适合 Planner、知识库、今日工作台等高频业务表面。
- [INFERRED] AIcss、Beautiful UI、Orbs 只有在真正实现 AI Assistant 的流式执行、工具调用和等待状态时才有价值；目前不能用一个“思考球”替代任务状态设计。
- [INFERRED] Agentation 是开发协作工具，不是运行时组件；可以作为 `devDependency` 试点。

## 2. 证据范围与限制

本轮读取了：

- 用户提供的九个候选项目清单与上一轮评价。
- `package.json`、`next.config.ts`、`src/app/layout.tsx`、`AppShell`、Planner Motion 组件、全局与 Planner CSS。
- `docs/screenshots/` 和 `docs/screenshots/planner/` 中的桌面、平板、移动、Light、Dark、Drawer、Sheet 与不同业务状态截图。
- 现有首页重设计、动效批次、Planner 重设计交付与 Planner 视觉复核文档。
- 当前 Next.js 16.2.12 自带的 View Transition 指南。
- Motion、React Spring、GSAP、AutoAnimate、Canvas UI、Transitions.dev、OriginKit、Beautiful UI、Agentation、Orbs、W3C、MDN、web.dev、Vercel、Linear 和 Atlassian 的公开资料。

[COMPUTED] 本轮尝试访问线上登录态页面进行实时采样，但浏览器连接在页面加载阶段超时，因此没有新增逐帧录屏、实际帧率和输入延迟数据。下面涉及“当前感觉”的结论均明确标记为 `[INFERRED]`，不会把静态截图冒充实时动效证据。执行阶段 R0 必须补齐真实交互录屏和帧采样。

[COMPUTED] Planner 的 2026-07-31 截图与当前未提交代码之间存在时间差。例如当前 `PlannerTaskRow` 已按 `selectionMode` 在完成圆圈和批量 checkbox 之间二选一，但旧截图仍可能显示双前导控件。旧截图可证明曾经的视觉失败，不能证明所有问题在当前代码仍未修复；整改后必须重新生成同状态截图。

## 3. 当前动效基础设施审计

### 3.1 已有能力

| 层级                | 当前技术                      | 已覆盖                                                 |
| ------------------- | ----------------------------- | ------------------------------------------------------ |
| 页面导航            | React/Next `<ViewTransition>` | 路由页面快照、全页进入/退出                            |
| 组件布局与 presence | `motion` 12.43                | Planner 任务新增、删除、重排、选中背景、批量栏         |
| 弹层                | Base UI                       | Drawer、Sheet、Dialog、Popover、Collapsible、Toast     |
| Calendar 几何       | FullCalendar                  | 事件定位、拖拽、缩放                                   |
| CSS 微交互          | CSS transition/keyframes      | hover、focus、菜单、进度、首页编排、完成章、骨架、加载 |
| 减弱动效            | CSS + `MotionConfig`          | 系统设置、应用内 `data-motion="reduce"` 的部分路径     |

[COMPUTED] `motion/react` 只出现在 5 个生产 TSX 文件中：一个 Provider 和四个 Planner Tasks 文件。Calendar、知识体系、资料库、今日工作台和大部分全站组件仍主要依赖 CSS 或无对象级运动。

[COMPUTED] CSS 共 7 个文件，其中：

- `globals.css` 11,469 行、约 218 KB。
- `summit.css` 2,332 行、约 50 KB。
- 全站共 22 个 `@keyframes`。
- 扫描得到 87 处 `var(--motion-*)` 使用。
- 仍有 62 处硬编码时长匹配，分布在 `globals.css` 与 `summit.css`。该数字包含 token 定义和 reduce 的 `0.001ms` 防护，但也直接证明旧值与新 token 共存。

[INFERRED] 当前真实状态是“一套新 token 覆盖在一套大规模遗留 CSS 上”，而不是统一的运动系统。`summit.css` 自己的注释也说明它是追加在 legacy stylesheet 之后的迁移层。运动语言不一致不是偶发 bug，而是架构状态。

### 3.2 当前做对的部分

- [COMPUTED] 项目已经明确规定只动画 `transform/opacity`、退出快于进入、奖励动效限额、每日首次首页编排和第 10 天墙纸测试。
- [COMPUTED] `MotionProvider` 使用 `LazyMotion + domAnimation`，避免无必要地加载完整 feature bundle。
- [COMPUTED] Planner 任务行使用 `layout="position"`，选中背景使用 `layoutId`，这是正确的对象连续性方向。
- [COMPUTED] `AnimatePresence initial={false}` 避免列表首屏把所有既有记录当成新记录重播。
- [COMPUTED] View Transition 把 top bar 从页面内容中独立出来，方向上符合“稳定空间锚点”的原则。
- [COMPUTED] FullCalendar 明确拥有事件几何动画，避免 Motion 与日历引擎争抢位置。
- [COMPUTED] CSS 对 `prefers-reduced-motion` 和 `html[data-motion="reduce"]` 都有全局近零时长保护。

这些基础不应该推翻重做。

### 3.3 关键缺陷

#### M-001：动效主要描述“出现”，没有描述“状态”

[COMPUTED] Planner 任务行的 Motion 定义只有：进入 `opacity + y`、退出 `opacity + scale`、位置重排和选中背景。批量栏也是 `opacity + y`。

[INFERRED] 新建、完成、删除、恢复、版本冲突回滚虽然在数据层是五种不同事件，在视觉层却高度相似。用户不能仅凭动画确认对象状态，只能重新读文本或等待 Toast。

#### M-002：乐观草稿到真实实体可能失去视觉身份

[COMPUTED] 新任务先使用 `draft:${crypto.randomUUID()}` 作为 `id`，成功后 reducer 用服务端实体替换，任务行 React `key` 使用 `task.id`。

[INFERRED] 临时 ID 变成真实 ID 时，React/Motion 可能把它视为旧节点退出和新节点进入，而不是同一个任务完成保存。正确体验应让同一行持续存在，仅把“正在保存”状态过渡为“已保存”。

#### M-003：全页路由动效语义过于粗糙

[COMPUTED] `AppShell` 对所有登录后页面使用同一个 `name="ascend-page"`。Sidebar 的所有导航都标为 `transitionTypes={["nav-forward"]}`；当前没有 `nav-back`。CSS 中普通旧页退出是轻微向上，`nav-forward` 新页进入改成水平位移。

[INFERRED] 主页、任务、今日、日历、知识体系是同级目的地，不应全部表达为“向层级深处前进”。旧页纵向离开、新页横向进入还混用了空间轴。结果是有动静，但没有可学习的空间模型。

#### M-004：缺少 shared element

[COMPUTED] 除全页 `ascend-page` 和 Planner 选中背景外，没有发现页面间 shared element 身份。

[INFERRED] 任务行打开 Inspector/Sheet、日历事件打开详情、科目节点进入知识点、首页“下一步”进入今日任务，都是最需要“这是同一个对象”的地方；当前只做表面替换。

#### M-005：应用内 reduce 与 Motion Provider 没有同源

[COMPUTED] `MotionConfig reducedMotion="user"` 只读取系统偏好。应用内设置通过 `html[data-motion="reduce"]` 驱动 CSS；Provider 没有读取该 dataset。

[INFERRED] 全局 CSS 可以压缩 CSS animation/transition，却不能可靠阻止 Motion 的 JS/layout transform。应用内“减弱动效”在 Planner Motion 路径上可能不是完整承诺。该问题优先级为 P0，因为它涉及明确的用户设置。

#### M-006：token 以速度命名，缺少意图层

[COMPUTED] 现有 token 主要是 `fast/quick/page/slow/reward` 和一组 easing。

[INFERRED] 调用者仍需要自己组合 duration、curve、distance、opacity 和退出规则，所以同一个“Panel enter”可能在 CSS、Base UI 和 Motion 中各写一遍。优秀系统应优先提供 `motion.panel.enter`、`motion.row.reorder`、`motion.feedback.success` 这类语义契约，再映射到底层值。

#### M-007：静态视觉缺陷让动效显得更差

[COMPUTED] 既有 Planner 视觉复核已经确认原生表单、边框过量、Inspector 密度、语言与日期格式、sticky footer 遮挡、全局 FAB 抢权等缺陷。当前代码已经修复其中一部分，但新视觉证据尚未完整替换。

[INFERRED] 用户看到的是整体体验，不会区分“这个问题属于 CSS”还是“属于 Motion”。当界面层级本身不清楚时，动画只会让错误层级移动起来。

#### M-008：反馈存在，但不是对象内联反馈

[COMPUTED] Planner 有全局 `mutationStatus` 和 Toast；多个操作会设置 `optimistic/pending/saved/conflict/restored`。

[INFERRED] 状态集中在工作区或 Toast，任务行和字段本身没有稳定的 pending/saved/reverted 运动语义。用户操作一个字段后，视线被迫离开对象寻找反馈。

## 4. 优秀产品真正值得学习的内容

### 4.1 Linear：克制比“更炫”重要

[KNOWN] Linear 在 2026 年视觉刷新中强调“不要竞争尚未获得的注意力”，并主动降低侧栏权重，让主要工作区突出。其目标是熟悉、流畅、密度高但不压迫，而不是给每个元素添加特效。[Linear 2026 设计刷新](https://linear.app/now/behind-the-latest-design-refresh)

对 Ascend 的启示：

- 侧栏、FAB、Inspector、概览卡不能同时争抢注意力。
- 高频任务列表的运动要快、可中断、可预测。
- 大部分优秀动效的成功标志是用户理解变化，但没有注意到“动画本身”。

### 4.2 Atlassian：按意图建立语义 token

[KNOWN] Atlassian 将 motion 定义为解释变化、引导注意力和表达品牌的系统，优先使用语义 token，并要求根据元素尺寸、出现频率和任务重要性调整表达。其公开区间为交互 50–150ms、组件过渡 150–400ms。[Atlassian Motion](https://atlassian.design/foundations/motion)

对 Ascend 的启示：

- 当前 `fast/quick/slow` 还不够，需要 panel、popup、row、feedback、reward 等语义层。
- 奖励动效只用于登顶、清零、完成关键阶段，现有“仪式感预算”方向正确。
- 同一时刻只能有一个主运动焦点。

### 4.3 Vercel：CSS 优先，动效必须可中断

[KNOWN] Vercel 的公开界面规范按 CSS、Web Animations API、JS library 的顺序选择实现，要求优先 transform/opacity、避免 `transition: all`、尊重 reduced motion、由输入触发并允许用户中断。[Vercel Web Interface Guidelines](https://vercel.com/design/guidelines)

对 Ascend 的启示：

- 不是所有交互都应迁移到 Motion。
- hover、focus、颜色和简单 open/close 继续用 CSS/Base UI。
- Motion 只接管需要布局连续性、presence、拖拽或中断能力的场景。

### 4.4 Next/React View Transition：表达页面关系，而不是全页统一转场

[KNOWN] 当前项目随 Next 16.2.12 安装的官方指南明确区分四种语义：shared element 表达“同一个对象深入查看”；Suspense reveal 表达“内容已加载”；方向表达前进/返回；同路由 crossfade 表达“同一位置换内容”。

[KNOWN] View Transition 底层通过页面快照工作，适合页面级变化；Motion 的 layout 动画是可中断的，更适合微交互。Motion 官方也明确说明两者的取舍。[Motion View animations](https://motion.dev/docs/animate-view) [MDN View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)

对 Ascend 的启示：

- 顶级模块切换使用短 crossfade，而不是一律 nav-forward。
- 任务、事件、知识点进入详情使用 shared element。
- 加载 skeleton 到真实内容需要局部 handoff，不要让整个页面再次入场。

## 5. 候选库与网站逐项评估

### 5.1 评分标准

| 维度        | 问题                                                             |
| ----------- | ---------------------------------------------------------------- |
| 产品适配    | 是否服务学习/任务/日历的高频交互，而非营销页                     |
| 技术重叠    | 是否与 Motion、Base UI、FullCalendar、View Transition 重复       |
| 可访问性    | 是否支持 reduced motion、键盘与状态非运动表达                    |
| 性能与降级  | 是否只动合成属性，低端机和非主流浏览器是否可用                   |
| 维护成本    | 是否引入第二套 token、运行时、Tailwind/shadcn 假设或复制代码负担 |
| 成熟度/许可 | 是否稳定、许可证是否适合生产和内部修改                           |

### 5.2 运行时与通用动画库

| 项目                       | 适配度 | 结论                                  | 理由                                                                                                                                                                                                                                                            |
| -------------------------- | -----: | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motion 12                  |   9/10 | **继续作为唯一通用 React 动效引擎**   | 已安装；layout、presence、gesture、shared layout、reduced motion 均覆盖。当前问题是使用太少和语义不足，不是能力不够。[Motion for React](https://motion.dev/docs/react)                                                                                          |
| React/Next View Transition |   8/10 | **保留，限制在页面与 shared element** | 与 Next App Router 集成自然；当前 Next 配置仍标记 experimental，需要保留降级与浏览器矩阵。不要用于高频可中断微交互。                                                                                                                                            |
| GSAP                       |   4/10 | **核心产品不引入**                    | 时间线、SVG、滚动和复杂营销叙事很强；但 Ascend 不是滚动型品牌站，会增加第二套 imperative runtime。2025 后功能免费，但许可不是 MIT，仍应做法务记录。[GSAP 安装](https://gsap.com/docs/v3/Installation/) [GSAP 许可条款](https://webflow.com/legal/product-terms) |
| React Spring               |   4/10 | **不引入**                            | React 19 和 reduced-motion 支持存在，但与 Motion 的 spring/layout 能力高度重复。[React Spring](https://react-spring.dev/docs)                                                                                                                                   |
| AutoAnimate                |   5/10 | **不引入全站；原型可用**              | 低成本自动处理子项增删移动，也自动尊重 reduced motion；但列表主路径已经使用 Motion，双重布局测量和不可控默认运动得不偿失。[AutoAnimate](https://auto-animate.formkit.com/)                                                                                      |

### 5.3 用户提供的组件与特效站

| 项目            | 实际类型                  | 适配度 | 建议                                                                                                                                                                                                     |
| --------------- | ------------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transitions.dev | 产品过渡配方/代码集合     |   9/10 | 作为参考规范和局部配方采用；优先参考 modal、panel、tabs、error、skeleton reveal、success。其组件共享 token、尊重 reduce，并以 transform/opacity/filter 为主。[Transitions.dev](https://transitions.dev/) |
| Canvas UI       | WebGL/html-in-canvas 特效 |   3/10 | 核心业务禁止；最多在登录页或一次性登顶回顾中做隔离实验。部分 HTML-in-canvas 能力仍依赖实验性浏览器能力；许可证为 MIT + Commons Clause，不得重新销售/分发组件本身。[Canvas UI](https://canvasui.dev/)     |
| OriginKit       | Beta 动画组件集           |   3/10 | 只做灵感库。官方仍标 Beta，组件以 Tornado、Cosmic Orb、Liquid Distortion 等展示型效果为主，且项目无 Tailwind/shadcn 基础。[OriginKit](https://www.originkit.dev/)                                        |
| Beam            | 单一 React 流光边框       |   4/10 | 不进入普通按钮、输入和卡片；如果未来有“正在同步/AI 正在工作”的唯一焦点，可做一次 A/B 原型。[Border Beam](https://beam.jakubantalik.com/)                                                                 |
| Metal           | 液态金属 shader 边框      |   2/10 | 与纸张、登峰、克制学习台的品牌语言冲突；不采用。[Liquid Metal](https://metal.jakubantalik.com/)                                                                                                          |
| Orbs            | AI 状态球体               |   5/10 | 只有 AI agent 明确存在 working/searching/listening 等长期状态时才试用；不得替代文字状态、进度和取消动作。[Thinking Orbs](https://orbs.jakubantalik.com/)                                                 |
| AIcss           | AI Agent UI 组件          |   5/10 | 当前站点核心不是 agent chat，不直接引入；未来 AI 助手应借鉴 tool call、task status、streaming、citation 等状态模型，再按 Ascend 设计系统重做。                                                           |
| Beautiful UI    | AI-native 界面示例        |   6/10 | 值得借鉴审批卡、工具调用、任务行、上下文卡、Diff 和流式状态的信息结构；不是可直接替代现有组件系统的成熟库。[Beautiful UI](https://beautiful-ui-five.vercel.app/)                                         |
| Agentation      | 开发期 UI 标注工具        |   8/10 | 可作为仅开发环境试点，帮助把“这个地方不对”转换为 selector、位置和上下文；不打进生产 bundle。[Agentation npm](https://www.npmjs.com/package/agentation)                                                   |

### 5.4 推荐采用层级

1. **生产主栈**：CSS + Base UI + Motion + Next View Transition + FullCalendar。
2. **设计参考**：Transitions.dev、Atlassian Motion、Linear、Vercel guidelines。
3. **未来 AI Assistant 参考**：Beautiful UI、AIcss、Orbs。
4. **开发工具试点**：Agentation。
5. **品牌实验隔离区**：Canvas UI 或 Beam 二选一，必须有性能和降级门禁。
6. **不采用**：React Spring、AutoAnimate 全站接管、GSAP 核心路径、Metal、OriginKit 直接复制。

## 6. 分页面诊断与目标运动

### 6.1 应用外壳与路由

当前问题：所有侧栏目的地都表达为 nav-forward；页面只整体替换，用户看不出同级、深入和返回。

目标：

- 主页、任务、今日、日历、知识、资料等同级模块：120–180ms crossfade，无大位移。
- 列表对象进入详情：shared element，标题/图标/选中面连续。
- 返回：逆向 shared element；浏览器返回没有 transition type 时保持安全 crossfade。
- top bar、sidebar、mobile nav、全局 FAB 保持空间锚点，不参与页面快照位移。

### 6.2 Planner Tasks

当前问题：任务新增/完成/删除共享近似淡入淡出；草稿 ID 替换可能破坏连续性；mutation 状态不在任务行上表达。

目标：

- 新增：输入提交后，同一视觉对象从 composer 下方进入列表；pending 只用轻微 opacity/状态点，保存后稳定，不重播入场。
- 完成：checkbox 描边到填充、check path 绘制、标题状态变化、整行移动到完成分组；总时长不超过 240ms，可在再次点击时中断反向。
- 删除：行先压缩到操作来源方向，再由相邻行完成 layout 补位；Toast 撤销时从原索引恢复。
- 回滚：对象沿原路径返回，显示短促但不抖动的 conflict/reverted 状态，不能只弹 Toast。
- 选中：保留 shared `layoutId` 背景，但减少边框，让背景成为唯一运动焦点。

### 6.3 Calendar

当前问题：日历自身具有拖拽/缩放，但任务进入时间轴、事件回滚、上下文切换缺少一致 handoff。

目标：

- FullCalendar 继续拥有事件几何；禁止 Motion 包裹事件坐标层。
- 待排任务拖入日历时保留 drag ghost，落点后 ghost 与真实事件做短交接。
- 保存 pending 只在事件内部显示，不让整个日历重绘或闪烁。
- 失败调用 `revert()` 时增加 120–180ms 的回到原位/错误强调，且保留文字原因。
- 月/周/日/议程属于同一位置不同表示：使用局部 crossfade 或轴向变换，不做整页转场。

### 6.4 今日工作台与首页

当前问题：首页已有每日首次编排，但更偏“入场”；真实学习推进中的完成、累计、下一步变更没有同等连续性。

目标：

- 保留每日一次入场，不提高频率。
- “下一步任务”完成后，旧任务退出更快，新任务从相邻任务位置接续。
- 进度数值与轨道只在真实数据变化时动，不在每次路由返回时重播。
- `sealStamp` 只用于登顶/清零/阶段完成，不扩展到普通保存。

### 6.5 知识体系与资料库

当前问题：树、画布、详情面板的空间关系强，但 Motion 覆盖弱；用户打开节点时常是内容替换。

目标：

- 树节点展开：连接线与子节点来自父节点方向，避免全组统一上浮。
- 节点到详情：标题与掌握度 shared element，详情内容局部 reveal。
- 文件移动/上传：来源、目标、进度和完成位置必须连续；错误恢复原位置。
- 大型 mind map 不为每个节点同时加 spring；只动画变化集合与当前焦点。

### 6.6 AI Assistant（未来）

如果增加 AI 助手，先定义状态机，再选择视觉：`idle → composing → queued → running(tool/search/code) → waiting-for-user → succeeded/failed/cancelled`。

每个状态必须同时有：

- 可读文字。
- 可取消/重试动作。
- 对应内容或工具调用记录。
- reduce 模式下的静态等价表达。

Orbs、Beam 或 shimmer 只能作为第二信号，不能成为状态本身。

## 7. 性能、兼容与可访问性门禁

[KNOWN] web.dev 建议在动画前检查渲染管线，优先 `transform` 和 `opacity`，避免触发布局或绘制的属性。[高性能 CSS 动画](https://web.dev/articles/animations-guide)

[KNOWN] W3C WCAG 2.3.3 要求由交互触发的非必要 motion animation 可以被禁用。[W3C Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html)

必须执行：

- 系统 reduce 和应用内 reduce 使用同一个运行时策略，CSS、Motion、View Transition、Canvas/WebGL 全覆盖。
- reduced motion 不是简单隐藏信息；保留 opacity、颜色、文本和状态变化，移除大位移、缩放、视差和连续循环。
- 动画不能延迟数据提交、焦点、键盘操作或后续输入。
- 交互动画必须可被新输入打断或快速完成。
- `will-change` 只在即将动画的少量节点上短时使用。
- 记录低端设备、3× CPU throttle、390px、900px、1440px 的帧时间和 Long Task。
- WebGL 实验必须按路由动态加载、离屏暂停、失焦暂停、reduce 禁用、失败回退为纯 HTML。

## 8. 最终判断

[INFERRED] Ascend 不缺“库”，缺的是运动导演和系统收口。当前最有价值的投资顺序是：

1. 关闭 Planner 静态视觉 P0/P1 并重录证据。
2. 让应用内 reduce 真正控制全部引擎。
3. 建立按意图命名的 motion contract。
4. 优先重做任务新增/完成/删除/回滚、Calendar 拖排、对象进入详情三条高频链。
5. 再处理首页奖励和品牌特色。
6. 最后才考虑 Canvas、Beam、Orbs 这类表现层项目。

如果按这个顺序执行，Motion 已足够把体验从“有淡入淡出”提升为“状态连续、对象可信、操作有回应”。如果反过来先装特效库，代码会更复杂，用户仍然不知道任务是否保存、对象去了哪里、页面关系是什么。
