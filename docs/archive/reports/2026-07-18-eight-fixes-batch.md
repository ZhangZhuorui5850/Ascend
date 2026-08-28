# 2026-07-18 · 八项修复与功能批次

一次性处理的用户反馈：任务消失 bug、页面切换流畅度、日历弹窗任务管理、功能板块开关、任务行重构、章节排序控件、资料库批量操作栏、移动端布局。

## 1. 「加入计划后任务闪现→消失」根因与修复

- [COMPUTED] 隔离实例（`next start` 生产构建 + Playwright）复现：**硬加载页面上添加正常；凡软导航（SPA 点链接）到达的页面，server action `refresh()` 的 RSC 回流被客户端丢弃**——网络层证实服务端两种场景都返回完整 flight（~36KB、`x-action-revalidated: 2`），客户端不应用。逐一排除了 `staleTimes`、`experimental.viewTransition`、AppShell `<ViewTransition>` 包裹、Link `prefetch`/`transitionTypes`（全部关闭后依旧复现），定位为 Next 16.2.10 客户端路由器行为。
- 修复：`actions/planner.ts` 全部 `refresh()` → `revalidatePath`，新增 `revalidateTaskViews()`（day/首页/日历三视图统一失效）。`toggleTaskAction` 也补了 revalidate，防止 30s 路由缓存内切页看到旧完成态。
- [COMPUTED] 修复后硬加载/软导航/路由缓存往返三场景添加任务均立即持续显示，删除/勾选落库一致。
- `docs/agent-development-guide.md` 已更新：结构性写操作禁用 `refresh()`，边界矩阵补注"只覆盖硬加载场景"。

## 2. 交互流畅度

- `next.config.ts` 恢复 `staleTimes`（诊断期间临时摘除），写操作靠精确 revalidatePath 失效，读导航吃缓存。
- 补齐 `mock-exams/loading.tsx` 骨架（唯一缺失的路由段）。
- 资料库移动对话框补 Escape / 点击遮罩关闭。

## 3. 日历日弹窗任务管理（CalendarView）

- 弹窗内新增：快速添加输入框（`useOptimistic` 乐观插入草稿行）、每行删除按钮（危险色 hover）、原有勾选完成保留。弹窗按天 `key` 重置。
- [COMPUTED] E2E：弹窗内加/勾/删全部生效且落库，月历事件同步出现。

## 4. 功能板块开关与排序

- 新 `app_settings` key `module_prefs`（`normalizeModulePrefs` 容错：剔未知、去重、补缺省）。核心板块（总览/今日执行/学习日历）固定；知识体系/错题回炉/模考冲刺/资料库/学习分析可开关+上下排序。
- 链路：`repo/settings.ts` → `saveModulePrefsAction`（`revalidatePath("/", "layout")`，导航在根 layout）→ layout 读取传 AppShell → Sidebar/MobileNav/CommandPalette 经 `applyModulePrefs` 过滤排序。设置页新增「功能板块」分组（开关 + 上下移，行内即存即生效）。
- 首页联动：模考冲刺关闭时倒计时 chip/焦点卡入口退化为 `/settings#study`；错题回炉关闭时隐藏"去回炉"。直接输 URL 仍可访问（隐藏而非锁定）。
- [COMPUTED] E2E：关/开、排序即时反映到侧栏且硬刷新持久。

## 5. 任务行重构（DayTasks）

- 行 = 勾选框｜标题+条件 chips｜单一「详细设置」按钮（Settings2 图标）｜删除。科目/优先级/开始时间/预计分钟/备注全部收进详情面板。
- **只展示标记过的信息**：P2（默认优先级）、30 分钟（默认预计）、无科目、无备注一律不渲染 chip；设置后才出现（P1·关键 / 时间·时长 / 科目码 / 备注标记）。
- 移除了 globals.css 中旧版 `.dayTasks .taskLine` 移动端 grid-template-areas 残留规则（正是移动端排版错乱的根因——新 DOM 多了 `.taskLineMain` 层，旧规则把它挤进 44px 列）。

## 6. 章节排序控件（SubjectWorkbench）

- 删除章节行左侧拖拽把手；右侧工具组新增「降级为上一章节的子章节」（CornerDownRight，与"提升一层"对偶），带深度校验（`depth + subtreeHeightOf ≤ MAX_CHAPTER_DEPTH`）。上/下移、提升、聚焦保留。知识点拖拽不受影响。

## 7. 资料库批量操作栏（FileExplorer）

- 由文档流内条形栏改为**固定底部居中悬浮操作条**（`position: fixed`，z-index 60，出现时列表不再下移）；按钮重做：主操作「移动到…」accent 底、删除危险色、取消选择改图标钮。移动端抬升至底部导航之上。

## 8. 移动端布局

- 根因见第 5 节（残留 CSS）。另修 `.settingsTabs` 加第 7 个 tab 后 390px 溢出（补 flex-wrap）。
- [COMPUTED] 390×844 下 /day、首页、资料库、日历、设置横向溢出均为 0px。

## 验证

- `npm test` 257/257、`npm run lint`、`npm run build` 全绿（源码断言测试已同步新约束：revalidatePath 必须在、refresh 导入禁止、旧移动端 grid hack 禁止回归、弹窗必须含 composer/删除）。
- Playwright 端到端 32 项断言全过（隔离实例、隔离数据、CJK 截图存档于会话 scratchpad）。
