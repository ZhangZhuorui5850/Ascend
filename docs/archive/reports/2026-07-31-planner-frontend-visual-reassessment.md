# Ascend Planner 前端视觉复核与整改计划

日期：2026-07-31  
复核对象：Tasks、Task Inspector、Calendar 与共享 Planner 原语  
复核触发：桌面 Tasks 实机截图人工评审  
状态：整改实现完成；主矩阵通过，完成审计正在补齐状态/软键盘证据  
范围：视觉、信息层级、控件语义、交互呈现与验收方法；Planner v2 数据和写入契约保持稳定

## 0. 整改执行结果（2026-07-31）

[COMPUTED] R1–R4 的产品整改已完成，P0/P1 缺陷已关闭，P2 的 Calendar 层级、待排任务密度和独立滚动观感也已同步收口。默认任务行与批量模式均只保留一个前导控件；Tasks 与 Calendar 共用 Planner Field、Select、Date/Time 和 Property Row；Quick Capture、Sidebar、Inspector、Calendar 概览/工具栏/Inbox 均已按本计划降噪。[KNOWN] 逐项完成审计发现 R0 静态原型工件，以及 R5 的 Calendar 四视图、空/密集/错误/冲突/恢复与软键盘占用证据仍需补录；这些项目完成前不宣称 R0–R5 全部闭环。

[COMPUTED] 最终工程门禁：60 个 Vitest 文件、393 项测试通过；全量 ESLint、`tsc --noEmit` 与 Next.js 16.2.12 生产构建通过。隔离生产实例使用独立 `ZGCA_DATA_ROOT` 和测试账号运行，验证结束后已按精确 PID 停止并删除临时数据目录。

[COMPUTED] `scripts/responsive-audit.mjs` 已通过 1440×1000、900×1000 和 390×844 三视口，覆盖默认/选择任务行、Quick Capture、Drawer/Sheet 回焦、Planner 字段 computed style、中文文案、单列表单、水平溢出和 fixed/sticky 矩形相交。外观矩阵按代码实际支持的 `default`、`aurora`、`brutal`、`cloud`、`terminal` 五套 skin，在 light/dark 下抽测 Tasks 与 Calendar，并验证 reduce motion。原计划中的 Summit/Forest 名称不属于当前可选 skin，不作为虚构验收项。

[COMPUTED] 六张最终证据位于 [`docs/screenshots/planner/after-upgrade/`](../../screenshots/planner/after-upgrade/)；每张均为 `fullPage: false` 的 viewport 截图，并有同名 JSON 记录 route、state、viewport、browser、theme、skin、scroll 和 build identifier。逐张 100% 缩放人工复核确认：双前导控件、原生白底、边框过量、英文状态、sticky footer、ICP/FAB 遮挡均未复现。V-014 与 V-015 的自动矩形相交结果为零。

[KNOWN] 当前需先补齐上述完成证据，再进入本文件第 6.4 节的用户最终视觉确认；两者完成前不把整改写成正式发布通过。

证据标签：`[COMPUTED]` 表示由当前代码、样式或落盘截图直接确认；`[INFERRED]` 表示基于这些事实作出的设计判断；`[KNOWN]` 表示本轮明确采用的产品或验收约束。

## 1. 复核结论

[COMPUTED] 当前代码、交付报告和落盘截图能够证明 Planner 已有功能与工程验证，但截图同时保留了重复控件、原生表单外观和遮挡问题。[INFERRED] 因此现有证据不足以支持“视觉完成”，当前视觉完成度未达到产品交付标准。前一版验收把自动化通过、响应式成立和功能完整误判成视觉完成，人工评审环节缺少明确否决标准。

[KNOWN] 必须优先修复两个 P0 问题：

1. 任务行同时展示方形批量选择框与圆形完成按钮，两个相邻控件形成重复语义。
2. Planner CSS Modules 缺少完整表单皮肤，输入框、下拉框和日期控件呈现浏览器原生白底、粗边框和平台格式。

