# Agent 开发指南（Ascend / 登峰）

## 首页与动效守门规则（2026-07 设计评审定稿）
1. **箭头规则**：首页任何可见模块必须能指出"点击去哪、一跳可达"；说不出去向的元素不上首页（品牌记号除外，且受配额限制）。
2. **仪式感预算**：`sealStamp` 与 `--motion-reward` 只授予成就时刻（登顶/清零/完成勾选），禁止出现在进门、常驻、hover 路径上。
3. **物理规律**：动效走 `summit.css` 的 `--motion-*` token（皮肤可覆盖 `--chrome-*`，禁止覆盖 `--motion-*`）；新动效禁止裸写 `cubic-bezier(` 与裸 ms 时长；只动 transform/opacity；退出永远比进入快。新动画必须同时受三处保护：`html[data-motion="reduce"]`（globals.css）、`@media (prefers-reduced-motion)`（summit.css）、view-transition 压制。
4. **第 10 天测试**：新首页元素合入前回答——"连续看它 10 天后，它是信息还是墙纸？"墙纸不合入（固定格言、>14 天的倒计时常驻主卡、值驱动的位置漂移均属墙纸）。
- 首页入场编排由 `layout.tsx` 的 pre-paint 门控脚本（`zgca-intro` localStorage 日期戳 → `html[data-intro]`）驱动，每日首次冷加载播一次；SPA 导航只走 ViewTransition。已知且接受的降级：登录 redirect 后首次到达不播编排；低端机水合晚于 1200ms 时 CountUp 静默直出终值。

## Planner 前端守门规则（2026-07 重设计定稿）
1. **响应式表面**：Tasks 在 `>=1180px` 使用三栏，`761–1179px` 使用右侧 Drawer，`<=760px` 使用底部 Sheet；Calendar 使用同一断点与弹层语义，手机主视图为议程。
2. **弹层与焦点**：Drawer、Sheet、Dialog、Popover、Collapsible 和 Toast 使用 `src/components/ui/` 的 Base UI 原语。打开时焦点进入首个主要字段，Escape 关闭后焦点归还触发器，移动表单接入 `Drawer.VirtualKeyboardProvider`。
3. **动画所有权**：Motion 管理任务行重排、进入、退出与选择背景；FullCalendar 管理事件定位、拖拽与缩放；Base UI 管理弹层状态；View Transition 管理路由。所有 Motion 位移经 `MotionProvider` 响应系统与应用内 reduce 设置。
4. **样式边界**：Planner 皮肤位于 `src/styles/planner/*.module.css`，共享颜色与动效读取 `tokens.css`。`globals.css` 与 `summit.css` 保存跨页面基础规则，Planner 模块类保持单一来源。
5. **写入恢复**：客户端先提交乐观状态，再在原始事件上下文启动 Server Action。`runPlannerMutation()` 统一处理传输失败；版本冲突恢复实体、选择、排序与输入，FullCalendar 的失败改期调用 `revert()`，删除撤销调用 restore Action。
6. **可操作性**：主要触控目标保持至少 44×44px；任务列表支持上下键移动、空格完成、Enter 打开；拖拽与缩放同时提供日期时间字段路径；状态消息使用 `aria-live`，图标按钮提供稳定可访问名称。
7. **验证证据**：Planner 改动覆盖 1440px、900px、390px、Light、Dark、系统 reduced motion、应用内 reduce、键盘焦点、水平溢出、运行时错误、workspace 隔离与生产构建。稳定审计入口为 `npm run responsive:audit`、`npm run smoke` 和 verify skill。

## 架构速览
- Next.js 16 App Router + React 19，源码在 `src/`；无 tailwind，样式为 `src/app/globals.css` + `src/styles/tokens.css` CSS 变量（多套 `data-skin` 皮肤，颜色一律走 token）。
- 数据库 better-sqlite3（同步、无 ORM）：建表 `src/lib/db.ts`（服务全新库），版本化迁移 `src/lib/migrations.ts`（服务存量库，带 checksum，只能追加不能改旧迁移）。查询集中在 `src/lib/repo/*.ts` 手写 prepared statements，多租户按 `workspace_id` 隔离。
- 写路径统一：客户端组件 → `src/app/actions/*`（Server Action，`requireWorkspace()` 鉴权 → repo）。**结构性写操作一律用 `revalidatePath`（列出所有展示该数据的路由），禁止用 `refresh()`**：[COMPUTED] 2026-07-17 隔离实例验证，Next 16.2.10 在软导航（SPA 点链接）到达的页面上会丢弃 `refresh()` 的 RSC 回流——服务端照常返回 36KB flight 且 `x-action-revalidated`，客户端不应用，表现为"乐观行闪现→消失，硬刷新才出现"；同一 action 改用 `revalidatePath` 后硬加载/软导航/往返路由缓存三种场景回流全部正常。任务类写操作用 `actions/planner.ts` 的 `revalidateTaskViews()`（day/首页/日历三视图一起失效）。高频字段切换（如任务完成状态）由页面级客户端状态即时更新，Action 写库并顺带 revalidate 相关路径，防止 30s 路由缓存内切页看到旧数据。action 一律返回 `{ok, error?}`，不抛错给客户端。
- **调用带 `refresh()` 的 action 必须从事件上下文直接 `startTransition(async () => await xxxAction(...))`，且 action 调用前不得有其他 await**：在 `setTimeout` 里启动 transition、或 transition 内先 await 延迟再调 action（嵌套 startTransition 也救不回），在整页硬加载的页面上会静默丢弃 RSC 回流（库写成功但 UI 不更新）。要做"退场动画后再消失"，让动画与请求并行，不要延迟提交。列表乐观插入用 React `useOptimistic`（先例 `DayTasks.tsx`，客户端排序须镜像 repo 的 ORDER BY，见 `day-tasks-sort.ts`）；单值字段用 `useOptimisticValue`。
  - [COMPUTED] 2026-07-17 隔离生产实例边界矩阵：整页硬加载后，事件内直接 `startTransition`、事件内直接 async 调用、事件内发起 Action 后接 `.then`、`confirm()` Promise 回调内调用四种形状都应用了 RSC 回流，刷新后数据库结果一致。后 3 种使用 DayNotes 临时关闭显式 `router.refresh()` 的诊断构建验证。`setTimeout` 启动与 transition 内 Action 前置 `await` 两种形状稳定丢回流。工程写法统一采用第一种，获得清晰且稳定的事件边界。**注意：该矩阵只覆盖整页硬加载场景；软导航场景下 `refresh()` 无论何种事件形状都丢回流（见上），必须用 `revalidatePath`。**

## 测试与验证
- `npm test`（vitest，测试与源码同目录 `*.test.ts`，repo 测试用 `createTestDb()` 内存库跑全量建表+迁移）；`npm run lint`；`npm run build`。三者全绿才算完成。
- 用户生产实例是本机 `next start`（真实数据），改码后需 build + 重启才生效。

## 文档
- 设计 spec：`docs/superpowers/specs/`；实施计划：`docs/superpowers/plans/`；交付报告：`docs/reports/`（报告用 [COMPUTED]/[INFERRED]/[KNOWN] 声明标签标注结论来源）。
