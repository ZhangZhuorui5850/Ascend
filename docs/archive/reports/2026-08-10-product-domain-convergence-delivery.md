# Ascend 产品与领域模型收敛交付报告

日期：2026-08-10

交付分支：`codex/ascend-product-convergence`

目标分支：`main`

变更规模：37 个实现提交，135 个文件，15,742 行新增、2,579 行删除（报告提交前统计）

## 交付结论

- [COMPUTED] 本轮改造完成了任务、学习证据、Today、Capture、Planner、Onboarding、导航与响应式体验的系统性收敛。
- [COMPUTED] `planner_tasks` 已成为用户可达任务流程的 canonical source；Home、Day、Calendar、Search、Stats 和 Agent 读取使用统一身份与状态。
- [COMPUTED] 学习结果使用 append-only `learning_evidence` 保存；任务完成、手工学习、算法训练和正式评测统一经过 application command，并具备 workspace scope、事务和幂等保护。
- [COMPUTED] 生产构建、673 项自动化测试、核心烟测、多路由响应式审计、迁移审计和备份恢复均通过。
- [KNOWN] 验收在隔离数据目录中执行，未修改真实数据库或用户已有备份。

## 背景与根因

改造前系统同时存在 `day_tasks` 和 `planner_tasks` 两个可写任务事实源。兼容逻辑只执行 `day_tasks → planner_tasks` 单向镜像，导致以下风险：

- 相同数值 ID 可能指向不同实体，Calendar 等旧路径存在误改任务的风险。
- Planner 创建的任务无法稳定出现在 Home、Day、Search 和 Stats。
- 部分完成、批量更新、算法训练与评测只写 legacy study session，绕过学习证据与复习计划。
- 知识点删除、任务永久清理与 append-only evidence 的引用生命周期不一致。
- 首页、日视图、任务、日历和记录入口分散，用户需要理解内部模块边界才能完成一次学习闭环。

本轮以“单一任务事实源、不可变学习证据、application command 统一写入、Today 单一行动入口”为约束进行重构。现状审计和冻结后的目标设计分别见：

- `docs/archive/reports/2026-08-10-repository-reality-audit.md`
- `docs/archive/specs/2026-08-10-product-convergence-design.md`

## 数据与领域架构

### Canonical Task

- [COMPUTED] 建立任务 application command，统一创建、更新、完成、重新打开、改状态、删除、恢复、重排期、组织关系与批量操作。
- [COMPUTED] Calendar 使用 string task ID 与 version，不再依赖 SQLite `rowid` 兼容身份。
- [COMPUTED] Home、Day、Search 与 Stats 读取 canonical Planner 投影，跨页面契约测试覆盖 ID 碰撞和 Planner-only 任务。
- [COMPUTED] legacy task action 从用户可达入口移除；遗留 Agent alias 标记为 deprecated，并路由到 canonical command。
- [COMPUTED] 批量状态变化在事务前完成版本预检；完成与重新打开逐项调用 evidence-aware command。
- [COMPUTED] 永久清理会保留带 evidence 的任务及受层级依赖阻塞的祖先，并向 UI 返回实际删除与保留数量。

### Learning Evidence

- [COMPUTED] 新增 `learning_task_links` 与 `learning_evidence`，所有 API 显式接收 workspace scope。
- [COMPUTED] evidence 使用稳定 idempotency key；重复请求返回同一证据，payload 冲突会 fail loud。
- [COMPUTED] 更正通过追加新 evidence 并写入旧证据的 `corrected_by` 完成；void 操作幂等且不修改证据正文。
- [COMPUTED] 普通学习记录、任务完成、算法手工 attempt 和正式评测统一写入 evidence，同时保留必要的 legacy projection。
- [COMPUTED] 已存在的学习记录、任务关联和 canonical completed task 通过追加迁移补齐 evidence。
- [COMPUTED] 知识点删除在仍被 link/evidence 引用时拒绝操作并返回引用信息，避免静默丢失历史。

### 事务、幂等与恢复

- [COMPUTED] Onboarding 在一个事务中保存科目、目标、设置与第一条任务；重试使用稳定 mutation ID。
- [COMPUTED] Day Journal 使用持久化单调 revision 防止 pagehide beacon 与在途请求乱序覆盖；离页使用 `sendBeacon`，失败回退 keepalive fetch。
- [COMPUTED] Workspace export 升级并支持 canonical learning link/evidence round-trip，旧版导出缺失字段按兼容默认值恢复。
- [COMPUTED] 迁移与备份验证脚本覆盖 canonical task/evidence 完整性、跨 workspace 引用、SQLite integrity 和恢复烟测。

## 产品体验改造

### Today

- [COMPUTED] `/` 收敛为唯一 Today 执行页，只呈现 `NOW`、`TODAY`、`REVIEW`、`CAPTURE` 四个决策区。
- [COMPUTED] deterministic next-action 按已开始任务、到期复习、逾期任务、今日安排和未排时任务选择下一行动，并返回可解释原因。
- [COMPUTED] 任务与日历事件进入同一时间线；事件没有伪任务复选框，未排时任务单独分组。
- [COMPUTED] Today 支持乐观完成与 Toast 撤销，并通过 version 防止过期写入覆盖。
- [COMPUTED] `/review` 作为稳定复习入口；`/day/[date]` 保留补录、日记与日终复盘职责。

