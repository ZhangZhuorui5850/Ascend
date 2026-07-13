# 知识库体验升级四批次设计（公式 / 乐观更新 / 递归树 / 排序与掌握度 / 安装入口）

## 目标

一揽子解决六项体验问题，按四个独立批次交付，每批可单独构建、测试、上线：

1. 批次一（快赢包）：知识点排序（拖拽 / 时间 / 重要性）、真题星实心化、tier 重要性徽章、掌握度手动更新入口、PWA 安装按钮移入设置页。
2. 批次二：乐观更新统一机制（界面先响应，服务端失败则回滚并提示错误）。
3. 批次三：数学公式渲染（KaTeX），覆盖知识点标题、错题、日记笔记、资料库 Markdown 预览。
4. 批次四：章节递归树（MarginNote 式深层树视角），默认展开 3 层，支持折叠、聚焦子树、拖拽嵌套。

## 现状关键事实

- 知识点表 `knowledge_points` 已有 `sort_order`（仅创建时 MAX+1 赋值，无重排入口），**没有 `created_at`**。
- 树为硬编码 3 层：`subjects` → `subject_chapters`（`subject_code` 外键）→ `knowledge_points`（`chapter_id` 外键）。章节表已有 `sort_order` 与上下移逻辑。
- `mastery`（0–100）与派生 `status` 只能被复习打分（`recordReview`）和错题回炉间接改动；`updatePoint` 不接受 mastery；UI 进度条只读。
- 真题星为 lucide 描边 `Star`，激活仅变琥珀色不填充；tier 表现为行左色条 + 朴素 `<select>`。
- 全项目 mutation 模式统一为 server action → `revalidatePath` → 客户端 `router.refresh()`；仅 DayTasks 勾选有局部乐观状态（本地 `done`），无统一机制、无全局错误提示组件。
- 正文渲染无公式能力；`src/lib/markdown.ts` 为手写 AST 解析器，仅 `AssetViewer` 消费。无 katex/mathjax/markdown 第三方依赖。
- PWA 安装为 `beforeinstallprompt` 驱动的自动浮层（`PwaLifecycle.tsx`），带 14 天忽略期；设置页现有 5 个分组 section。
- 主题为 CSS 变量 token（`src/styles/tokens.css` + 多套 `data-skin` 皮肤），无 tailwind。
- `AGENTS.md` 引用的 `docs/agent-development-guide.md` 不存在（悬空引用，顺带修复）。

## 批次一：快赢包

### 知识点排序

- 章节内知识点工具条加排序模式切换：手动（`sort_order`）/ 时间（`created_at`）/ 重要性（tier 红→黄→绿）。视图偏好按科目存 localStorage，纯前端状态。
- 手动模式下行首显示拖拽把手，HTML5 drag & drop 实现（不引第三方依赖，垂直列表场景足够）；松手后调用新 action `reorderPointsAction({ chapterId, orderedIds })`，repo 层单事务批量写回 `sort_order`。校验所有 id 属于该 chapter 与当前 workspace。
- 非手动模式下隐藏拖拽把手（Notion 同款行为）。
- 迁移：`knowledge_points` 加 `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`。存量行回填为迁移执行时刻（历史创建时间不可考，如实接受）。

### 星标与重要性视觉

- 真题星激活态：`fill` 实心 + `var(--warn)`；未激活维持描边 + `var(--quiet)`。
- tier 改为着色徽章按钮：底色 `color-mix(in srgb, <token> 15%, transparent)`、文字与边框用对应 token（r→`--danger`、y→`--warn`、g→`--ok`），点击弹出三档菜单替换现有 `<select>`。颜色全部走 token，五套皮肤自动适配。行左色条移除，重要性信息统一由徽章承载。

### 掌握度手动更新

- repo：`updatePoint` 扩展可选 `mastery`（clamp 0–100）；`status` 派生公式（≥80 已掌握 / >0 学习中 / 0 未学）从 `reviews.ts` 抽成共享函数 `deriveStatus(mastery)`，复习域与编辑域共用，避免两处漂移。
- UI：知识点行的掌握度进度条改为可交互滑块（点击 / 拖动即设值，`input[type=range]` 样式化为现有进度条外观），旁保留百分数。复习打分的自动调整逻辑不变。

### PWA 安装按钮入设置页

- `PwaLifecycle` 继续在根布局早期捕获 `beforeinstallprompt`（该事件只发一次），事件存入模块级 store（简单 subscribe/getSnapshot，配 `useSyncExternalStore`）。
- 设置页新增第 6 分组 `<section id="app">`「应用」+ 顶部锚点：客户端组件 `InstallAppSection`，四态——可安装（按钮触发 `prompt()`）/ 已安装（standalone 检测，显示状态文案）/ iOS Safari（"分享 → 添加到主屏幕"图文引导）/ 不支持（说明原因）。
- 删除自动弹出的 `pwaNotice` 浮层及 14 天忽略逻辑（入口固定后不再需要）。iOS 引导文案同样只保留在设置页。