整套界面还存在边框过量、卡片过量、Inspector 密度过高、操作权重失衡、中英文混用和日期格式漂移。Tasks 与 Calendar 的视觉闸门统一重新开启。

[COMPUTED] 本轮缺陷清单共 15 项：2 个 P0、10 个 P1、3 个 P2。该统计以本文件表格为唯一来源；不得继续引用此前口头摘要中的“2/7/4”。

### 1.1 复核样本与证据边界

| 样本 | 文件 | 能直接证明 | 不能单独证明 |
|---|---|---|---|
| Tasks 桌面详情 | [`tasks-phase5-inbox-recovered.png`](../../screenshots/planner/after/tasks-phase5-inbox-recovered.png) | 双前导控件、白底/粗边框字段、常驻删除、语言与日期格式、右栏浮层遮挡 | 键盘行为、computed style 的最终值 |
| Tasks 移动 Sheet | [`tasks-phase5-mobile-sheet.png`](../../screenshots/planner/after/tasks-phase5-mobile-sheet.png) | 双前导控件、长表单、原生字段、sticky footer 与日期字段重叠 | 真实 844px 视口内随滚动变化的遮挡范围 |
| Calendar 桌面详情 | [`calendar-phase5-event-detail.png`](../../screenshots/planner/after/calendar-phase5-event-detail.png) | 四张概览卡、外框层级、原生字段、浮动“收纳”覆盖右栏 | 拖拽与弹层交互状态 |
| Calendar 移动 Sheet | [`calendar-phase5-mobile-keyboard-sheet.png`](../../screenshots/planner/after/calendar-phase5-mobile-keyboard-sheet.png) | 控件密度、日期/时间的 locale 外观、表单层级 | 软键盘打开后的实际可视区域 |

[COMPUTED] Phase 5 移动截图是 390px 宽的 full-page 产物（Tasks 高 2006px，Calendar 高 1317px），不是 390×844 的 viewport 截图。因此它们足以否决当前视觉方案，但不能替代对固定/粘性元素、软键盘和首屏遮挡的实时验证。R0 必须补录 390×844 viewport 截图、浏览器与 skin、页面状态、滚动位置和构建版本。

## 2. 缺陷清单

以下表格中，“直接证据”默认属于 `[COMPUTED]`，“用户影响”默认属于 `[INFERRED]`；对尚需实时复现的范围会在单元格内明确保留条件。

