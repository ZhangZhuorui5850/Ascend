# 朱砂手帐（Cinnabar Ledger）整站重设计实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 ZGCA 学习工作台的整套视觉从「靛紫 SaaS 风」重构为「朱砂手帐」——宣纸底 + 稿纸格纹理 + 墨色正文 + 宋体标题 + 朱砂红唯一强调色，亮暗双主题（暗色 =「夜灯下的手帐」暖褐墨面）。

**Architecture:** 视觉全部集中在 `src/styles/tokens.css`（语义令牌）+ `src/app/globals.css`（4266 行，按节分层，后节覆盖前节）。策略：① 整体重写 tokens.css；② 就地改造 globals.css 中写死的装饰规则（渐变、阴影、圆角、白色硬编码）；③ 在文件末尾追加「21. 朱砂手帐识别层」承载宋体标题、纸纹、印章、朱笔勾选等标志性元素（与现有 13–20 节的覆盖式分层一致）；④ 少量 JSX 改动（品牌印章字、登录 hero 文案结构）。类名与组件结构全部保留，行为（响应式/无障碍/双主题/reduced-motion）等价。

**Tech Stack:** Next.js 16 App Router + 纯 CSS（无 Tailwind）。字体走系统栈（项目要求网络无关，不引入 next/font 下载）：宋体栈 `"Noto Serif SC","Source Han Serif SC","Songti SC","SimSun",serif`，数字展示 Georgia。

---

## 设计令牌规格（唯一事实来源）

### 亮色（宣纸）
| 令牌 | 值 | 说明 |
|---|---|---|
| --bg | #f2eee3 | 宣纸底（body 上叠稿纸格纹理） |
| --bg-subtle | #ece7d8 | |
| --surface | #faf7ef | 卡片纸 |
| --surface-soft | #f3efe2 | |
| --surface-raised | #fdfbf4 | |
| --surface-inverse | #2a2318 | 墨 |
| --line / --line-strong | #ddd5c1 / #c8bda2 | 发丝线 |
| --ink / --ink-soft | #262015 / #4a4232 | |
| --muted / --quiet | #85795f / #a89c80 | |
| --accent / --accent-hover | #b13a20 / #96301a | 朱砂 |
| --accent-ink | #fdf6ec | |
| --accent-soft / --accent-line | #f3e2d6 / #e2c3ae | |
| --danger / soft | #b02818 / #f7ded7 | 与朱砂同族（朱笔圈错） |
| --warn / soft | #9a6716 / #f3e8cd | 赭石 |
| --ok / soft | #47714f / #e3ecdf | 松绿 |
| --info / soft | #39608a / #e1e9f1 | 黛蓝 |
| --radius-xs/sm/base/lg/xl | 2/3/4/6/8px | 方角纸感 |
| --shadow-xs | 0 1px 0 rgba(92,76,50,.09) | |
| --shadow | 2px 2px 0 rgba(122,102,70,.13) | 纸片错位影 |
| --shadow-lg | 4px 4px 0 rgba(122,102,70,.13), 0 18px 44px rgba(92,76,50,.14) | |
| --font-serif | "Noto Serif SC","Source Han Serif SC","Songti SC","SimSun",serif | 标题/品牌/序号 |
| --font-num | Georgia,"Times New Roman",var(--font-serif) | 大号展示数字 |
| --paper-grid | color-mix(in srgb, var(--line) 42%, transparent) | 稿纸格线色 |

### 暗色（夜灯手帐，暖褐非冷灰）
--bg #1c1710 / --bg-subtle #211b13 / --surface #251f16 / --surface-soft #2b241a / --surface-raised #2d261c / --surface-inverse #f0e7d3 / --line #3b3222 / --line-strong #50442e / --ink #ece2cc / --ink-soft #cec19f / --muted #9b8d6d / --quiet #6e6249 / --accent #de6743 / --accent-hover #e97f5e / --accent-ink #201409 / --accent-soft #40251a / --accent-line #5f3524 / --danger #e0604a soft #3c2019 / --warn #d3a04b soft #372b15 / --ok #85ac8b soft #232f23 / --info #82a6c8 soft #1d2936 / shadow 用黑色系。

---

### Task 1: 重写 `src/styles/tokens.css`
- [ ] 按上表完整重写三段（:root / prefers dark / data-theme 双通道），新增 `--font-serif`、`--font-num`、`--paper-grid`，保留全部既有令牌名（组件依赖）。
- [ ] `rg "5856d6|8b87ff|6b68e8|1d2f6f|25234f" src` 确认旧靛紫只剩 globals.css 内几处硬编码（Task 2-4 处理）。

