# 首页重设计交付报告（2026-07-17）

## 背景与流程
用户认为首页"写得不太好"，要求参考 sceneai.art 与 Haven 提示词做深度调研后重设计，目标是**提升转化（5 秒内开始最重要的事）而不仅是好看**。流程：2 个调研 Agent（代码库勘查 + 外部设计研究）→ 7 Agent 设计讨论会（转化/品牌/动效三方案 → 交叉批判 → 主设计师综合定稿）→ 按定稿实施 → 隔离实例验收。定稿全文见讨论会产物；核心裁决 14 条（hero 压缩至 ~216px、时钟砍除、weakPoints/dailyMinutes 进首页、入场编排每日一次、count-up 仅一处、共享元素过渡不做等）。

## 改动清单
- `src/app/page.tsx`：重构为 漏斗结构——①HomeMasthead（BASE CAMP 眉题 + 学习目标 + 考试倒计时 chips）②NowCard 四态墨面主卡（due/task/summit/blank，`data-home-state` 上根）③HomeLedger 账本行（待处理/任务/专注/连续/7 天迷你柱+周环比）④任务卡（已排时任务按时刻前置）⑤科目卡 + 弱点 TOP3。新增 `getLearningAnalytics` 调用（无新查询）。
- `src/styles/summit.css`：`--motion-*` 动效 token（旧 `--summit-ease` 改别名）；`--chrome-*` 墨面 token 五件套 + 四皮肤转调；NowCard/Masthead/Ledger/WeakList 全套样式；入场编排（7 拍 stagger，`html[data-intro="play"]` 门控，670ms 收束）；移动端折叠线规则；reduce 保护。
- `src/app/globals.css`：旧首页样式层（homeFocus 巨卡/pulseMetric/homeContext/时钟）删除；`data-motion="reduce"` 块补 `animation-delay: 0s !important`（全站修复）；旧 hero sealStamp 规则删除。
- `src/app/layout.tsx`：themeScript 追加 4 行——`zgca-intro` localStorage 日期戳门控（每日首次冷加载播编排，1200ms 后摘除；SPA 导航与 ViewTransition 结构性互斥）。
- `src/components/CountUp.tsx`（新增，全站唯一 count-up）：SSR 直出终值，水合后仅编排窗口内回卷，reduce/0 值直出。
- `docs/agent-development-guide.md`：新增"首页与动效守门规则"（箭头规则/仪式感预算/物理规律/第 10 天测试）。
- `.claude/skills/verify/SKILL.md`：补 3 个验收坑（CJK 字体、种子数据时区、SW 干扰）。

## 验证
- [COMPUTED] `npm test` 31 文件 238 用例全过；`npm run lint` 0 错误；`npm run build` 成功。
- [COMPUTED] 入场编排实测（Playwright 采样 opacity）：t=48ms 全隐 → h1 170ms 升起 → 账本 292ms 接力 → 658ms 全部收束；`data-intro` 1269ms 翻转 done；SPA 返回不重播。
- [COMPUTED] 隔离实例截图验收：due（明/暗/移动端）、task、summit、blank 四态 + brutal/cloud/terminal 皮肤抽查，截图在会话 scratchpad `shots/`。移动端折叠线满足"主 CTA 完整可见 + 首条真实任务露头"。
- [KNOWN] 已知且接受的降级（写入 agent guide）：登录 redirect 后首次到达不播编排；低端机水合晚于 1200ms 时 CountUp 静默直出。
- [INFERRED] aurora 皮肤墨面转调未截图验证（与 cloud 同机制，风险低）。

## 遗留（P2，明确不做）
TodayTimeline（等 scheduled_start 填充率数据）、estMin 用 study_sessions 校准、NowCard→day 共享元素过渡、riseIn 全局收编进 intro 门控。