| ID | 级别 | 缺陷 | 直接证据 | 用户影响 |
|---|---|---|---|---|
| V-001 | P0 | 任务行出现两个前导勾选控件 | [COMPUTED] `PlannerTaskRow.tsx:68–82` 同时渲染 checkbox 与完成按钮；`tasks.module.css:253` 为两者保留独立列；Tasks 桌面与移动截图均可见 | [INFERRED] 用户无法快速判断哪个控件表示完成 |
| V-002 | P0 | Planner 表单控件退化为原生白底样式 | [COMPUTED] Tasks 的 `.field input`、Calendar 的 `.field input` 仅声明宽度；全局 `.field input` 无法命中 CSS Module 哈希类；四张复核截图均可见 | [INFERRED] 暖纸张体系被大量白框切碎，主题一致性失效 |
| V-003 | P1 | Quick Capture 同时暴露标题、清单、日期和高权重加号 | `PlannerQuickCapture.tsx:30–45` 固定展示四个控件 | 收集动作产生表单负担，首屏视觉重心落在控件外框 |
| V-004 | P1 | Inspector 在 380px 宽度内使用双列表单 | `tasks.module.css:454–458` 固定双列；基础与时间字段连续堆叠 | 标签、输入值和原生箭头拥挤，扫读路径断裂 |
| V-005 | P1 | 页面边框和容器层级过量 | Workspace、Quick Capture、选中行、Inspector、输入框、按钮均形成独立轮廓 | 主次关系模糊，视觉噪声持续覆盖内容 |
| V-006 | P1 | 行尾删除按钮长期暴露 | `PlannerTaskRow.tsx:96–103` 每行固定展示删除 | 危险操作权重过高，行内信息被两端控件挤压 |
| V-007 | P1 | 侧栏创建输入框长期占位 | 新建清单与新建标签使用常驻输入框和方形加号 | 低频管理动作持续消耗纵向空间 |
| V-008 | P1 | 文案语言混用 | Today、Upcoming、Completed、Trash、Open 与中文页面并存 | 产品语言不统一，理解成本增加 |
| V-009 | P1 | 日期格式由浏览器 locale 决定 | 列表元数据使用 `2026-07-31`，同屏原生日期控件却显示 `mm/dd/yyyy` 占位和 `07/31/2026` 值 | 日期含义和输入预期不稳定 |
| V-010 | P1 | Calendar 共享同一表单皮肤缺口 | `calendar.module.css:281–297` 同样只控制布局与宽度 | Event Composer 和待排任务延续白框与粗边框问题 |
| V-011 | P2 | Calendar 概览卡、工具栏、日历外框和上下文栏争夺层级 | `calendar.module.css:6–53` 形成四张概览卡与大外框 | 时间画布的核心地位被削弱 |
| V-012 | P2 | Calendar 待排任务采用卡片内嵌日期、时间和按钮 | `calendar.module.css:351–390` 每条任务形成三控件卡片 | 长列表密度低，排期效率下降 |
| V-013 | P2 | 独立滚动条视觉过强 | Tasks Inspector 使用独立 `overflow-y: auto`，截图中滚动条长期可见 | 右栏形成浏览器工具面板观感 |
| V-014 | P1 | 移动 Task Inspector 的 sticky footer 压住表单字段 | [COMPUTED] `tasks.module.css:503–510, 705–711` 使用 sticky footer、移动底部偏移和 `margin-top: -78px`；移动 Sheet 截图中 footer 覆盖日期输入区域 | [INFERRED] 用户可能看不到当前字段或误以为表单已结束；实际阻断范围需在 390×844 视口复测 |
| V-015 | P1 | 全局浮动“收纳”入口覆盖 Planner 上下文栏 | [COMPUTED] Tasks 与 Calendar 桌面截图中按钮悬浮于右栏内容上方 | [INFERRED] 页面级浮层未与 Planner Inspector、Drawer 和 Sheet 协调安全区，形成遮挡和视觉抢权 |

## 3. 技术根因

### 3.1 CSS Modules 与全局表单规则断层

Planner 组件使用：

```tsx
<label className={styles.field}>
  标题
  <input />
</label>
```

构建后类名变为哈希值。`globals.css` 的 `.field input` 选择器仍指向全局 `field` 类，因此它无法为 Planner 控件提供背景、边框和内边距。Planner 模块内当前规则只提供：

```css
.field input,
.gridFields input {
  width: 100%;
  min-width: 0;
}
```

最终视觉由浏览器原生 appearance 和默认 Canvas 背景主导。Calendar 使用相同结构，影响范围覆盖 Task Inspector、Event Composer、提醒、重复、子任务和待排任务。

### 3.2 批量选择与完成动作并列

任务行默认结构为：

```text
[批量选择方框] [完成圆圈] [标题与元数据] [优先级] [删除]
```

两个前导控件在形状和位置上表达相似动作。批量选择属于临时模式，完成属于日常主动作；默认态同时展示造成语义冲突。

### 3.3 验收指标偏向工程正确性

前一轮闸门验证了：

- DOM 可访问名称。
- 44px 触控目标。
- Drawer 与 Sheet 焦点。
- 水平溢出。
- 乐观回滚。
- Light、Dark 与 reduce。
- 构建、测试和运行时错误。

这些指标证明界面可操作。视觉验收还需要控制密度、层级、对齐、控件语义、表面颜色、边框数量、字体节奏和实际观感。截图当时承担了存档作用，缺少逐图人工否决清单。

### 3.4 自动测试固化了结构，缺少视觉质量断言

