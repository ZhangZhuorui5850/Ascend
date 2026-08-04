# Ascend / 登峰 — 前端重设计说明（v2「山径」）

> 日期：2026-08-01 ｜ 范围：仅前端，不改后端契约 / repo / schema ｜ 状态：提案 + 可运行预览
> 预览入口：`/redesign`（独立挂载，不替换现有页面；决定后再切换）

---

## 0. 结论速览

- 新设计代号 **「山径 / Trail」**：以"从大本营到顶峰的路径"为信息架构隐喻，替代现在的"卡片陈列"。
- **单实体策略**：新 UI 只认 `PlannerTask` / `CalendarEvent`；legacy `DayTask` 在 UI 层彻底退场（详见 §4）。
- 动效全部走 `--motion-*` token 与 `@/lib/motion/contracts` 语义契约；仪式感（sealStamp / `--motion-reward`）只授予成就时刻。
- 预览版为**纯前端高保真原型**（mock 数据，不接后端），符合"先不用接，决定后再替换"的要求。

---

## 1. 设计原则（对现有设计的继承与推翻）

### 继承（这些是对的，不动）
- [KNOWN] cinnabar/ink 朱砂手帐气质、多套 `data-skin` 皮肤、token 化的颜色/动效体系——成熟度很高，推翻是浪费。
- [KNOWN] 首页"现在做什么"单焦点定位与五态机（due→task→summit→active→blank）——产品灵魂，保留。
- [KNOWN] 箭头规则、第 10 天测试、仪式感预算——继续作为守门规则执行。

### 推翻（我明确反对现状的地方）
1. **首页信息层级是"平铺陈列"，不是"路径"。** 现状：Masthead → NowCard → Ledger → Capacity → 双列卡，5 个层级抢注意力。v2 改为**一条垂直山径**：NOW（现在做什么）→ NEXT（接下来的三步）→ RIDGE（本周山脊线 = 容量）→ PEAKS（科目山峰）。用户视线自上而下就是时间流向。
2. **Ledger 数字墙是墙纸候选人。** [INFERRED] "待处理/任务/专注/连续"四个数字并列，第 3 天开始就是装饰。v2 把账本压缩成 NOW 卡的一行内联证据（"复习 12 · 错题 3 · 今日已清 2"），省下的纵向空间给 NEXT 队列。
3. **侧栏导航按"模块"分组，不是按"行动"。** v2 侧栏改为三段：**攀登**（今天/日历/待办）、**积累**（科目/错题/资料）、**检视**（分析/模考/设置），顺序即使用频率。[INFERRED]
4. **卡片无处不在。** v2 只在"需要与背景区分的可操作聚合"用卡；列表、账本、时间线全部去卡化，用留白 + 发丝线分区。

## 2. 信息架构调整

```
/                  首页 = 山径仪表盘（NOW → NEXT → RIDGE → PEAKS）
/day/[date]        每日工作台 = 单栏时间线（议程为主，复习队列嵌入时间流）
/calendar          日历（保持 FullCalendar，仅换肤与弹层语义）
/tasks             待办 = 三栏/Drawer/Sheet（响应式表面不变）
/subjects          科目体系（本期不动，仅预留入口样式）
```

- 首页每个可见元素都有一跳去向（箭头规则）：NOW→`/day/today`，NEXT 每行→`/day/today#day-tasks`，RIDGE→`/analytics`，PEAKS→`/subjects/[code]`，倒计时 chip→`/mock-exams`。
- 手机主视图：**议程**（agenda-first），与 Planner 守门规则一致。

## 3. 动效策略（全部合规）

| 场景 | 手段 | 契约 |
|---|---|---|
| 路由切换 | View Transition（`ascend-page` 既有 token） | 不加新 keyframes |
| 列表行进入/退出/重排 | Motion `m.*` + `@/lib/motion/contracts` 的 `motion.row` | 只动 transform/opacity，退出 120ms < 进入 200ms |
| 状态反馈（toast 内联、勾选） | `motion.feedback` | 同上 |
| 成就时刻（登顶/清零/完成勾选） | `sealStamp` + `--motion-reward`，**全页唯一** | 守门规则第 2 条 |
| hover / focus | CSS `--motion-fast` + `--motion-ease` | 无位移仪式感 |
| 三层保护 | `html[data-motion="reduce"]`、`prefers-reduced-motion`、View Transition 压制 | 新增 CSS 模块同样遵守 |

新组件凡 `import "motion/react"` 一律：`MotionProvider` 包裹 + `useMotionReduced()` 分支 + 注册进 `scripts/motion-audit.mjs` 的 `KNOWN_PLANNER_MOTION_CONSUMERS`（该集合即"已知 Motion 消费方"白名单机制）。

## 4. 决策表态：两套任务系统

**新 UI 只以 `PlannerTask` / `CalendarEvent` 为核心。** 理由 [KNOWN]：`day_tasks` 表经触发器已只读，继续混用必然数据分裂。

平滑过渡方案（替换期）：
1. `/day/[date]` 新 UI 的任务区数据源切到 `listPlannerTasksRange`（v2 repo 只读），不再渲染 legacy `listTasks` 结果。
2. legacy `addTaskAction`/`toggleTaskAction` 等调用点（日历拖拽、CreateTrainingTaskButton）**保留不动**，由后端既有触发器/双写逻辑消化；前端新入口一律走 `createPlannerTaskAction` / `updatePlannerTaskAction`。
3. 旧 `/day` 页保留直到新页全量切换；不做数据迁移 UI（repo 层不在本次范围）。

## 5. 决策表态：推进顺序

按建议执行：**首页 → 每日工作台 → 待办 → 日历 → 科目体系**。本次交付覆盖前三个的高保真原型（首页完整 + 每日工作台主结构 + 待办三栏响应式骨架），日历与科目给出入口样式与规范，不展开。

## 6. 预览版技术说明（本次落地）

- 路由：`/redesign`（首页）、`/redesign/day`（每日工作台）、`/redesign/tasks`（待办）。
- 独立 `layout.tsx` 自带新壳（TrailShell），不污染 AppShell；**未接后端**（mock 数据内联），登录态无关。
- 组件：`src/components/redesign/*`；样式：`src/styles/redesign/*.module.css`，颜色/动效 100% 走 `tokens.css` / `summit.css` 变量，零硬编码色值。
- 弹层（待办详情）使用 `src/components/ui/` 的 `PlannerDrawer` 原语；响应式断点遵守 ≥1180 三栏 / 761–1179 Drawer / ≤760 Sheet。
- 新增 token：无。现有 token 体系已覆盖，避免散布。

## 7. 未覆盖与风险

- [KNOWN] 日历、科目工作台本期仅给规范，未出高保真。
- [KNOWN] `npm run smoke` / `npm run responsive:audit` 需带登录态的运行实例，本次未跑（预览页无鉴权，可人工 1440/900/390 三档目检）。
- [INFERRED] Node 22 环境下 `next build` 与 `engines: >=24` 的落差需关注（本机验证结果见交付回复）。
- 替换期需要一次"新旧首页 AB 目检"再切 `page.tsx`。
