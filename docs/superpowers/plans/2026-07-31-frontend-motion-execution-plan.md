# Ascend 前端与动效整改执行计划

日期：2026-07-31  
输入报告：`docs/reports/2026-07-31-frontend-motion-and-library-assessment.md`  
关联视觉复核：`docs/reports/2026-07-31-planner-frontend-visual-reassessment.md`  
目标：在不引入第二个通用动画引擎的前提下，让高频工作流具备清晰、连续、可中断、可降级的产品动效

## 1. 范围与非目标

### 1.1 本计划交付

- 统一 CSS、Motion、Base UI、View Transition、FullCalendar 的动画所有权。
- 关闭 Planner 当前静态视觉闸门，并生成新的实时证据。
- 建立语义 motion contract、运行时 reduced-motion 同源和自动审计。
- 重做 Tasks 新增/保存/完成/删除/撤销/回滚的对象级反馈。
- 重做 Calendar 待排任务、拖拽、缩放、保存和失败恢复的反馈。
- 为路由和详情建立同级、深入、返回、同路由替换四种空间语义。
- 为首页、今日、知识体系和资料库补最有价值的局部连续性。
- 建立性能、可访问性、截图、录屏和人工否决门禁。

### 1.2 非目标

- 不全站引入 GSAP、React Spring 或 AutoAnimate。
- 不复制一整套 OriginKit/Transitions.dev/Beautiful UI 组件。
- 不把 Canvas UI、Metal、Beam、Orbs 放进核心 Planner 路径。
- 不通过延迟 Server Action 来等待退场动画。
- 不重写 Planner v2 数据模型、repo、workspace 隔离和写入恢复契约。
- 不让 Motion 接管 FullCalendar 的事件定位和缩放。

## 2. 动画所有权

| 场景                                          | 唯一所有者                         | 禁止                                        |
| --------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| hover、press、focus、颜色、简单 icon swap     | CSS                                | 为普通按钮创建 Motion component             |
| Drawer/Sheet/Dialog/Popover/Collapsible/Toast | Base UI + CSS token                | 外层再套独立 presence 导致双动画            |
| 列表增删、重排、shared layout、可中断对象运动 | Motion                             | AutoAnimate 与 Motion 同时观察同一父节点    |
| 路由、页面级 shared element、Suspense handoff | React/Next View Transition         | 用它做 checkbox、tab indicator 等高频微交互 |
| Calendar 事件坐标、拖拽、缩放                 | FullCalendar                       | Motion 改写事件元素的几何 transform         |
| 一次性品牌/奖励试验                           | 隔离 CSS 或按路由动态加载的 Canvas | 常驻 WebGL、滚动视差、全站 shader           |

## 3. 里程碑、工期与依赖

以下为 1 名前端工程师的净工作日估算，不含等待评审时间。

| 批次     | 目标                           |         估算 | 依赖                        |
| -------- | ------------------------------ | -----------: | --------------------------- |
| R0       | 真实现状基线与否决清单         |     0.5–1 天 | 无                          |
| R1       | 静态视觉闸门关闭               |   1.5–2.5 天 | R0                          |
| R2       | Motion contract 与 reduce 同源 |     1.5–2 天 | R0                          |
| R3       | Tasks 高频状态链               |       2–3 天 | R1、R2                      |
| R4       | Calendar 直接操控链            |   1.5–2.5 天 | R1、R2                      |
| R5       | 路由与 shared element          |     1.5–2 天 | R2                          |
| R6       | 今日、知识、资料的局部连续性   |       2–3 天 | R2、R5                      |
| R7       | 品牌试验、总验收与文档         |       1–2 天 | R3–R6                       |
| **总计** |                                | **11–16 天** | 允许 R3/R4 在不同工作树并行 |

发布策略：R0–R2 合并为基础批；R3、R4 分别独立交付；R5–R6 分页面交付；R7 只在前述闸门全绿后执行。

## 4. R0：真实现状基线

### 4.1 任务

