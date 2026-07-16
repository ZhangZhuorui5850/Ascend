# 交付报告：知识点无限嵌套 + 导图详情面板

日期：2026-07-15（承接同日「思维导图视图」交付）

## 交付内容

### 1. 知识点树（数据模型级嵌套）

- 迁移 `0012_point_tree`：`knowledge_points` 加 `parent_point_id`（NULL = 章节直属）+ 索引，存量数据零变动 [KNOWN]。
- 三条不变量 [KNOWN]：
  1. 整棵点树的 `chapter_id`/`submodule` 与根一致（跨章移动时整树同步），所有按章节的既有统计/复习查询零改动即保持正确；
  2. `sort_order` 在（chapter_id, parent_point_id）兄弟组内递增；
  3. `MAX_POINT_DEPTH = 8`（含章节直属层），repo 写路径防环 + 限深，与章节树同一套逻辑。
- repo：`createPoint` 支持 `parentPointId`（章节/科目/submodule 继承父点，同组同名幂等）；`movePointToPosition` 支持"成为某点的子点"目标；`reorderPoints` 按兄弟组；`deletePoint` 级联子树；`getSubjectDetail` 组装点树（父缺失兜底为章节直属）。
- 修复一个既有隐患 [COMPUTED]：点 id 只含毫秒时间戳，同毫秒跨组创建同名点会撞 UNIQUE，已加随机段。
- 两个视图全量支持：列表视图知识点递归缩进渲染、行内 + 加子点、拖拽三态（上前插/下后插/中间成为子点）；导图视图点卡子树、悬浮加子点、点卡三态拖拽、折叠计数。未分章知识点顶层组不可排序（无落库目标，与既有行为一致），但可被拖入章节/点下。

### 2. 导图右侧详情面板

- 单击知识点卡片 → 右侧面板：标题（点击改名）、层级选择、真题星标、掌握度滑条（复用列表视图的 `MasteryCell`，乐观更新+失败回滚）、状态/复习次数/上下次复习/子点数元信息。
- 懒加载关联明细（与列表行内展开同一 `getPointDetailAction`）：关联资料（可点开文件）、错题（回炉/毕业徽标 + 错因 + 下次回炉日）、复习记录（评分/笔记）。

## 文件

- 迁移：`src/lib/migrations.ts`（0012）；repo：`src/lib/repo/knowledge.ts`；action：`src/app/actions/knowledge.ts`
- 组件：`src/components/PointDetailPanel.tsx`（新增）、`SubjectWorkbench.tsx`（PointList/PointBranch 递归、导出 MasteryCell/TIER_OPTIONS）、`MindMapView.tsx`（MapPointNode 递归 + 选中态）、`dnd.ts`（命中判定泛化为 `treeDropEdgeForOffset`）、`chapter-tree.ts`（子树工具泛型化 + `findPointNode`）、`point-sort.ts`（泛型）
- 样式：`src/app/globals.css`（pointChildren/pointPanel/mapCard.selected 等，颜色全走 token）

## 验证

- [COMPUTED] `npm test` 28 文件 216 条全过（新增 repo 嵌套 4 组：继承/幂等、防环/限深/级联删、跨章整树同步、组内插入与重排）；lint、build 全绿。
- [COMPUTED] 隔离实例端到端 11 项断言全过，含：**存量库平滑跑出 0012 迁移**、嵌套卡片渲染、面板错题联动、第 3 层子点创建、导图/列表两种视图拖点成子点、子树跨章整树同步落库。
- [INFERRED] 深层嵌套（4-5 层乃至 8 层）由同一递归路径与限深校验覆盖，端到端验证到第 3 层 + 单测验证到第 8 层边界。

## 后续可选

- 详情面板支持章节卡片（子树统计摘要）。
- 列表视图知识点折叠（当前始终展开；导图有折叠）。
