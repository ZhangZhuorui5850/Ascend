# 2026-07-18 质量批次交付报告 + 大进化方案

标签口径：[COMPUTED] 本机实际运行验证；[INFERRED] 由代码/文档推断；[KNOWN] 公认事实。

## 一、本批次交付（七项）

1. **复习引擎正确性核对**：专家评审（2026-07-11）P0 三处硬伤——队列截断 tier 排序、遗忘后间隔重建、新知识点入管线——[COMPUTED] 逐条对照当前代码与 git 历史核实，均已在 e69139c（2026-07-16）修复且各有判别力回归测试（`reviews.test.ts:55/82/218`），本批次零改动。顺带发现一处开放问题：`applyMistakeOutcome` 拉 D+1 复习但不重置 `interval_step`（见下"待决问题"）。
2. **FileExplorer 拆分 + 移动端救活**：759 行拆为 `src/components/file-explorer/` 9 模块 + 2 新测试文件；窄屏详情从 `display:none` 改为底部 sheet（`useNarrowScreen` + `.driveDetailSheet`，与 CSS 1080px 断点同口径）；iPad 触屏（821–1080px）行工具改 `pointer: coarse` 常显；iOS（含 iPadOS 桌面模式，`detect-ios.ts` UA 矩阵测试覆盖）不再渲染只显首页的 PDF iframe，主路径改新标签打开/下载。
3. **per-workspace 数据导出**：`src/lib/repo/export.ts`（全量聚合，跨 workspace 零泄漏有测试）+ 无依赖最小 ZIP writer `src/lib/zip.ts`（stored + CRC32，python zipfile 交叉校验）+ `GET /api/export`（鉴权同 api/assets）+ 设置页「数据」分组下载卡片。`data.json` schema `ascend.workspace-export` v1 + 人可读 `summary.md` + `assets/` 全部附件。
4. **SubjectWorkbench/MindMapView 拆分**：1289 行 → `subject-workbench/` 8 模块；812 行 → `mind-map/` 5 模块；原路径 re-export 兼容；顺带断开两者类型循环依赖。
5. **静默 catch 清理**：全仓核查后结论——大多数 catch 已有用户反馈（notify/内联报错），真缺的是异常对象被丢弃。补 12 处 `console.error` + 5 处 `console.warn` + 3 处故意吞的解释注释；探针/降级类（api/health、session-cookies 等）核实为设计内，保留。
6. **backfillAssetBlobs 增量化**：启动路径不再全量读文件重哈希——LEFT JOIN blobs 只选未回填行，已迁移库冷启动零文件 IO。[COMPUTED] 新回归测试：二次启动时篡改遗留源文件，asset/blob 行不变。
7. **工程化**：`npm run typecheck`（tsc --noEmit，顺带修掉 10 个存量类型错误：tsconfig target ES2017→ES2022 + markdown.test 收窄）；Prettier 入 devDependencies + 配置（**刻意不做全量 reformat**：多处测试直接断言组件源码原文，见 .prettierignore 注释）；CI 加 typecheck 与 `npm audit --omit=dev --audit-level=high` 步骤。

## 二、验证

- [COMPUTED] `npm test` 276/276（37 文件，较批次前 +19 用例）；`lint`、`typecheck`、`build` 全绿。
- [COMPUTED] 隔离实例（独立数据目录 + :3123）Playwright 端到端 14/14：登录、设置页导出卡片、/api/export 产出合法 zip（python testzip 通过、附件进包）、资料库上传/宽屏侧栏/390px 底部 sheet 开合、科目工作台列表与导图两视图、日页任务增删勾选与硬刷新持久化、日历渲染、全程零未捕获页面错误。
- 生产实例注意：本批次跑过 `next build`，`.next` 已是新产物；生产 `next start` 需重启才吃到新代码。

## 三、重新审核：评审 38 项路线图现状（2026-07-18 口径）

- P0 全清（复习引擎三件 + CI）。
- P1：#9 触屏移动/#14 iOS PDF 本批次落地；剩 #10 PWA 离线深化、#11 `router.refresh()` 收敛（仍 21 处，拆分后未增）。
- P2：#17 拆分本批次落地；剩缩略图管道、命令面板接全局搜索等。
- P3：#27 导出本批次落地；剩时区去硬编码（9 处 Asia/Shanghai）、生产 CSP、考试倒计时、晚间战报等。
- 新增待决问题：[INFERRED] 错题重做通过只拉 D+1 检查、不重置知识点 `interval_step`，通过后恢复原长间隔——是否该视为"遗忘证据"降阶，属产品取舍，建议尽快拍板（一行改动 + 测试）。

## 四、大进化方案（按杠杆排序）

### 方案 A：AI 学习引擎（最大进化，强烈推荐）
把 LLM 接进核心学习闭环，数据结构已全部就位：
- **资料 → 知识树**：上传 PDF/笔记后自动抽取章节与知识点草案，人工确认入库（knowledge_points 已有 prompt/answer 字段）。
- **错题教练**：错题录入后生成讲解、揪出考点关联知识点、出 2-3 道变式题（mistakes 表已关联 knowledge_point）。
- **回忆卡自动生成**：按知识点批量生成检索问题与答案骨架，复习队列直接消费。
- **晚间战报/周复盘生成**：聚合当日 tasks/reviews/mistakes 写成一段有观点的复盘（评审 P3#26 的高配版）。
- 落地形态：server-only 模块 + Anthropic SDK，API key 存 settings，按钮触发不自动跑，费用可控。[INFERRED] repo 层与 HTTP 解耦，无需动架构。

### 方案 B：复习引擎升级 FSRS（学习效果的硬升级）
现引擎是固定间隔阶梯（interval_step）。[KNOWN] FSRS 按记忆状态（难度/稳定性/可提取性）逐卡建模，同等复习量下保留率显著更优。review_events 已积累完整评分历史，可离线拟合个人参数；迁移路径：新旧引擎并行灰度 → 对比 next_review 差异 → 切换。风险点在参数冷启动，用默认参数起步即可。

### 方案 C：全局搜索（FTS5）+ 命令面板打通
SQLite 内建 FTS5，零新依赖：为 tasks/notes/knowledge_points/mistakes/assets 建虚表 + 触发器同步，命令面板（已存在）接一个 `searchAll(scope, query)`，⌘K 直达任意实体。这是把"记了很多东西"变成"随手找得到"的关键一跳，也是方案 A 的检索底座（RAG 可后续叠加）。

### 方案 D：/api/v1 + 长期 token（多端起点）
repo 层已与 HTTP 解耦，镜像一层带 token 鉴权的 REST 是平移非重写。解锁：真移动端（Capacitor 壳或第三方客户端）、脚本自动化、甚至给 Claude 建 MCP server 直接操作学习数据。与方案 A/C 正交，可后置。

### 方案 E：学习分析 2.0（模考 → 预测）
mock_exams（含 breakdown）+ mastery + review 历史 → 按科目薄弱点雷达、分数趋势外推、考前 N 天冲刺计划自动生成（与考试倒计时/P3#24 合并做）。数据在库里躺着，缺的只是模型与呈现。

### 建议节奏
C（1 天级，立刻有感）→ A 第一刀选"错题教练"（数据最全、单点见效）→ B（一周级，学习效果复利）→ E → D。中间穿插清剩余小项（refresh() 收敛、时区、CSP）。