1. 在隔离生产实例中创建固定数据集：20 条任务、3 个分组、5 个已完成任务、2 个冲突样本、20 个 Calendar 事件、5 个待排任务、一个知识树和一组资料。
2. 记录以下操作的 60fps 或浏览器最高可用帧率视频：
   - 新建任务并等待服务端实体替换。
   - 完成、恢复、删除、撤销、版本冲突回滚。
   - 任务打开桌面 Inspector、平板 Drawer、移动 Sheet。
   - 待排任务拖入 Calendar、事件拖拽、缩放、失败 revert。
   - Sidebar 在同级模块间切换、列表进入详情、浏览器返回。
   - 系统 reduce、应用内 reduce、快速连续点击。
3. 每条录像记录：commit、构建、浏览器版本、viewport、DPR、skin、theme、reduce、网络节流、CPU 节流。
4. 使用 DevTools Performance 或 Playwright trace 标记点击、首个视觉响应、动画结束和服务端结果。
5. 重新生成 1440×1000、900×1000、390×844 viewport 截图；full-page 截图另存，禁止混用。
6. 对照现有 Planner 视觉复核逐项标记“已修复/仍存在/截图过期/需实时复现”。

### 4.2 交付物

- `docs/reports/YYYY-MM-DD-motion-baseline.md`
- `docs/screenshots/motion/baseline/`
- `docs/videos/motion/baseline/` 或外部不可提交媒体的索引文件
- 一份按流程而非按组件组织的缺陷表

### 4.3 闸门

- 不得用代码阅读结论替代真实操作录像。
- 每个高频动作必须能回答“对象从哪里到哪里、什么时候可继续输入、失败如何恢复”。
- 未完成 R0 不开始 Canvas/Beam/Orbs 等视觉实验。

## 5. R1：关闭静态视觉闸门

本批次执行现有 `2026-07-31-planner-frontend-visual-reassessment.md`，因为运动整改不能建立在被否决的静态界面上。

### 5.1 必做

- 默认任务行只保留一个前导状态控件；批量模式原位替换。
- Planner 所有 input/select/textarea/date/time 经过统一原语和语义 token，不出现 UA 默认白底粗边框。
- Quick Capture 默认可见输入不超过 2 个，清单与日期进入渐进设置。
- Inspector 移动端单列，sticky footer 不覆盖任何字段。
- 全局“收纳”入口与 Inspector/Drawer/Sheet 共享 overlay occupancy；弹层打开时隐藏或移位。
- Sidebar、状态、日期和按钮文案统一中文与格式。
- Calendar 降低概览卡、工具栏、上下文栏和待排卡片的边框竞争。

### 5.2 代码边界

- Planner 皮肤只在 `src/styles/planner/*.module.css`。
- 共享 token 放入 `src/styles/tokens.css`；不得继续扩大 `globals.css`。
- Base UI 原语继续位于 `src/components/ui/`。
- 每修一个旧全局规则，删除或明确标记兼容层；不得只在 `summit.css` 末尾继续覆盖。

### 5.3 验收

- 使用当前代码重新生成 Planner 全矩阵，不复用旧截图。
- 人工视觉评审必须明确签字“通过”；自动测试通过不能替代人工结论。
- `npm test`、`npm run lint`、`npm run typecheck`、`npm run build` 全绿。

## 6. R2：Motion contract 与 reduced-motion 同源

### 6.1 语义 contract

建立一个唯一来源，例如：

- CSS：`src/styles/tokens.css` 中的语义 custom properties。
- Motion：`src/lib/motion/contracts.ts` 中的 typed transition presets。
- Provider：`src/components/ui/MotionProvider.tsx`。

建议语义：

```text
motion.control.feedback
motion.popup.enter / exit
motion.panel.enter / exit
motion.row.enter / exit / reorder
motion.selection.move
motion.route.peer / drill / back
motion.content.reveal
motion.feedback.success / error / revert
motion.reward
```

每个 contract 明确：duration 或 spring、easing、distance、transform origin、退出规则、reduce 版本、允许属性、适用频率。

保留 `--motion-fast/quick/...` 作为一段迁移期的 base token；新代码优先使用语义 contract。

