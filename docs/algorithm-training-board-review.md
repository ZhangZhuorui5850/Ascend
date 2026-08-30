# 算法训练工作台评测与优化方案

评测日期：2026-08-29 · 对象：`/practice/algorithms`（`AlgorithmTrainingBoardV2`）及其详情栏、弹层、导入流程 · 状态：v2 已按评审意见修订，待实施评审

| 版本 | 说明 |
| --- | --- |
| v1 | 初版评测与三工作包方案 |
| v2 | 按评审意见修订：新增统一训练写命令（WP3 首项）、URL 状态契约、排序并发协议、测试矩阵；P0-3 拆分；口径修正；WP2 拆分数据包；排期与分级调整 |

## 1. 评测方法与证据

- 代码走读：`src/app/practice/algorithms/page.tsx`、`src/components/AlgorithmTrainingBoardV2.tsx`、`src/styles/algorithm-training.module.css`、`src/app/actions/algorithms.ts`、`src/lib/repo/algorithm-training.ts`、`src/lib/repo/algorithms.ts`、`src/lib/application/algorithms/device-read-model.ts`，并对照 V1 组件 `AlgorithmTrainingBoard.tsx` 与原型 `docs/prototypes/2026-08-26-algorithm-training-redesign.html`。
- 真机走查：按 `verify` 技能隔离边界，`mktemp` 数据根 + 开发库副本（83 题、9 章、12 条计划、5 条训练记录），生产构建起独立实例，Playwright Chromium 覆盖今日训练、题库筛选、详情栏、批量操作、完成弹窗、CPP 导入、深链、键盘、1180/900/820/390 视口与暗色主题。关键截图存于 `docs/screenshots/algorithm-review-*.png`。

## 2. 总体判断

V2 把「管理面」（计划、章节、题库组织、导入）做得清爽：token 驱动的明暗主题、维度内 OR / 维度间 AND 的筛选模型、章节进度统计、带键盘与持久化的详情栏拖宽、导入的并行队列与逐行状态，都是合格以上的设计。数据层（Server Action → repo → SQLite、workspace 隔离、幂等 operationId、乐观锁 version）结构清晰。

但有三个结构性问题：

1. **做题闭环断在网页端，且现有写入口语义失真。** V1 承载的网页草稿、样例运行、正式评测、提示分级、训练结果录入（verdict/提示级别/错因/复盘）随 V1 下线后无人挂载——`AlgorithmTrainingBoard.tsx`（1481 行）已成为死代码。V2 完成弹窗中，「完成并安排复习」与「完成并退出复习计划」两个选择无条件写入 `AC + L0` 训练记录，并把 planner evidence 固定为 passed/AC（`algorithm-training.ts:187-222`）；「明天继续」仅顺延、不写记录。网页没有记录 WA/TLE、提示级别、错因、复盘的出口，与产品主张「独立作答与延迟复测」（全局页头原话）冲突，会持续污染 analytics 的证据类指标。`docs/features/algorithms.md:3` 仍宣称 V2 具备草稿与 Judge 复盘，文档与实现漂移。
2. **详情栏的开合模型错误。** 选中态用 `?? filtered[0]` 兜底（`AlgorithmTrainingBoardV2.tsx:585`），导致「关闭详情」按钮无实际效果：关闭后抽屉跳回首题。窄视口下抽屉转为 fixed 覆盖层（CSS `:249`），叠加「关不掉」，820/390px 下进入题库即被一道题全屏占据，无法看到列表。
3. **列表页状态全部易失且无 URL 表达。** 今日/题库切换是条件渲染卸载（`AlgorithmTrainingBoardV2.tsx:154-205`），筛选、搜索、排序、选中、页码在每次切换后重置；除 `?problem=` 深链外 URL 不随选择变化，刷新与分享都回不到现场。

## 3. 问题清单

分级：P0 = 阻断核心流程或损害数据可信；P1 = 高频摩擦；P2 = 打磨项。

### P0