现有 Tasks 测试确认 Motion、响应式断点、键盘和组件拆分。测试没有约束：

- 默认任务行只出现一个前导状态控件。
- 批量选择只在选择模式出现。
- Planner 表单控件必须使用统一 Field 原语。
- Planner 控件背景必须来自语义 token。
- 中英文与日期格式必须一致。
- 默认行内危险操作必须降权。

### 3.5 固定与粘性层缺少统一安全区

[COMPUTED] Tasks Inspector footer 自身使用 sticky 定位，移动规则还叠加底部导航偏移和负 margin；应用壳层同时存在全局浮动“收纳”入口。现有响应式审计主要检查水平溢出、触控目标和焦点，没有对两个可交互元素的 bounding box 相交做断言。

[INFERRED] 这不是单个 `z-index` 数值错误，而是页面级 Planner 表面与应用壳层没有共享 overlay occupancy / safe-area 契约。仅提高 padding 或继续叠加偏移会在不同视口、软键盘和 full-page capture 下重新漂移。

## 4. 新设计方向

[KNOWN] 目标体验定义为“安静的计划台”：内容占据视觉中心，操作在需要时出现，状态通过位置、字重和轻量色彩表达。

### 4.1 表面层级

桌面只保留四个层级：

1. 页面背景 `planner-canvas`。
2. 左侧导航与右侧 Inspector 的轻微分区。
3. 当前选中行和焦点字段的局部强调。
4. Drawer、Sheet、Popover、Toast 的浮层。

Workspace 使用分栏和间距建立结构。任务行默认使用透明背景与细分隔线。卡片背景集中用于浮层、错误和需要独立理解的聚合信息。

### 4.2 任务行

默认态：

```text
○  阿斯顿                         P2   7月17日   ⋯
   30 分钟 · Inbox
```

批量模式：

```text
□  阿斯顿                         P2   7月17日
```

规则：

- 默认态只显示圆形完成按钮。
- “选择”按钮进入批量模式后，圆形完成按钮原位切换为方形选择框。
- 每行始终保留一个前导状态控件。
- 删除进入行尾更多菜单；Trash 视图使用恢复作为明确主动作。
- 选中行使用 2px 左侧强调线和 4–6% accent tint。
- hover 提供轻微背景变化，常态保持无卡片边框。
- 空格继续完成任务；批量模式下空格切换选择。

### 4.3 Quick Capture

默认只展示标题和“添加任务”：

```text
[ 收集一件要做的事…                              ]  添加
  Inbox · 今天                    [设置清单与日期]
```

清单和日期通过轻量属性按钮或 Popover 展开。当前属性以文字摘要展示。高频回车提交保持一跳完成。

### 4.4 Sidebar

- 智能视图统一中文：收集箱、今天、近期、随时、逾期、等待、已完成、回收站。
- 新建清单和新建标签使用一个文字按钮，点击后打开内联编辑或 Popover。
- 活跃项使用左侧强调线、字重和浅色背景。
- 计数只出现在有决策价值的视图。

### 4.5 Task Inspector

Inspector 使用单列属性表：

```text
任务详情                                      已保存

阿斯顿
────────────────────────────────────────
清单        Inbox
状态        进行中
优先级      P2
预计        30 分钟

时间
到期        2026-07-17
计划        添加计划时间

备注        添加备注
────────────────────────────────────────
提醒        未设置                         ›
重复        单次任务                       ›
子任务      0 项                           ›
```

规则：

- 标题使用大号无框输入，聚焦时显示底线。
- 常用属性使用 label/value 行，点击值进入 Popover 或轻量编辑态。
- 日期与时间归入一个“时间”组。
- 主按钮仅在存在未保存更改时出现；保存状态位于标题栏。
- 系统版本信息进入末尾低权重区域。
- 右栏保持单列，避免 380px 内双列挤压。

### 4.6 表单控件

建立 `PlannerField`、`PlannerSelect`、`PlannerDateField` 和 `PlannerPropertyRow`：

