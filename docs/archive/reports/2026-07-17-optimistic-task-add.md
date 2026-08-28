# 任务添加乐观更新 + 进出场动效交付报告（含 P1 收尾，2026-07-17）

## 背景与流程

用户反馈"/day 页添加任务时稍有停顿才出现"，并希望参考前沿前端技术为全站规划动画（"任务像一股流从下往上推上去"）。流程：2 个调研 Agent（现有动效体系摸底 + 全站逐版块交互清点）+ 本仓 Next.js 16 文档核对 → 设计文档 → 实施批次一（P0）→ 隔离实例三轮验收。

- 设计文档（含全站动画机会点清单、批次二/三/四规划、不做清单）：`docs/superpowers/specs/2026-07-17-optimistic-add-and-motion-batch-design.md`
- 停顿根因（[KNOWN]）：添加无乐观更新，需等 Server Action → SQLite → `refresh()` 整页 RSC 重渲染 → 流回客户端。勾选快是因为已有 `completionOverrides` 本地乐观。

## 改动清单

- `src/components/day-tasks-sort.ts`（新增）：`compareDayTasks`/`sortDayTasks` 纯函数，镜像 `listTasks` 的 ORDER BY（已排时刻→时刻→优先级→sort_order→id），保证乐观插入位置与服务端回流一致、对账零位移。
- `src/components/DayTasks.tsx`：
  - 添加走 React 19 `useOptimistic` + 事件上下文 `startTransition`：回车瞬间输入框清空、草稿行（负数临时 id，`pending`）立即上浮入列；服务端回流后原位换真实行；失败草稿行自动消失 + 全局错误 toast，输入框回填便于重试。`adoptPlan`（昨晚计划转任务）同路。
  - [COMPUTED] P1 收尾：独立 `draftOrderRef` 为连续草稿分配严格递增顺序；`clientKey → task.id` 映射让草稿与真实任务复用同一 DOM；本地 `enteringClientKeys` 与 `exitingTasks` 把视觉生命周期从请求生命周期分离。
  - 删除：行挂 `data-leaving` 退场动画，与请求并行提交；`animationDone × actionDone` 双状态清理快照，快响应完整退场，慢响应动画结束后本地隐藏，失败恢复原行。
  - 标题、科目、详情字段与两处顺延统一从事件回调直接进入 `startTransition`。
  - 草稿行禁用勾选/编辑/删除/展开；进度条与空态改用含乐观行的 `displayTasks` 口径。
- `src/app/actions/planner.ts`：`addTaskAction` 透传 repo 已返回的 `DayTask`，供客户端在同一 mutation 闭包中建立稳定 key 映射。
- `src/app/globals.css`：`taskRiseIn`（`--motion-quick` + `--motion-ease-enter`，translateY 10px 上浮）/ `taskFallOut`（`--motion-fast` + `--motion-ease-exit`，退出快于进入）keyframes，只动 transform/opacity；`.taskCheck`/`.taskTitle` 勾选态补 `--motion-fast` 过渡。三重减弱保护由既有通用规则自动覆盖。
- `src/components/DayTasks.test.ts`：新增"optimistic task insertion"源码断言组；`src/components/day-tasks-sort.test.ts`（新增）4 用例。
- `docs/agent-development-guide.md` 写路径新增一条硬约束（见下）；`.claude/skills/verify/SKILL.md` 补 2 个验收坑（route 拦截不可靠、npx 包装 PID）。

## 关键发现（[COMPUTED]，后续批次必读）

**带 `refresh()` 的 Action 采用事件回调直接进入 transition、Action 前无其他 await 的统一形状。** 三种"先播完退场动画再提交"的形状在整页硬加载页面上静默丢回流（库已写、UI 未更新、行残留）：①`setTimeout` 内调 Action；②`setTimeout` 内启动 transition；③transition 内先 await 延迟再调 Action（嵌套 transition 同样丢回流）。最终方案让退场动画与请求并行。

[COMPUTED] P1 边界补测：整页硬加载后，事件内直接 transition、事件内直接 async 调用、事件内发起 Action 后接 `.then`、`confirm()` Promise 回调内调用都应用了 RSC 回流。后 3 种通过 DayNotes 临时关闭显式 `router.refresh()` 的诊断构建验证，诊断代码已还原。工程实现统一使用第一种形状。

## 验证

- [COMPUTED] `npm test` 32 文件 246 用例全过；`npm run lint` 0 错误；`npm run build` 成功。
- [COMPUTED] 隔离实例（独立数据目录 + 端口 3123）Playwright 验收矩阵全过：
  - CDP 0/50/300ms 三档延迟：添加立即出现 `taskRiseIn`（200ms）且输入清空；草稿到真实任务的 DOM 探针持续存在，证明 key 稳定；删除在 60ms 时仍挂载并完成 120ms `taskFallOut` 后移除。
  - 连续添加三条：即时顺序、输入顺序、三次服务端对账后的顺序完全一致。
  - 断网失败：输入回填、错误 toast 出现、乐观行在 transition 收束后移除。
  - `data-motion="reduce"`（近零时长）与系统 `prefers-reduced-motion`（`animation: none`）两条路径均完成增删；超时兜底覆盖无 `animationend` 的系统级路径。
  - aurora / brutal / cloud / terminal 四皮肤下增删完成，结束态 opacity 1、transform none。
- [KNOWN] 生产实例是本机 `next start`：需 `npm run build` + 重启才生效（本次验证已重写 `.next`，若生产实例正在跑请重启）。

## 后续状态

批次二、批次三、存量合规修复及批次四降级决策已完成，验证记录见 `docs/reports/2026-07-17-motion-batches-2-4.md`。二期可选实验保留行级 `<ViewTransition>` 兄弟行 morph 补位候选，验收标准为无临时行/真实行交换闪动。