| # | 问题 | 证据 |
| --- | --- | --- |
| P0-1 | 详情栏关不掉：关闭后跳回 `filtered[0]`，非用户所选题；窄视口下永久遮挡列表 | 走查实测：点击「词典」后关闭，抽屉回跳「487-3279」（[截图](./screenshots/algorithm-review-drawer-close-jump.png)）；代码 `AlgorithmTrainingBoardV2.tsx:585`；手机端全屏遮挡（[截图](./screenshots/algorithm-review-mobile-unclosable-drawer.png)） |
| P0-2 | 网页端训练结果记录出口缺失、完成写入语义失真：①「完成并安排复习」「完成并退出复习计划」无条件写入 `AC+L0` attempt，并把 planner evidence 固定为 passed/AC；②没有记录 WA/TLE、提示级别、错因、复盘的入口；③单独存在的 `recordAlgorithmAttemptAction` 不接 planner task（无 `taskId/expectedVersion`），直接复用会造成「训练记录已写、今日计划未完成」的分裂状态——需要统一写命令（见 WP3-1） | `algorithm-training.ts:187-222`（完成路径同时写 attempt 与 planner completion）、`:228-271`（复测路径）；`actions/algorithms.ts:202-226`（attempt-only，无 taskId）；`AlgorithmTrainingBoardV2.tsx:218-239`（完成弹窗仅三个选项）；V1 录入表单在死代码 `AlgorithmTrainingBoard.tsx:1225` |
| P0-3 | 设备撤销无入口（凭据生命周期断在网页端）：配对页承诺「设备可在算法工作台随时撤销」，但 `revokeAlgorithmDeviceAction` 仅被死代码引用，V2 设置弹窗无撤销操作 | `AlgorithmDevicePairingApproval.tsx:56`；`AlgorithmTrainingBoardV2.tsx:965-980`（设置弹窗无撤销）；`AlgorithmTrainingBoard.tsx`（死代码） |

### P1

| # | 问题 | 证据 |
| --- | --- | --- |
| P1-1 | 排序交互成本高：↑/↓ 每击一次一次 Server Action + 全页 RSC 刷新（实测 ~1.2s/次）；行首把手（`cursor: grab`）暗示拖拽但无拖拽实现，原型明确「拖动题目调整当天顺序」 | `AlgorithmTrainingBoardV2.tsx:301-307,343-345`；CSS `:51`；原型文本 |
| P1-2 | 弹层键盘/焦点不一致：`FilterDropdown` 支持 Esc，四个 `Modal`（选题、完成、导入、设置）均不响应 Esc；完成弹窗不移入焦点、无快捷键；backdrop 用 `mousedown` 关闭，拖选文本出界会误关 | 对比 `:1005-1019` 与 `:982-991`；走查实测 Esc 全部「STILL OPEN」 |
| P1-3 | 题库状态易失：切到今日再返回，筛选/搜索/排序/选中/页码全部重置（条件渲染卸载）；`?problem=` 深链后改选他题 URL 不更新，刷新回跳 | `:154-205,417`；走查实测 |
| P1-4 | 批量条可用性差：课程/阶段是内联自由文本（原型为下拉 + 「附加/替换」语义），写错即批量写坏；1440px 即溢出裁切，后半段操作不可见；选中集跨筛选残留——切到另一章节后仍显示「已选 3」且成员不可见 | `:688-704`；CSS `:129-134`；（[截图](./screenshots/algorithm-review-bulkbar-overflow.png)） |
| P1-5 | 选题弹窗弱：无状态筛选（原型有「只看未做/到期复习」）、不标记「已在当日计划」（重复加入也报「已加入 N 道题」，服务端静默去重）、超过 100 条静默截断（`:808`）且不提示总数 | `:805-818`、`:214` |
| P1-6 | 表格行键盘不可达：行元素未设置 `tabIndex`（计算值为 -1，不可聚焦），Enter 无法打开详情；全选框语义是「整个筛选结果」而非当前页，与「全选当前结果」的 aria 标签有歧义 | 走查实测（computed `tabIndex=-1`）；`:707` |
| P1-7 | 题面渲染错位：`statementMarkdown` 喂给明确不支持 Markdown 的 `RichText`（组件自述「非 Markdown 但要公式」），「## 题目描述」等原样显示；`@/lib/markdown` 管线已存在未复用 | `:783`；`RichText.tsx:1-8`；（[截图](./screenshots/algorithm-review-mobile-unclosable-drawer.png)） |
| P1-8 | 功能文档漂移：`docs/features/algorithms.md:3` 宣称 V2 具备「网页草稿、VS Code 同步和 Judge 结果复盘」，实际这些能力随 V1 死代码下线（凭据部分见 P0-3） | `docs/features/algorithms.md:3`；第 2 节问题 1 |

### P2