### 6.2 应用内 reduce

- `MotionProvider` 同时读取系统 `prefers-reduced-motion` 与应用内设置。
- 应用内设置变化时不要求刷新页面。
- `MotionConfig` 在任一来源要求 reduce 时使用 `reducedMotion="always"`，否则使用 `"never"` 或经过验证的 `"user"` 策略。
- View Transition 在 reduce 下移除位移、缩放、blur 和大面积 wipe；允许不超过 100–120ms 的局部 opacity 或直接切换。
- FullCalendar 拖拽仍需即时定位，但去除落点弹跳。
- 连续 spinner 只在功能必须时保留；否则改为静态状态和进度文本。

### 6.3 自动审计

新增 `scripts/motion-audit.mjs` 和测试：

- 拒绝新文件裸写 `cubic-bezier(`、裸时长和 `transition: all`。
- 允许 token 定义、`0.001ms` reduce guard 和显式白名单。
- 检查 `@keyframes` 名称唯一，避免 globals/summit 同名覆盖。
- 检查 Motion 组件位于 Provider 下。
- 检查每个 transform/layout 动画有 reduce 策略。
- 输出遗留基线，采用“不得新增，分批归零”，不要求一次清空全部旧 CSS。

### 6.4 单元测试

- 系统 normal + 应用 normal。
- 系统 reduce + 应用 normal。
- 系统 normal + 应用 reduce。
- 设置在运行时切换。
- Motion row、Base UI panel、View Transition 三类代表组件都断言最终状态和无位移版本。

## 7. R3：Tasks 高频状态链

### 7.1 稳定视觉身份

- 为 optimistic task 增加不会随服务端 ID 改变的视觉 key，例如 `clientMutationId` 或独立 `visualId`。
- 数据库实体 ID 仍用于写入和选择；不要污染 repo schema。
- 临时实体替换为真实实体时，同一 DOM/Motion 节点保持；只更新保存状态与数据。
- 为失败回滚保留原索引、原选择和原焦点。

### 7.2 新增

- 回车后输入立即清空，任务行在 100ms 内出现。
- 进入使用 4–8px 以内位移和 opacity；禁止从整屏外飞入。
- 行内展示非阻塞 pending 状态，成功后淡出；不能成功后再次播放整行入场。
- 创建失败时行在原位转为恢复/错误状态，再按现有写入规则回滚；标题回到输入框。

### 7.3 完成与恢复

- checkbox 使用颜色、填充和 check path；标题状态同步。
- 行移动到新分组由 Motion layout 解释，持续 160–240ms。
- 再次点击时能中断并反向，不等待前一次动画结束。
- Action 在原始事件上下文立刻提交；动画与请求并行。
- 服务端失败时同一行回到原分组，错误状态在对象内联显示，Toast 作为补充。

### 7.4 删除、撤销与回收站

- 退出 100–160ms，快于行进入和重排。
- 退出方向与操作来源一致；相邻行立即开始 layout 补位。
- Toast 撤销恢复原索引；同一视觉身份从原位置或相邻位置恢复。
- 快速删除多个任务时动画可合并，不形成长队列。

### 7.5 选中与详情

- 桌面选中背景继续使用 `layoutId`，但与 row reordering 使用同一 LayoutGroup 边界。
- 平板/移动打开详情前记录触发器和对象 identity，为 R5 shared transition 准备。
- 切换选中任务时只移动背景和更新详情内容，不让整个 Inspector 重入场。

### 7.6 测试

- 临时 ID → 真实 ID 的 DOM 节点引用保持。
- 连续 10 次完成/恢复不丢状态、不产生动画队列。
- 版本冲突时实体、分组、选择、焦点、输入全部恢复。
- reduce 下没有 y/scale/layout 位移动画，状态仍清楚。
- 100 条任务、3× CPU 下动画期间无 >50ms Long Task，视觉响应 P95 <100ms。

## 8. R4：Calendar 直接操控链

### 8.1 所有权约束