| 状态 | 背景 | 边框 | 视觉要求 |
|---|---|---|---|
| 默认 | `--planner-field` | 1px `--planner-field-line` | 与纸张接近，保持轻微区分 |
| hover | `--planner-field-hover` | 1px `--line-strong` | 仅增强一级 |
| focus | `--planner-field-focus` | 2px focus ring | accent 清晰可见 |
| disabled | transparent | 1px `--line` | 降低对比度 |
| error | `--danger-soft` | 1px `--danger` | 与错误文本成组 |

所有控件显式声明 `background`、`border`、`border-radius`、`padding`、`min-height`、`appearance` 和 focus ring。日期与时间显示由统一包装层控制，页面文案使用 `YYYY-MM-DD` 或中文月日格式。

### 4.7 Calendar

- 概览指标改为一条文本摘要，减少四张并列卡片。
- 工具栏形成“导航 / 视图 / 主动作”三个清晰组。
- 月、周、日画布保留为页面核心表面。
- 上下文栏复用新的 Property Row 与 Field 原语。
- 待排任务使用紧凑行，点击后展开日期时间编辑。
- 移动议程日期条降低边框密度，今天使用单一 accent 标记。

### 4.8 固定层与安全区

- Inspector footer 必须占据正常布局空间或由容器显式预留等高空间，禁止用负 margin 把它压回字段区域。
- Planner Drawer/Sheet 打开时，全局浮动入口隐藏、移位或进入统一 overlay slot。
- 页面级固定元素、移动底部导航、软键盘和 safe-area 使用同一组 CSS 变量计算占用高度。
- 截图与 E2E 对所有可交互控件做矩形相交检测，允许 Popover/Dialog 等有意覆盖，拒绝常驻层无意遮挡字段。

## 5. 视觉 token

新增 Planner 专用语义 token，所有 skin 提供映射：

```css
--planner-canvas;
--planner-panel;
--planner-panel-subtle;
--planner-field;
--planner-field-hover;
--planner-field-focus;
--planner-field-line;
--planner-row-hover;
--planner-row-selected;
--planner-row-divider;
```

Summit Light 建议基线：

```css
--planner-canvas: #f7f2e7;
--planner-panel: #faf7ef;
--planner-panel-subtle: #f4efe3;
--planner-field: #f6f1e6;
--planner-field-hover: #f2ecdf;
--planner-field-line: #d8d0c0;
--planner-row-selected: color-mix(in srgb, var(--accent) 6%, transparent);
```

具体颜色通过真实截图和对比度测量确认。语义目标是暖纸张连续性、清晰焦点和克制边界。

## 6. 新验收标准

### 6.1 DOM 与交互

- 默认任务行前导状态控件数量等于 1。
- 批量模式任务行前导状态控件数量等于 1。
- 默认任务行不长期展示删除按钮。
- 批量模式具备明确进入、退出和已选数量。
- Quick Capture 默认可见字段数量不超过 2 个。
- Inspector 在 360–380px 宽度保持单列。
- 390×844 下 sticky footer 不与任何输入、选择、按钮或可展开区域相交。
- Drawer 或 Sheet 打开时，全局浮动入口不覆盖 Planner 内容和关闭路径。

### 6.2 视觉

- Planner 表单控件的 computed background、border 和 radius 全部来自批准 token。
- Summit Light 下 Planner 表单不存在浏览器默认纯白 Canvas 背景。
- 同一任务行常态轮廓数量不超过 1。
- 主页面同时可见的高强调实心按钮不超过 1 个。
- 任务列表默认采用分隔线或留白，选中项使用单一背景层。
- 中英文状态文案统一为中文。
- 日期展示格式统一。
- 每张验收截图在 100% 缩放下完成逐项人工评审。
- 每张截图记录 viewport、full-page 与否、浏览器、skin、数据状态、滚动位置和构建版本；full-page 截图不得冒充 viewport 首屏证据。

### 6.3 响应式