### Task 2: globals.css 基础层与原语就地改造
- [ ] body 叠加稿纸格：`repeating-linear-gradient` 双向 28px 网格，颜色 `var(--paper-grid)`。
- [ ] `.brandMark`（§13）：去掉靛紫渐变与彩色投影 → 朱砂印章（背景 var(--accent)、radius 3px、serif、`box-shadow: 0 1px 0 var(--accent-hover)`、微旋转 -3deg）。
- [ ] `.primaryButton`（§16）：去 `box-shadow: 0 6px 14px accent…` 与 translateY，硬朗纸按钮（1px 深边 + 2px 位移影，active 时下压）。
- [ ] `.taskLine.done .taskCheck` `color:#fff` → var(--accent-ink)；勾选背景由 --ok 改为 --accent（朱笔勾）。
- [ ] `.noteCard textarea:focus-visible` 的 `rgba(255,255,255,.55)` → color-mix 白纸变量。
- [ ] `.dangerButton` `color:#fff` → var(--accent-ink)。

### Task 3: globals.css 外壳改造
- [ ] `.sidebar`（§13）：去 backdrop blur，实体纸面 + 右侧发丝线；active 导航 = 左侧 3px 朱砂竖线 + serif 加粗（去圆角胶囊感）。
- [ ] `.topbar`：`border-bottom` 改为双线（1px line + 3px double 效果用 border-image 或伪元素），保留 sticky。
- [ ] `.topbarAvatar`：圆形 → 方形印章（radius 3px、朱砂底、serif）。
- [ ] `.commandTrigger`、`.topbarIconButton`：方角、纸面。
- [ ] `.mobileNav`、`.mobileMoreSheet`、`.commandPalette`、toast/dialog：radius 收敛到 var(--radius-lg) 以内，阴影换纸片影。

### Task 4: globals.css 业务区改造
- [ ] `.homeFocus`（§14）：去靛紫 radial 渐变与圆环装饰 → 纸面 + 右上角大号「今」印章（伪元素，2px 朱砂描边、serif、rotate(4deg)），标题用 serif。
- [ ] `.loginHero`（§19）：`#171923→#25234f` 渐变与白圈 → 深墨底（--surface-inverse）+ 稿纸格 + 朱砂印章元素；`.loginHero p` 白色 rgba → 纸色 color-mix。
- [ ] `.analyticsMetricGrid .primaryMetric`（§20）：靛紫混合渐变 → 墨面（surface-inverse 纯色）+ 朱砂数字。
- [ ] `.dayMainCol .reviewQueue`、`.quickLog`、`.dayTasks`：accent-soft 混合底保留（令牌已变朱砂淡）。
- [ ] FullCalendar（§10）：令牌自动生效，仅核对 `--fc-today-bg-color`。

### Task 5: 追加「21. 朱砂手帐识别层」（globals.css 末尾）
- [ ] 标题字体：`h1,h2,h3,.brand strong,.topbarTitle strong,.sectionTitle h2,.dayNav h1,.homeFocusMain h1,.loginHero h2,.loginCard h1` → `font-family: var(--font-serif)`，正文保持 sans。
- [ ] `.sectionTitle h2::before`：6px 朱砂方点（印泥点），间距 8px。
- [ ] `.eyebrow,.sectionKicker`：颜色 → 朱砂，letter-spacing 加宽到 .22em。
- [ ] 大数字（`.homeClock strong,.pulseMetric>strong,.countdownCard strong,.metricCard strong,.homeStat strong,.dayStats strong,.priorityScore b,.subjectHeaderStats strong`）→ `font-family: var(--font-num)`。
- [ ] `.pageHeader h1` 下加双线（border-bottom: 3px double var(--line-strong)）呼应 masthead。
- [ ] `.taskLine.done .taskTitle` 删除线颜色 → 朱砂（text-decoration-color）。
- [ ] `.listRow` 分隔线 → 1px dashed var(--line)（账本虚线）。
- [ ] 印章工具类 `.sealStamp`（登录/主页复用）。
- [ ] 暗色微调：夜灯下纸纹透明度降低（`[data-theme="dark"]` 与 media 双通道下调 --paper-grid 浓度已由 color-mix 自动完成，核对即可）。

### Task 6: JSX 调整
- [ ] `Sidebar.tsx`：brandMark 字符 "Z" → 役割字（user「知」/ admin「管」），brand small 文案不变。
- [ ] `TopBar.tsx`：avatar 保持首字；无需改。
- [ ] `login/page.tsx`：hero 内加 `<span className="sealStamp">知</span>` 风格印章（用 brandMark 即可，CSS 已改）；文案微调为手帐语气（可选，保守起见仅样式）。

### Task 7: 验证
- [ ] `npm run build`（或 `npx tsc --noEmit` + `npm run lint`）通过。
- [ ] `npm run dev` 启动，Playwright/浏览器截图：`/login`、`/`（需登录态则用测试账号）、亮/暗双主题、820px 窄屏。
- [ ] `rg "5856d6|8b87ff|6b68e8|1d2f6f|25234f|Inter\"" src` 无残留。
- [ ] 提交：`style: rebuild visual identity as cinnabar ledger theme`。

## Self-Review
- 覆盖：令牌、基础、外壳、业务区、识别层、JSX、验证 — 对应设计稿全部标志性元素（宣纸/格纹/宋体/朱砂/印章/双线/朱笔勾选/暗色夜灯）。
- 无占位符；所有色值在上方令牌表中唯一定义。
- 类名不变 ⇒ 25 个组件与 21 页无需逐一改 JSX（除 Task 6 两处）。