### Universal Capture

- [COMPUTED] 原文件抽屉替换为统一 Capture，支持任务、学习、错题、笔记、资料五种意图。
- [COMPUTED] 文本解析器确定性识别日期、时间、时长与建议类型；客户端预览与服务端写入使用同一解析器。
- [COMPUTED] 支持拖拽、粘贴、文件选择、可选科目/章节/知识点关联与幂等提交。
- [COMPUTED] 桌面使用 Drawer，移动端使用 Sheet；`Ctrl/Cmd + K` 和移动端“记录”打开同一入口。

### Planner、导航与 Onboarding

- [COMPUTED] `/tasks` 与 `/calendar` 使用共享 `PlannerShell`、统一标题与任务/日历视图切换。
- [COMPUTED] 桌面主导航收敛为“今天、计划、学习、复习、资料”五项，其余功能进入“更多”。
- [COMPUTED] Onboarding 收敛为“学习、目标、第一件事”三步；完成后创建一条今日到期、预计 25 分钟的 canonical task，并在 Today NOW 展示。
- [COMPUTED] 建立统一字号 token；Today、Capture、Onboarding 使用作用域 CSS Module，减少全局样式继续扩散。
- [COMPUTED] Planner 桌面内联详情打开时隐藏全局悬浮记录按钮，消除对表单控件的遮挡；快捷键入口保持可用。

## 主要提交分组

### 审计与设计

- `d56f54e` `docs(audit): establish convergence baseline`
- `33e0695` `docs(design): freeze product and domain convergence`

### 数据、任务与学习写路径

- `6e7ee0d` → `76fa49b`：迁移、canonical task commands、Calendar 身份、学习证据、Agent/Day/Search/Stats/Export 收敛。
- `59b57f5` → `1b5ab07`：批量与清理边界、算法训练与正式评测 evidence、组织关系 command。

### 产品流程与界面

- `7f88f80`、`7538651`：Today read model 与首页执行流。
- `d19f9f3`、`235f191`、`08e1183`：统一 Capture 解析、写入与 UI。
- `4059d52`、`8c20387`、`1118f62`：导航视觉、三步 Onboarding 与共享 Planner Shell。
- `0cbccfe`：烟测与响应式审计对齐最终产品契约。

## 验证证据

- [COMPUTED] `npm test`：117 个测试文件、673 项测试全部通过。
- [COMPUTED] `npm run lint`：通过。
- [COMPUTED] `npm run typecheck`：通过。
- [COMPUTED] `npm run build`：Next.js 16.2.12 production build 通过。
- [COMPUTED] `npm run smoke`：登录、三步引导、Today 四区、完成/撤销、统一 Capture、Calendar Inbox 排期、Planner Shell、命令对话框、Review、Assets、移动端 Sheet 全部通过。
- [COMPUTED] `npm run responsive:audit`：9 条路由 × 6 种视口通过；PWA 缓存边界、安全区、主题、键盘 Capture、Planner desktop/tablet/mobile 均通过。
- [COMPUTED] `npm run verify:migration`：workspace scope、关系完整性和 canonical task/evidence 回填检查通过，issues 为空。
- [COMPUTED] `npm run verify:planner-migration`：映射重复与 projection drift 均为 0，issues/warnings 为空。
- [COMPUTED] `npm run verify:backup`：SQLite integrity 为 `ok`，文件引用检查和 restore smoke 均通过。
- [COMPUTED] `git diff --check` 与 `git fsck --no-dangling`：通过。

## 兼容性与剩余风险

- [KNOWN] `day_tasks` 和 `study_sessions` 仍作为迁移兼容数据存在，但不再作为用户可达流程的主要事实源。
- [KNOWN] 部署时必须先备份，再构建并重启应用，让新增迁移在真实数据库上执行；本次工作没有直接迁移真实实例。
- [KNOWN] 正式 Web Push、外部判题网关与多设备长期运行仍依赖部署环境凭据和实际运行窗口，本轮没有声称完成线上投递验证。
- [KNOWN] 本报告记录的是分支交付状态；合并前仍应由维护者检查 PR 文件范围、迁移顺序和部署窗口。

## 部署与回滚建议

1. 在真实实例执行一次数据库与 uploads 完整备份，并运行 `npm run verify:backup`。
2. 拉取并构建目标提交，运行 `npm test`、`npm run typecheck` 和 `npm run build`。
3. 在维护窗口重启应用，使 migration runner 顺序应用 `0030`–`0032` 等新增迁移。
4. 运行 `npm run verify:migration` 与 `npm run verify:planner-migration`，确认 issues 为空。
5. 对登录、Today、Capture、任务完成/撤销、Calendar 排期与 Review 做一次真实环境烟测。
6. 若验证失败，停止新实例并从部署前快照恢复数据库和 uploads；不要只回滚代码而保留不匹配的数据状态。
