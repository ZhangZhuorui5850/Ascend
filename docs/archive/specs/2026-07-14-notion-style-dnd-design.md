# Notion 式拖拽体验升级（知识点 + 章节全套）设计

日期：2026-07-14
状态：已确认

## 背景与目标

现状：知识点手动排序与章节嵌套用原生 HTML5 DnD，拖动时只有浏览器默认的整行半透明截图，目标行仅一个背景高亮（`.dragOver` / `.chapterDropTarget`），没有插入位置指示，其他行不给任何排布反馈。

目标：参考 Notion 的块拖拽，把三类拖拽统一为同一套成熟交互——

1. 知识点章内手动排序；
2. 知识点跨章节移动（新能力）；
3. 章节同级任意位置排序 + 拖拽嵌套（排序为新能力，现只有相邻交换按钮）。

## 交互设计

### 拖拽卡片（ghost）

`dragstart` 时克隆一张样式化半透明圆角卡片（条目标题；章节附「N 个知识点」计数），挂到 `document.body` 屏幕外，经 `setDragImage` 跟随光标，`dragend` 移除。替代浏览器默认整行截图。

### 插入指示线

拖动中按光标在目标元素内的相对纵坐标显示一条 2px 强调色圆角指示线，左端带小圆点（Notion 同款）：

- **知识点行**（拖知识点）：上半 → 行上方线（插到它前面）；下半 → 行下方线（插到它后面）。跨章节同样适用。
- **章节头**（拖章节）：上 25% → 同级排到它前面；下 25% → 同级排到它后面；中间 50% → 整行高亮 = 嵌套为其子章节。三态视觉明确区分。
- **章节头 / 空知识点列表**（拖知识点）：整块高亮 = 移入该章节末尾；空章节显示「拖到这里」placeholder 区。

### 约束与反馈

- 非法目标（章节拖进自己子树、嵌套超出 `MAX_CHAPTER_DEPTH`）：显示 `not-allowed` 光标、不出指示线。UI 层预判 + repo 层校验双保险。
- 拖拽期间 `body[data-dragging]`：禁用文本选中与无关 hover 效果。
- Esc 取消：原生行为，不额外处理。
- 知识点拖拽仍仅在「手动排序」模式开启（其他排序模式位置由规则决定，与现状一致）。
- 触屏不做原生拖拽（HTML5 DnD 不支持 touch），移动端保留上移/下移按钮兜底。
- 提交期间沿用 `reordering` 禁用态，防重复提交。

## 前端架构

- 新建 `src/components/dnd.ts(x)`：
  - 共享拖拽状态 `{ kind: 'point' | 'chapter', id, sourceChapterId, title }`，提升到 SubjectWorkbench 顶层，取代现在的 `tree.dragChapterId` 与各 ChapterBlock 局部 `dragId`；
  - `edgeFromEvent(event, element, zones)`：命中计算，返回 `before | after | inside`；
  - `makeDragImage(title, meta?)`：拖拽卡片工厂。
- 指示线用 CSS 类 `dropBefore` / `dropAfter` / `dropInside` + 绝对定位伪元素实现；颜色一律走 `src/styles/tokens.css` 强调色变量，适配多套 `data-skin` 皮肤。
- 提交沿用既有写路径：server action（`requireWorkspace()` → repo → `revalidatePath`）→ `{ok, error}` → `report()` toast → `router.refresh()`。

## 数据层（无 schema 变更）

`sort_order` / `parent_id` / `chapter_id` 字段均已存在，无需迁移。`src/lib/repo/knowledge.ts` 新增：

1. `movePointToPosition(db, scope, { pointId, targetChapterId, index })`
   - 同章：等价现有 `reorderPoints` 语义（插入到 index）；
   - 跨章：事务内更新 `chapter_id` 并重排源、目标两章的 `sort_order`；
   - 校验：point、目标章节均属当前 workspace 且同一 subject。
2. `moveChapterToPosition(db, scope, { id, parentId, index })`
   - reparent（可为 null 顶层）+ 插入同级指定位置；
   - 复用现有防环（`collectChapterSubtree`）与深度（`chapterDepth` + `chapterSubtreeHeight` ≤ `MAX_CHAPTER_DEPTH`）校验。

各配一个 server action（`movePointAction` / `moveChapterToPositionAction`），返回 `{ok, error}`。现有 `moveChapterAction`（上移/下移按钮）、`reparentChapterAction`（提升一层按钮）、`reorderPointsAction` 保留不动。

## 测试

- repo 层新函数 vitest 单测（与源码同目录）：跨章移动后两章顺序正确、同章插入语义、防环、深度上限、workspace 隔离、非法输入报错。
- `npm test` + `npm run lint` + `npm run build` 三绿。
- 交互层：Playwright/手动验证拖拽指示线、跨章移动、章节排序与嵌套全流程。

## 明确不做（YAGNI）

- 触屏拖拽、拖拽多选、跨 subject 移动；
- 「实时让位重排」动画风格（已选指示线风格）；
- 自定义自动滚动（依赖浏览器原生拖拽滚动）。