- 不在 FullCalendar event element 外套会写 transform 的 Motion 节点。
- Motion 只用于 Calendar 外部待排列表、Context Rail 和非几何状态。
- 事件落点与 revert 使用 FullCalendar callback 和 CSS class/state 表达。

### 8.2 待排任务进入时间轴

- drag ghost 保留任务标题、颜色、时长和来源。
- 可落点/不可落点使用颜色与文字，不只靠晃动。
- 落下后 ghost 到事件卡片做 120–180ms 交接；真实事件出现后 ghost 立即销毁。
- pending 保持事件位置，事件内部显示保存状态。

### 8.3 拖拽、缩放与失败

- 成功时不播放额外庆祝；只消除 pending 状态。
- 失败立即调用 `revert()`，视觉回位持续不超过 180ms，并在事件与 Context Rail 同时显示可读原因。
- 新交互可以中断 pending 视觉，但不能绕过版本检查。
- 键盘/字段改期路径使用与拖拽相同的保存、成功、回滚状态。

### 8.4 视图切换

- 月/周/日/议程切换只动画 Calendar canvas，不动画页面标题和 shell。
- 月↔周可用轻微尺度/轴向提示；议程使用短 crossfade。
- 当前日期和选择对象保持 identity，避免切换后重新寻找。

### 8.5 测试

- 200 事件、3× CPU 下无 >50ms Long Task。
- 拖拽、resize、字段改期在成功/失败/reduce 下各一条 E2E。
- Ghost 与真实事件不重叠超过一帧以上的容忍窗口。
- revert 后事件 DOM、日期、时间、焦点和 Context Rail 数据一致。

## 9. R5：路由、页面关系与 shared element

### 9.1 导航分类

建立显式路由关系表：

| 类型    | 示例                                                | 动效                                 |
| ------- | --------------------------------------------------- | ------------------------------------ |
| peer    | 首页 ↔ 任务 ↔ 今日 ↔ 日历                           | 短 crossfade，无方向位移             |
| drill   | 任务列表 → 任务详情；科目 → 知识点；资料 → 文件预览 | shared element + 局部内容 reveal     |
| back    | 详情 → 列表                                         | drill 的逆向；无类型时安全 crossfade |
| replace | 月/周/日、tab、filter、同路由内容                   | 容器内 crossfade/selection move      |

Sidebar 顶级导航不得统一标 `nav-forward`。

### 9.2 Shell 锚点

- Sidebar、TopBar、MobileNav、Capture FAB 从页面内容 transition 中排除。
- route transition 期间禁止首页 intro、组件 riseIn 和 View Transition 叠加。
- 快速连续导航要么中断，要么快速完成当前转场；不能阻塞点击。

### 9.3 shared element 优先级

1. Planner task row → Task Inspector/Sheet 标题与选中面。
2. Calendar event → Event Inspector/Sheet 标题与色条。
3. 首页 next task → 今日任务行。
4. 科目/知识节点 → 详情标题与掌握度。
5. 文件行 → Asset Viewer 标题/缩略图。

每批最多实现两个 shared element 场景，防止 identity 冲突和调试范围失控。

### 9.4 验收

- peer、drill、back、replace 各有录屏和 reduce 对照。
- 浏览器返回、触屏返回、键盘导航和程序化 router 调用均有安全降级。
- 页面 transition 期间没有重复 top bar、重复 FAB、滚动位置跳动或焦点丢失。
- Safari、Chromium、Firefox 当前稳定版执行；不支持特性的浏览器直接更新 DOM。

## 10. R6：今日、知识与资料

### 10.1 今日/首页

- 保留每日首次 intro；重新进入首页不重播。
- 完成“下一步”时，下一任务接续，而不是整张卡重新 riseIn。
- CountUp 和进度条只对真实数据 delta 动画；页面返回直出终值。
- 登顶/清零保留 `motion.reward`，普通保存不使用章、粒子或 confetti。

### 10.2 知识体系

- 节点展开从父节点方向出现，连接线与子节点同步。
- 只动画新增/移除/移动节点和当前焦点，不对整个 map 重播。
- 打开详情使用 shared title/mastery；详情内部 disclosure 继续由 CSS/Base UI 所有。
- 100+ 节点下测量布局和帧时间；必要时关闭非焦点 spring。