## 批次二：乐观更新统一机制

- 新增客户端 hook `useOptimisticMutation`：调用时立即更新本地影子状态 → 后台执行 server action → 成功后 `router.refresh()` 收敛到服务端真值；失败（`result.ok === false` 或抛错）则回滚影子状态并触发全局错误 toast。
- 新增轻量全局 toast 组件（错误优先，挂根布局，无第三方依赖），供全项目复用。
- 首批接入：DayTasks 任务勾选（收编现有 ad-hoc 本地 done 状态）、知识点 tier / 星标 / 掌握度 / 标题、章节改名。低频操作维持现状，模式稳定后续铺。
- server action 协议不变（`{ok, error}`），无服务端改动。

## 批次三：数学公式（KaTeX）

- 引入 `katex` 依赖（本地打包随应用分发，离线可用；SW 缓存策略不需改动）。语法：`$...$` 行内、`$$...$$` 块级。
- `src/lib/markdown.ts` AST 增加 `mathInline` / `mathBlock` 节点，转义规则：`\$` 不触发；未闭合的 `$` 按普通文本处理。
- 新增共享组件 `RichText`：接受纯文本，渲染文本 + 公式（`katex.renderToString`，`throwOnError: false`，坏公式原样降级显示不崩溃）。KaTeX 模块按需动态 import（内容含 `$` 才加载），CSS 随组件引入。
- 接入四处：
  1. 知识点标题：非编辑态渲染 `RichText`，聚焦/点击切回 `<input>` 显示原文（双态编辑）。
  2. 错题标题与原因。
  3. 日记笔记（展示态渲染，编辑仍 textarea）。
  4. 资料库 Markdown 预览（`AssetViewer` 经由扩展后的解析器自动获得）。

## 批次四：章节递归树

- 迁移：`subject_chapters` 加 `parent_id TEXT`（NULL = 顶层），存量章节全部保持顶层，零数据变动。`sort_order` 语义变为同层（同 `parent_id`）内排序。
- repo：`getSubjectDetail` 一次拉取科目全部章节，在 JS 内组树（避免递归 SQL）；类型 `ChapterWithPoints` 增加 `children`。`moveChapter` 扩展支持改变父级，增加防环校验（目标父级不得是自身或其子孙）；树深度上限 8 层。
- `deleteChapter` 语义：级联删除全部子孙章节，每个被删章节下的知识点沿用现有单章节删除对知识点的处理规则，递归应用；删除前 UI 需确认并提示将影响的子章节数量。
- UI（`SubjectWorkbench`）：
  - `ChapterBlock` 递归渲染子章节；默认展开到第 3 层，更深折叠；折叠状态按章节 id 存 localStorage。
  - 每章节操作区增加「添加子章节」；拖拽章节到另一章节上使其成为子级（复用批次一的 HTML5 DnD 基建），上下移仍为同层重排。
  - 聚焦模式：章节的聚焦按钮 → 仅渲染该子树 + 顶部面包屑（科目 > … > 当前章节）逐级返回。聚焦状态存 URL query（可分享、刷新保持）。

## 验证

- 每批交付跑 `npm test`、`npm run lint`、`npm run build` 全绿后收尾。
- 新增 vitest 用例：重排事务与越权校验、mastery clamp 与 `deriveStatus`、公式 AST 解析（转义/未闭合/嵌套代码块内不解析）、树组装、防环校验、级联删除。
- UI 行为以本地起服后实际操作验证（拖拽、滑块、聚焦、安装分组四态、乐观回滚——用模拟失败的 action 验证回滚与 toast）。
- 用户生产实例为 localhost:3000 的 `next start`，每批合入后需 build + 重启才生效。

## 交付顺序与独立性

批次一 → 二 → 三 → 四。批次二依赖批次一的掌握度滑块（接入点之一）；批次四复用批次一的 DnD 基建；批次三完全独立。每批一个 PR/提交组，全绿即可先行上线。

## 非目标

- 不引入 SWR / react-query / 状态管理库；不引入 dnd 第三方库。
- 不做知识点富文本正文字段（公式只作用于现有文本字段）。
- 不做跨章节拖拽知识点（知识点重排仅限章节内；跨章节移动维持现状）。
- 不改复习打分算法与 mastery 自动调整公式。
- 不做文件夹树（资料库）的改动。

## 顺带修复

- `AGENTS.md` 中 `docs/agent-development-guide.md` 悬空引用：改为指向实际存在的文档（`docs/superpowers/specs/` 与 `docs/UPGRADE_BRIEFING.md`）或补一份精简指南。