| # | 问题 | 证据 |
| --- | --- | --- |
| P2-1 | 纵向空间浪费：壳顶栏「算法训练」+ 页 hero（眉题/大标题/副标题）+ 板块 tab 区三层重复，约 300px 后才见内容 | （[截图](./screenshots/algorithm-review-today-empty.png)） |
| P2-2 | 表格「算法分类」列截断成 1–2 字符的残芯片；壳层「记录」FAB 悬浮球压住详情栏正文 | CSS `:150-151`；（[截图](./screenshots/algorithm-review-library-auto-drawer.png)） |
| P2-3 | 今日页缺原型中的「回到今天」快捷键位；已完成项不沉底/不折叠，条目多时干扰；hero 仅 x/y，V1 的证据指标带（独立完成/迁移等）全部丢失 | `:294-299,314`；（[截图](./screenshots/algorithm-review-today-rows.png)） |
| P2-4 | 导入收尾吞错：任一行失败仍整体关窗，仅 toast 报「新增/更新」总数，失败明细不可见；空态文案「从课程章节…加入训练」与实际按钮（打开扁平选题弹窗）不符；解析合同偏严（注释行「百炼 2804 词典」未识别，需 `题目：`/`@meta` 结构化头） | `:876-915`（`importAll` 后无条件 `onImported()`）；`:351-356`；走查实测 |
| P2-5 | RSC 负载疑似线性膨胀：dashboard 一次性下发全部题目的完整题面、参考代码与全部训练记录（列表每页只显示 20 条）；当前缺基线数据，拆分阈值以 WP2b 的实测为准 | `repo/algorithms.ts:144-229` |
| P2-6 | 移出计划、退出复习无确认/无撤销（`FeedbackProvider` 的 `confirm()`/undo 能力未被 V2 使用）；「训练结果已记录」toast 掩盖了实际写入 AC 的语义 | `:160-166,218-239`；`FeedbackProvider.tsx:18-24` |
| P2-7 | 顶栏把「添加 CPP」作为全局主按钮，与今日页主操作「添加题目」竞争 | `:145-147` |

## 4. 优化方案

四个工作包：WP1 止血、WP2a 组织与视觉、WP2b 数据读取拆分（独立包）、WP3 做题闭环回归。每包独立可发布、可按 `docs/development.md` 分级验证。

### WP1 可用性止血（2–3 天，L2）

目标：消除 P0-1 与最高频 P1，不改变信息架构。

1. **详情栏真实开合**：`selectedProblemId` 允许 `null`，删除 `?? filtered[0]` 兜底（`:585`）；清理 `:250` 的 `{selectedProblem ? null : null}` 死表达式。`<=1180px` 时抽屉带遮罩，支持 Esc 与点击遮罩关闭；进入题库不再自动展开，行点击才开。无选中时右侧给出「从左侧选择题目查看详情」占位。
2. **弹层统一走 `@base-ui/react` Dialog**（项目已在 `FeedbackProvider` 使用，能力现成）：Esc 关闭、初始焦点、焦点陷阱、`aria-labelledby`；完成弹窗增加 `1/2/3` 快捷键与默认焦点。
3. **排序乐观化 + 并发协议**（P1-1）：
   - Action 输入改为 `{ taskId, expectedVersion }[]` 整序列，服务端在单事务内原子校验全部任务版本、全部通过后才写入排序（现实现 `reorderAlgorithmPlans` 批量 `version+1` 但不校验客户端版本，`algorithm-training.ts:273-295`）；任一冲突则整体拒绝。
   - 客户端单在途提交：新变更进入待发队列并与下一批合并；响应按提交序号守卫，丢弃迟到旧响应；失败回滚到服务端返回真值并 toast。
   - 导航/卸载策略：队列非空时在导航前同步 flush 一次（`startTransition` 内），不阻塞 `pagehide`；flush 失败靠下次进入页面的服务端真值纠偏。
4. **URL 状态契约**（P1-3，先定契约再实现）：

   | 状态 | 载体 | 写入时机 |
   | --- | --- | --- |
   | `tab`、主筛选（all/todo/done/review/chapter/course/stage/folder）、`problem` | URL | `pushState`（可回退的导航语义） |
   | `q`（搜索词）、provider/tag 多选连续勾选、`sort`、`page` | URL | `replaceState`（连续/细粒度操作不刷历史；`page` 若实测回退噪音大再降级） |
   | 批量选中集 | 组件会话态 | 不上 URL；筛选变化后的不可见成员提示见 WP2a-1 |
   | 详情栏宽度、默认显示到期复习 | localStorage | 维持现状 |

   - App Router 集成方式（`router.replace/push` 与 `window.history` 的选择、与 `router.refresh()` 的交互）按 `node_modules/next/dist/docs/` 确认本项目 Next 版本行为后落地；验收必须包含 `popstate`/浏览器回退逐步恢复、刷新保现场、复制 URL 分享三项。
5. **表格行可及性**（P1-6）：行设 `tabIndex=0` + Enter/Space 打开详情；全选框区分「本页全选」与「筛选结果全选（N）」两档或改清晰文案。

