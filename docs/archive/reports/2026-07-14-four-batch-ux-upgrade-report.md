# 2026-07-14 四批次体验升级交付报告

对应 spec：`docs/superpowers/specs/2026-07-13-knowledge-ux-batch-design.md`

## 交付内容

### 批次一 · 快赢包
[COMPUTED] 知识点支持手动（拖拽/键盘方向键/触屏上下移）、时间、重要性三种排序视图，视图偏好按科目记忆；`knowledge_points` 新增 `created_at`（迁移 0010，存量回填为迁移时刻）。
[COMPUTED] 真题星激活为实心琥珀色；tier 改为三色 token 徽章（保留原生 select），行左色条移除。
[COMPUTED] 掌握度进度条改为可拖滑块，手动设置与复习打分自动调整并存，状态派生抽为 `deriveStatus` 共享函数。
[COMPUTED] PWA 安装入口移入设置页「应用」分组（四态：可安装/已安装/iOS 引导/不支持说明），自动弹出浮层与 14 天忽略逻辑移除。
[COMPUTED] 补齐 `docs/agent-development-guide.md`（AGENTS.md 悬空引用修复）。

### 批次二 · 乐观更新
[COMPUTED] 新增 `useOptimisticValue` hook（双触发对账，A→B→A 往返不滞留），任务勾选收编、知识点 tier/星标/掌握度全部乐观化；失败回滚并弹全局错误 toast（复用 FeedbackProvider），内联 formError 移除。
[COMPUTED] 掌握度提交串行化（在飞排队 + 最近确认值回滚），网络异常不再锁死控件。

### 批次三 · 数学公式
[COMPUTED] 引入 KaTeX（本地打包、按需懒加载，无 $ 内容零开销）；语法 `$...$` 行内、`$$...$$` 块级，`\$` 转义，货币写法（"$5，又花了 $6"）不误判。
[COMPUTED] 覆盖面：知识点标题与随笔为双态编辑（展示态渲染公式、点击回原文编辑）；错题标题/原因、复习队列、错题本、科目页、分析页、日轨迹、收纳面板只读渲染；资料库 Markdown 预览经解析器 mathInline/mathBlock 节点渲染。

### 批次四 · 章节递归树
[COMPUTED] `subject_chapters` 新增 `parent_id`（迁移 0011，存量章节保持顶层零变动）；章节可无限嵌套（上限 8 层），知识点可挂任意层级。
[COMPUTED] UI：递归渲染默认展开 3 层（折叠状态按科目记忆）、拖章节到另一章节标题变为其子级、提升一层按钮逆向移出、每章节可加子章节、聚焦模式（?focus=id 只看子树 + 面包屑返回）。
[COMPUTED] 防环与超深校验在 repo 层强制；删除章节级联全部子孙并在确认框提示数量。

## 验证
[COMPUTED] 全量 `npm test` 181/181（25 个文件）、`npm run lint` 0 错误、`npm run build` 通过（每批合并前各自验证）。
[COMPUTED] 批次一经隔离数据库（ZGCA_DATA_ROOT 临时目录）+ Playwright 端到端验收全部 PASS；批次二~四按轻量模式（用户要求提速后）以测试全绿 + 构建通过收尾，交互层留待用户真机验收。
[KNOWN] 生产实例（localhost:3000 `next start`）需重新 `npm run build` 并重启后才能生效。

## 已知边界
[KNOWN] 章节标题在科目内唯一（沿用既有表约束），跨父级同名会明确报错。
[KNOWN] 章节拖拽嵌套依赖 HTML5 DnD（桌面）；触屏可用「提升一层/上下移/子章节」按钮，但无触屏拖拽嵌套。
[KNOWN] iPadOS 13+ 桌面 UA 会落入桌面安装分支（历史行为，未变化）。
[INFERRED] 时间排序对迁移前创建的知识点区分度有限（created_at 统一为迁移时刻），新建数据起即准确。
