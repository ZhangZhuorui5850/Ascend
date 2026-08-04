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
| `/kinetic/login` | `/login` | Kinetic 安全入口，保留原请求目的地 |
| `/kinetic/change-password` | `/change-password` | 首次登录/重置后的强制改密 |
| `/kinetic/onboarding` | `/onboarding` | 目标、科目、节奏与复习容量校准 |

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

## 2026-08-04 实现与验收记录

### 当前交付状态

- 上表 16 条 Kinetic 路由均已接入真实 workspace 数据或真实鉴权流程，不再使用 `/concept/kinetic` 的 mock。
- `/kinetic` 未登录、强制改密、未完成首次设置、主动退出四条路径都留在 Kinetic 命名空间；旧登录与首次设置路由仍然可用。
- 首页、每日工作台、任务、日历、学科、错题、模考、资料、分析、算法、扩展与设置均为原生 Kinetic 表面。
- 设置页保留账户、Agent、学习目标、板块、扩展、显示、设备、数据导出与 PWA 安装能力。Kinetic 色彩是信息语法，因此不继承旧版装饰换肤；字号、行距、对比度与减弱动效仍可调。
- 管理员控制台与邀请激活属于运维/开户表面，本轮不伪装成学习工作台；它们继续使用旧视觉，不影响普通学习者闭环。

### 已执行证据

| 检查 | 结果 |
| --- | --- |
| Kinetic 产品路由矩阵 | 14 个登录后路由 × 1440/1024/390，共 42/42 通过，无旧命名空间跳转或横向溢出 |
| Kinetic 登录矩阵 | 1440/1024/390 共 3/3 通过；退出后进入 `/kinetic/login`，重新登录回 `/kinetic` |
| 真实写入 | 扩展停用/恢复、每周投入保存/恢复、任务、日记录、日历事件、学科、模考与算法问题均在隔离 workspace 验证 |
| 键盘与搜索 | `⌘K` 打开、`Esc` 关闭，真实 workspace 搜索返回 Adam 学习记录 |
| 减弱动效 | 应用内开关使 MotionProvider 进入 `always`，CSS 动画/过渡压缩为 `1e-06s` |
| 仓库测试 | Node 24 下 95 个文件、574 个测试全部通过 |
| 静态与构建 | `typecheck`、`lint`、`next build`、`css-audit`、`git diff --check` 通过 |
| 备份验真 | 假环境 `backup-verified` 通过；数据库/附件哈希、DB 引用、隔离恢复和篡改拒绝已覆盖 |
| 旧版并行 | `/`、`/tasks`、`/settings` 仍可访问且移动端无横向溢出 |

`audit:motion` 仍会报告 `/concept/*` 与 `/proposals/*` 的既有实验性裸时长和重复 keyframe；正式 `/kinetic/*` 没有新增该类违规。实验主题按用户要求保留，未把它们伪装成正式产品债务已清零。

### 尚需人工确认

- 真机 iPhone Safari 与“添加到主屏幕”后的安全区、软键盘、旋转和返回手势。Chromium/应用内浏览器结果不能替代这项结论。
- 用户主观审核：信息密度、长时间使用疲劳、动效节奏与是否愿意将 Kinetic 设为默认入口。

### 默认入口切换与回滚

1. 当前继续用 `/kinetic` 审核，根路由 `/` 不重定向。
2. 用户明确确认后，单独提交默认入口切换；先切入口，不删除旧代码。
3. 至少完成一轮真实数据使用与真机 PWA 检查。出现问题时直接恢复旧根路由，Kinetic 数据无需回滚，因为两套界面共享同一 repo/actions。
4. 只有用户再次明确确认，才在另一笔独立提交中删除旧学习页面与已无引用的兼容样式；管理员/邀请表面另行决策。