验收（verify 回归）：详情栏可关、Esc 全覆盖、刷新/回退/分享保现场、排序连击只发一次请求且冲突可恢复、行键盘可达、390px 题库可操作。

### WP2a 组织与视觉升级（1.5–2 天，L2）

目标：批量操作可信、信息密度合理。不含数据读取层改动。

1. **批量条重做**（P1-4）：内联自由文本收敛为两个次级动作——「设置来源题单…」「设置课程章节…」点开小面板（下拉选择课程/阶段/章节，含原型设计的「附加到现有/替换」语义），面板复用 WP1 的 Dialog 基建；批量条常显「已选 N · 清除」；筛选变化后若选中集有不可见成员，提示「其中 M 道不在当前筛选内」。
2. **选题弹窗增强**（P1-5）：接入状态筛选（未做/已做/待复习）与课程筛选；已在目标日计划的题显示「已加入」标记且默认不重复计数；展示「共 N 题」与截断提示；服务端返回实际新增数，toast 如实报「新增 X，重复跳过 Y」。
3. **题面渲染**（P1-7）：详情栏题面改走 `@/lib/markdown` AST 渲染（保留 KaTeX），参考 CPP 加「复制」按钮。
4. **页头收敛**（P2-1）：页 hero 压缩为单行（眉题+标题合并进壳面包屑语境），目标节省 ≥120px；「添加 CPP」降为次级按钮并移至题库 tab 语境（P2-7）。
5. **今日页**（P2-3）：标题行加「回到今天」；已完成项沉底并支持折叠；空态文案与按钮对齐（「从题库选择题目加入」）；恢复证据指标带（题库/已做/独立完成/待复习，数据已在 `dashboard.metrics`）。
6. **表格列**（P2-2）：算法分类列超 2 个标签收「+N」；确认 FAB 与详情栏的层叠避让。
7. **导入收尾**（P2-4）：存在失败行时保持弹窗打开并给出「重试失败项」，toast 明细化；预览行支持编辑标题/分类（现仅题号）。

### WP2b 数据读取拆分（独立包，1–1.5 天，L2）

目标：解决 P2-5，先测基线再定拆分。

1. **基线测量（先行，决定是否拆与拆多深）**：隔离实例 + 合成数据脚本（仅插入 `algorithm_problems` 及章节/题库关联）在 83 / 200 / 500 题三档，记录：
   - `/practice/algorithms` 响应中 RSC flight 载荷字节数；
   - `getAlgorithmDashboard` 服务端查询耗时；
   - hydration 耗时（Performance API，同 harness 各取 3 次中位数）。
   基线数据回填到本文档附录，达标（如载荷或 hydration 超阈值）才进入拆分实施。
2. **列表/详情两级读取**：列表仅取摘要字段（标题、平台、题号、标签、状态、章节、复习、来源）；详情（题面、参考代码、attempts）按题懒取。详情读取采用 **Server Action**（`requireWorkspace` + 同源，沿用 `src/app/actions/` 读取约定，不新增公网 Route Handler 面）；若后续需要预取或 HTTP 缓存，再评估 Route Handler 方案。
3. 验收：页面载荷不再包含全量 `statement_markdown`；基线数据留档。

### WP3 做题闭环回归（3–5 天，L3）

> 含设备撤销（凭据生命周期，属安全边界），按 `docs/development.md` 分级验证表执行 L3：完成 L0–L2 后按对应安全手册门禁与真实 UI 验收（`verify` 技能）。

1. **统一训练写命令 `finalizeAlgorithmTrainingResult`（首项，核心验收条件）**：application 层新增命令，单事务内完成：
   - attempt 与 learning evidence 写入（operationId 幂等）；
   - planner task 的完成、保留或顺延（`taskId + expectedVersion` 乐观锁，冲突整体拒绝）；
   - `review_step` / `next_review` / `material_status` 更新；
   - 三类状态转换：**AC**（完成 + 排复习或退出复习）、**非 AC**（保留任务 open，记录错因，可按用户选择顺延）、**到期复测**（并入现 `finishDueAlgorithmReview` 语义）。
   现有 `completeAlgorithmPlan` / `continueAlgorithmPlanTomorrow` / `finishDueAlgorithmReview` 收敛为该命令的入口封装；快速完成与详细表单都调用它，从结构上消除「attempt 已写、task 未完成」的分裂状态。
