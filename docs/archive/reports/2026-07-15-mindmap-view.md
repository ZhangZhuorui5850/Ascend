# 交付报告：科目知识库思维导图视图

日期：2026-07-15

## 交付内容

科目详情页新增「列表 / 导图」视图切换（URL `?view=map`）。导图视图以 MarginNote 式向右伸展的树呈现「科目 → 章节 → 知识点」，零新依赖，全部编辑操作复用现有 server action 写路径。

- 布局 [KNOWN]：嵌套 DOM（每个节点 = flex 行 `[卡片][子节点列]`）由浏览器排版；连接线为绝对定位 SVG overlay，渲染后测量卡片矩形画贝塞尔曲线（`ResizeObserver` 跟随字体/公式异步加载重算）。
- 交互 [COMPUTED]（Playwright 隔离实例 11 项断言全过）：视图切换、节点渲染与连线、双击改名（章节/知识点）、悬浮工具新增子章节/知识点/删除/聚焦、折叠展开（与列表视图共享 `collapsedMap` 记忆）、拖拽知识点跨章节（落库 `chapter_id` 与 `submodule` 同步）、拖拽章节三态（前插/后插/嵌套，落库 `parent_id`）、缩放控件与 Ctrl+滚轮（0.4–1.6）、空白处拖拽平移。
- 约束 [KNOWN]：知识点仍为叶子（数据模型无 `parent_point_id`，导图中知识点卡片间只支持同章排序）；章节深度上限沿用 `MAX_CHAPTER_DEPTH = 8`，客户端预判 + 服务端兜底；知识点卡片间拖拽排序仅在「手动」排序模式下开启（与列表一致）。

## 文件

- 新增：`src/components/MindMapView.tsx`（视图）、`src/components/chapter-tree.ts`（树纯工具，自 SubjectWorkbench 抽出）、`src/components/mindmap.ts`（缩放/连线纯几何）及对应 `*.test.ts`。
- 修改：`src/components/SubjectWorkbench.tsx`（视图切换、导出 `TreeControls`、命中判定改用共享函数）、`src/components/dnd.ts`（新增 `chapterDropEdgeForOffset` 供两视图共用）、`src/app/subjects/[code]/page.tsx`（`view` 参数）、`src/app/globals.css`（`mapCard`/`mapLink` 等样式，颜色全走 token）。

## 验证

- [COMPUTED] `npm test` 28 文件 210 条全过（新增 chapter-tree / mindmap / chapterDropEdgeForOffset 三组）；`npm run lint`、`npm run build` 全绿。
- [COMPUTED] 隔离实例端到端（`verify` skill 配方，端口 3123 + 独立数据目录）：11 项断言全过，截图确认布局与连线正确。
- [INFERRED] headless 截图中文为方框系 chromium-headless-shell 缺 CJK 字体，非应用问题。

## 后续可选

- 知识点互相嵌套需数据模型变更（`parent_point_id` 迁移 + 防环/深度校验），建议独立迭代。
- 导图内未提供层级/掌握度/星标编辑（列表视图已有），可按需补节点弹层。
