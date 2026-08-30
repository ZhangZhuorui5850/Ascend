# 前端体验优化记录（2026-08-31）

对象：全站 Web 前端（除单独立项的算法做题闭环）。方法：四个角色的子 agent 深度走读（UX 信息架构 / 交互与状态 / 视觉设计系统 / 架构与性能）+ 隔离实例 Playwright 实测（26 张截图、Cmd+K、侧栏高亮、移动端 390px、控制台错误收集）。审计证据与截图存于会话记录；本文记录落地结果与遗留项。

## 已落地（按提交）

| 提交 | 内容 |
| --- | --- |
| `5dcab40` | 删除 V1 算法板死代码三件套（2574 行：`AlgorithmTrainingBoard` / `ManagedAlgorithmWorkspace` / `ImportedAlgorithmWorkspace`） |
| `ff0c409` | 全局 z-index 阶梯 token（`--z-*`）与遮罩 token（`--scrim*`）；13 处硬编码遮罩、algorithm 模态 1000 级等全部收编；删除死代码 toast 样式与重复 driveSheet 块；motion 审计归绿（`npm run audit:motion` 通过） |
| `472ace8` | 算法板：详情栏真正可关（删 `?? filtered[0]` 兜底 + 空态占位 + 窄屏遮罩/Esc）；四个手写 Modal 迁移 base-ui Dialog（Esc/焦点陷阱/滚动锁/焦点归还）；`mutate()` 补 try/catch/finally；表格行键盘可达；移出计划二次确认；完成弹窗明示记录 AC；设备撤销入口（P0-3）；FAB 与详情栏避让 |
| `32319f7` | Cmd/Ctrl+K 归还命令面板（记录改 N 键）；移动端搜索入口收成图标按钮；日历/错题本独立高亮；术语三处对齐（任务/学习/错题本/收集箱/管理后台）；PlannerShell 单页头；Today 推荐语「因为：」与溢出链接 `?view=today`；算法插件未启用给引导页而非裸 404；补 `global-error.tsx`、应用壳内 `not-found.tsx`、tasks/review/extensions/practice 路由骨架、错误页「返回上一页」 |
| `e9ffe6c` | 暗色对比修复（accent 上白字 → `--accent-ink`）；1179/1180 断点 off-by-one；触控热区（勾选 ~41px、危险图标 ~41px、行操作 32px+热区）；算法页 hero 单行；主栏顶部留白 28→20；日任务删除提供撤销 |
| `fdfc45d` | 算法板 URL 状态契约（tab/filter/problem 走 push，q/sort/page 走 replace，刷新/回退/分享保现场）；排序乐观化（本地立即生效 + 单飞队列 + 失败恢复服务端真值）；批量条重做（课程下拉 + 阶段建议、操作后清选、不可见成员提示、可换行）；选题弹窗（状态筛选、已在计划标记、总数与截断提示）；题面走共享 Markdown 管线（新 `MarkdownContent`，KaTeX 按需）；今日页证据指标带、回到今天、已完成沉底折叠 |
| `a12aa1c` | FullCalendar 六包与 CapturePanel（555 行）改为 `next/dynamic` 懒加载 |
| `ba5615f` 等 | 测试：题库包跨文件夹题号断言去随机抖动；Sidebar/PlannerShell/PlannerTasks 源文本断言随新契约更新 |

## 验证

- `npm run typecheck`、`npm run lint`、`npm test`（133 文件 / 745 用例）全绿。
- `npm run audit:motion` 通过（此前 14 条违规）；`npm run css:audit` 0 error。
- `npm run build` 成功；生产实例浏览器回归见 `docs/screenshots/frontend-opt-*.png`。

## 遗留项（未实施，按性价比排序）

1. **统一训练写命令（评审 WP3-1，L3）**：网页记录 WA/TLE、提示级别、错因、复盘的表单仍缺；完成弹窗已诚实标注「记一次 AC」，但语义失真的根治需要 application 层统一命令 + 乐观锁。设备撤销已落地，其余属安全边界，需按分级验证单独执行。
2. **算法板 RSC 载荷拆分（WP2b）**：dashboard 仍全量下发题面与训练记录；需先做 83/200/500 题基线测量再拆列表/详情两级读取。
3. **根布局瘦身**：`getCaptureHierarchy`（全量科目树）仍随每个 RSC 载荷下发；改为面板打开时惰性拉取。
4. **日历/任务增量取数**：日历仍一次下发前后 370 天；任务页 SQL 拉 2000 行再 JS 过滤；应按可视窗口增量 + SQL 下推。
5. **失效粒度迁移 `revalidateTag`**：4 处 `("/", "layout")` 整树失效与 capture 的 10 连发仍在；客户端 12 处冗余 `router.refresh()` 可删。
6. **字阶/间距全面 token 化**：字号 token 采用率 ~4%、间距 ~3.5%（审计数据）；本次只做了 hero 压缩与触控热区，全量替换应随视觉走查分批进行。
7. **日历视图状态进 URL**（视图/语境/选中日），与任务页 `?view=` 对齐。
8. **空态统一**：mock-exams 空态无动作等零散项；印章式 `EmptyState` 未全站推广。
9. **dev 模式 API 404 异象**：本机 dev（Turbopack）下 `/api/metrics/web-vitals`、`/api/planner/events` 返回 404（生产正常），已确认与本次改动无关，建议后续单独排查 Next 16 dev 路由。
