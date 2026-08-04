# Kinetic Field 全产品并行升级规格

## 目标

把 `/concept/kinetic` 验证过的空间、动量、轨道和回声语言升级为 Ascend 的正式产品前端。升级期间保留所有旧路由和旧组件；只有当新路由的功能矩阵、真实数据写入、响应式、无障碍和隔离验收全部通过后，才进入旧前端删除决策。

## 核心边界

1. 新产品入口统一位于 `/kinetic/*`，登录、workspace 和 onboarding 规则与正式页面一致。
2. `/`、`/day/*`、`/tasks`、`/calendar` 等旧路由不删除、不重定向、不改默认入口。
3. 数据层、Server Actions 与 REST API 继续作为事实来源；新 UI 不维护第二份业务状态。
4. 新任务界面以 Planner v2 为核心。旧页面需要的 legacy 兼容继续存在，但不成为新设计的模型。
5. Server Component 负责鉴权和数据读取；交互岛负责动效、乐观状态和浏览器能力。
6. Kinetic 样式只存在于 CSS Modules 和 Kinetic 根节点变量内，不修改 `tokens.css`，不污染旧界面。

## 路由矩阵

| 新路由 | 旧路由 | 目标状态 |
| --- | --- | --- |
| `/kinetic` | `/` | 原生 Kinetic 首页，真实 Planner/复习/统计/知识数据 |
| `/kinetic/day/[date]` | `/day/[date]` | 原生每日工作台 |
| `/kinetic/tasks` | `/tasks` | 原生 Planner v2 任务空间 |
| `/kinetic/calendar` | `/calendar` | 原生日历与时间轨道 |
| `/kinetic/subjects` | `/subjects` | 学科轨道总览 |
| `/kinetic/subjects/[code]` | `/subjects/[code]` | 知识星图与科目工作台 |
| `/kinetic/mistakes` | `/mistakes` | 复习回声与错题回炉 |
| `/kinetic/mock-exams` | `/mock-exams` | 模考诊断与复测轨迹 |
| `/kinetic/assets` | `/assets` | 资料星库 |
| `/kinetic/analytics` | `/analytics` | 结果信号与学习动量 |
| `/kinetic/practice/algorithms` | `/practice/algorithms` | 算法运行场 |
| `/kinetic/extensions` | `/extensions` | 扩展轨道 |
| `/kinetic/settings` | `/settings` | 系统与账户设置 |

## 设计系统

- **核心隐喻**：学习不是堆积任务，而是在知识场中持续制造动量。
- **结构语法**：轨道表示长期关系，脉冲表示当前动作，回声表示延迟反馈。
- **色彩职责**：紫色是当前主轨，橙色是到期/风险，酸绿是完成与继续，薄荷绿是稳定状态。
- **运动职责**：入场建立层级，shared layout 保持对象连续，轨道运动表达关系，奖励只用于完成与突破。
- **响应式**：桌面为空间场，平板降低并行列，手机改写成纵向任务流和底部轨道导航。

## 迁移阶段

1. 正式 Shell、导航、命令搜索、捕获入口和全路由骨架。
2. 高频闭环：首页、每日工作台、任务、日历。
3. 学习闭环：科目、知识点、复习、错题、模考。
4. 资料、分析、算法插件、设置与扩展。
5. 新旧功能对照、可访问性、响应式/PWA、隔离写入和生产构建。
6. 用户确认后单独制定默认入口切换与旧前端删除计划。

## 验收证据

- 每个路由都用真实 workspace 数据渲染，不使用概念页 mock。
- 所有写操作仍走既有 Action/REST，并覆盖版本冲突、失败恢复和路径失效。
- 桌面 1440、临界桌面 1180/900、平板 768、手机 390/320 与横屏无水平溢出。
- 系统/应用 reduced motion、键盘路径、焦点归还、44px 触控目标通过。
- `lint`、`typecheck`、相关 Vitest、CSS audit、build、responsive audit 与隔离登录/写入验证完成。
- 真实 iPhone Safari/PWA 检查单独记录，不用 Chromium 注入值代替真机结论。

## 删除旧前端的前置条件

只有在路由矩阵全部达到“原生 Kinetic”且验收证据齐全后，才提出删除旧前端。删除必须是独立提交，保留可回滚点，并由用户明确确认。