### 10.3 资料库

- 上传行从 capture 来源进入当前目录；pending、成功、失败内联。
- 文件移动保留来源占位和目标反馈，失败回到原索引。
- Asset Viewer 只在缩略图存在时 shared；纯文本/PDF 使用标题 crossfade。
- 大文件进度条只动画 scaleX，不动画 width。

## 11. R7：品牌试验与总验收

### 11.1 允许的试验

在所有核心批次通过后，只选一个试验：

- Beam：用于唯一的 agent/sync active 边界。
- Canvas UI：用于登录页或年度/阶段回顾的独立 Hero。
- Orbs：用于未来 AI Assistant 的 working 状态。

每个试验必须：

- 独立 feature flag。
- 动态加载，不进入普通路由首屏 bundle。
- 支持失败回退和 reduce 禁用。
- 低端设备 30fps 以下自动降级或关闭。
- 通过第 10 天测试：连续看 10 天仍提供信息或品牌价值。
- A/B 人工评审；没有明确收益则删除。

### 11.2 总验收矩阵

视口：1440×1000、900×1000、390×844。  
主题：Light、Dark。  
皮肤：Summit、Cloud、Brutal、Terminal，其他皮肤抽测。  
运动：normal、系统 reduce、应用内 reduce、运行时切换。  
网络：正常、Fast 3G、离线、Action 失败、版本冲突。  
输入：鼠标、触屏、键盘、快速连续操作。  
浏览器：Chromium、Safari、Firefox 当前稳定版。

### 11.3 量化门禁

- 点击到首个视觉响应：P95 <100ms。
- 普通控件反馈：50–150ms。
- row/popup/panel：150–300ms；大型 Sheet 上限 360ms。
- 退出不慢于进入，通常快 20–40%。
- 连续操作不产生不可中断动画队列。
- 3× CPU 下核心交互无 >50ms Long Task。
- 任务/事件状态不能只靠运动表达。
- 系统 reduce 与应用内 reduce 的大位移、scale、parallax、loop 数量为 0。
- 页面、弹层、固定层之间无意外 bounding-box 遮挡。

### 11.4 命令门禁

每个批次至少运行：

```text
npm test
npm run lint
npm run typecheck
npm run build
npm run responsive:audit
npm run smoke
node scripts/motion-audit.mjs
```

Planner、写入或 workspace 相关改动继续执行项目开发指南要求的隔离验证；生产真实数据不得用于自动写入测试。

## 12. 任务拆分建议

建议按以下独立变更提交，避免一个 PR 同时修改所有页面：

1. `motion: establish semantic contracts and runtime reduce policy`
2. `planner: close static visual gate and refresh evidence`
3. `planner: preserve optimistic task visual identity`
4. `planner: add task completion deletion and rollback motion`
5. `calendar: add direct-manipulation pending and revert feedback`
6. `navigation: classify peer drill back and replace transitions`
7. `knowledge: add focused tree and detail continuity`
8. `library: add inline upload move and viewer continuity`
9. `motion: add audit gates and final evidence matrix`
10. `experiment: evaluate one isolated brand motion`（可选）

每个变更必须包含：前后录屏、reduce 对照、失败路径、性能摘要、变更过的 contract、未解决风险和回滚方式。

## 13. 完成定义

只有同时满足以下条件，才能把“前端动效整改”标记为完成：

- Planner 静态视觉复核所有 P0/P1 关闭或有明确延期批准。
- R0 的高频流程都有整改后的同条件录屏。
- Tasks 和 Calendar 的成功、失败、撤销、冲突都能在对象本身看懂。
- peer/drill/back/replace 四种页面关系被正确区分。
- 应用内 reduced motion 与系统设置同样有效。
- 新代码不增加裸时长、裸 easing、`transition: all` 或第二套动画引擎。
- 三视口、两主题、reduce、键盘、性能、隔离、构建门禁全绿。
- 人工评审确认运动帮助理解，而不是仅仅“看起来更动”。