- 1440px：三栏成立，任务列表宽度优先于 Inspector。
- 900px：详情进入 Drawer，列表保留单一前导控件。
- 390px：Sheet 中使用单列表单，软键盘打开后主字段和提交路径可见。
- Light、Dark、Summit、Cloud、Brutal、Terminal 和 Forest skin 进行表单 token 抽测。

### 6.4 自动化

新增失败测试：

1. `PlannerTaskRow` 默认模式只渲染完成控件。
2. 批量模式只渲染选择控件。
3. Planner Field 原语应用于 Tasks 与 Calendar 所有表单。
4. Playwright 读取 computed styles，拒绝 UA 默认背景和边框。
5. Quick Capture 默认字段数量。
6. Inspector 单列布局。
7. 中文文案与统一日期格式。
8. 三视口视觉快照差异审查。
9. 390×844 下 sticky/fixed 元素与 Planner 可交互控件的 bounding box 相交检测。

人工闸门：

1. 设计稿或静态 HTML 原型评审。
2. 桌面 Tasks 首屏评审。
3. Inspector 展开态评审。
4. 平板 Drawer 与移动 Sheet 评审。
5. Calendar 月/周/日/议程评审。
6. 用户确认后更新完成状态。

## 7. 整改实施顺序

### R0｜失败测试与视觉原型

- 写入单前导控件、Field 原语和 computed style 失败测试。
- 产出 Tasks 桌面静态原型与 Inspector 原型。
- 人工确认层级、密度、颜色和控件语义。
- 补录 1440×1000、900×1000、390×844 的 viewport 截图元数据，并复现 V-014/V-015。

闸门：原型通过人工评审。

### R1｜表单系统

- 新增 Planner Field、Select、Date/Time 和 Property Row。
- 接入 Tasks、Calendar、提醒、重复、子任务与待排任务。
- 完成所有 skin 的 token 映射。

闸门：原生白框计数为 0，焦点与对比度通过。

### R2｜任务行与批量模式

- 默认态保留完成按钮。
- 增加显式批量模式。
- 删除操作进入更多菜单。
- 重做选中、hover、完成和键盘状态。

闸门：默认与批量模式的前导控件均为 1。

### R3｜Quick Capture、Sidebar 与 Inspector

- Quick Capture 收敛为标题、属性摘要和提交。
- Sidebar 收敛低频创建入口并统一中文。
- Inspector 改为单列 Property Row 与按需编辑。

闸门：桌面首屏与 380px Inspector 人工评审通过。

### R4｜Calendar 视觉统一

- 收敛概览卡和工具栏。
- Composer、Inspector、待排任务复用 Planner Field。
- 降低议程与事件卡片边框密度。

闸门：月、周、日、议程和上下文栏人工评审通过。

### R5｜全矩阵验收

- 1440px、900px、390px。
- Light、Dark、reduce motion。
- 重点 skin 抽测。
- 空、密集、错误、冲突与恢复。
- 生产构建、功能回归、workspace 隔离与视觉截图。

闸门：自动化通过并获得人工视觉确认。

## 8. 保持不变的工程契约

- Planner v2 数据模型。
- Server Action → `requireWorkspace()` → repo 写路径。
- workspace 隔离。
- 版本冲突与乐观恢复。
- `revalidatePath` 缓存失效。
- FullCalendar 拖拽与缩放 Action。
- Drawer、Sheet 的焦点和键盘契约。
- 提醒、重复、迁移与备份链。

## 9. 完成定义

视觉整改完成需要同时满足：

1. P0 与 P1 缺陷关闭。
2. 默认任务行只保留一个状态控件。
3. Tasks 与 Calendar 表单全部使用 Planner 原语。
4. 三视口和主题矩阵通过。
5. 人工评审确认内容层级、控件语义、表面颜色和整体观感。
6. 原执行计划与交付报告恢复为视觉通过状态。
7. V-014/V-015 经真实 viewport 验证关闭，所有常驻 fixed/sticky 层与可交互控件零非预期相交。