2. **训练结果记录表单**（P0-2）：详情栏内记录 verdict（AC/WA/TLE/MLE/RE/CE）、用时、最高提示级别、错因分类、一句话复盘，走上述统一命令。完成弹窗保留三个快捷选项，底部加次级入口「记录非 AC 结果」。
3. **完成语义诚实化**（P2-6）：快速完成明示「将记录一次 AC」；移出计划/退出复习接 `confirm()` 或 undo。
4. **VS Code 深链回归**：详情栏对 `problemMode !== "external"` 显示「在 VS Code 打开」（`vscode://zzr.ascend-practice/open?problem=`），承接 V1 `AlgorithmTrainingBoard.tsx:1155` 已验证的协议。
5. **设置弹窗补全**（P0-3）：设备行加「撤销」（走 `revokeAlgorithmDeviceAction`，撤销后该设备令牌即失效）；补「默认显示到期复习」偏好项（原型已有设计）；Judge 状态保留。
6. **草稿/Judge 展示（可选，缓议）**：详情栏展示云端草稿更新时间与最近提交结果（读取接口已存在）；完整网页编辑器是否回归取决于 Judge 配置与 VS Code 主流程定位，独立立项，不阻塞本包。
7. **文档同步与死代码清理**（P1-8）：`docs/features/algorithms.md` 按实际能力重写网页端职责（计划/组织/证据记录/深链）；删除死代码 `AlgorithmTrainingBoard.tsx`，`ManagedAlgorithmWorkspace`、`ImportedAlgorithmWorkspace` 视第 6 项结论去留。

验收（WP3）：统一命令三类转换矩阵测试全部通过；网页记一次 WA 复盘后 planner task 保持 open 且 attempt/evidence 口径正确；快速完成路径行为与现状等价（回归）；撤销设备后该设备令牌立即失效（鉴权 401）；文档与实现一致。

## 5. 测试矩阵与验证

**统一写命令（WP3-1）最低测试集**（`npm run test`，repo/application 层）：

- 事务回滚与幂等：同一 `operationId` 重放只写一次；中途失败（如 expectedVersion 冲突）无部分写入。
- 状态矩阵：AC+排复习 / AC+退出复习 / 非 AC 保留 / 明天继续 / 到期复测，五种转换逐一断言 attempt、planner task status、`review_step`、`next_review`、`material_status` 前后状态。
- 乐观锁：`expectedVersion` 过期 → 拒绝且状态不变。
- workspace 隔离：跨 workspace 的 task/problem 不可见、不可写。
- Action 层：错误映射为 `{ ok:false, error }`；组件行为测试（冲突 toast、乐观回滚）。

**各包分级与验证**（按 `docs/development.md`）：

| 包 | 等级 | 最低验证 |
| --- | --- | --- |
| WP1 | L2 | 相关 vitest + typecheck + lint；URL 同步加 `popstate`/刷新/分享的 verify 回归 |
| WP2a | L2 | 相关 vitest + typecheck + lint；390px/1180px 视口 verify 回归 |
| WP2b | L2 | 基线测量留档 + 相关 vitest + build |
| WP3 | L3 | 上述统一命令测试集 + typecheck/lint/build + 设备撤销安全门禁 + verify 真实 UI（键盘、390px、失败恢复/断网提交） |

**实施顺序**：WP1 → WP2a → WP3；WP2b 在基线测量后可与 WP2a 并行或独立排期。WP1-4（URL 契约）是 WP2a 批量面板与 WP3 详情栏改造的地基，先行。

## 6. 附录

**走查实测数据**

- 环境：生产构建隔离实例（数据根 `mktemp` 副本：83 题 / 9 章 / 12 条计划 / 5 条训练记录），Chromium 1440×900 主视口。
- 排序：单击「下移」到网络空闲 ~1.2s；连击 N 次发 N 个 Action + N 次全页刷新。
- 完成弹窗：提交后 50ms 关闭（本地状态先行），随后 ~1s RSC 刷新生效。
- 导入：2 个 CPP 从点击导入到关窗 ~93ms，toast「导入完成：新增 2，更新 0」。
- Esc 行为：筛选下拉关闭；选题/完成/导入/设置弹窗均不关闭。
- 详情栏：「关闭详情」点击后标题由「词典」回跳「487-3279」，抽屉不消失。
- 深链：`?problem=99` 正确打开题库并定位；改选他题后 URL 保持不变。
- 键盘：表格行未设 `tabIndex`（计算值 -1）；弹窗打开后 Tab 12 次焦点未逃逸（无陷阱属巧合，完成弹窗初始焦点不在弹窗内）。
- RSC 基线：待 WP2b-1 实测后回填（83 / 200 / 500 题三档）。
- 截图索引：`docs/screenshots/algorithm-review-{today-empty,today-rows,library-auto-drawer,drawer-close-jump,bulkbar-overflow,completion-dialog,mobile-unclosable-drawer,dark-library}.png`。
