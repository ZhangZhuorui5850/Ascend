# 前端动效整改执行状态：R0 基线与 R2 基础层

日期：2026-08-01  
状态：R2 第一阶段（Provider、row/feedback contract、audit）已落地；R0 截图与交互矩阵已完成，录像与性能 trace 尚未完成  
关联文档：

- `docs/reports/2026-07-31-frontend-motion-and-library-assessment.md`
- `docs/superpowers/plans/2026-07-31-frontend-motion-execution-plan.md`

## 1. 本批结论

本批没有引入新的动效引擎。现有 Motion、Base UI、Next View Transition 与 FullCalendar 的所有权边界保持不变，先完成了以下基础工作：

1. 系统 `prefers-reduced-motion` 与应用内 `html[data-motion="reduce"]` 统一进入 Motion Provider。
2. 应用内设置可在运行时切换，不需要刷新；真实浏览器审计会核对 Provider 状态、URL 与 navigation entry 数量。
3. Planner 任务行和批量反馈改为 typed semantic motion contract，消费组件不再散落裸时长与 easing。
4. 新增 motion audit，以显式 legacy fingerprint 管理遗留裸时长、裸 easing 和 `transition: all`，新增违规会失败。
5. 隔离生产实例完成桌面、平板、手机、空状态、密集状态、网络失败、冲突、键盘、系统 reduce、应用 reduce 的浏览器矩阵。
6. 审计实际发现并修复一个移动 Sheet 缺陷：虚拟键盘滚动时，内部 sticky inspector header 会覆盖输入框。修复后完整矩阵通过。

本批证明的是“基础约束与可验证性已经建立”，不是“产品动效已经优秀”。任务完成/撤销、Calendar 拖放、路由连续性和知识/资料页的对象连续性仍属于 R3–R6。

## 2. 运行与隔离条件

| 项目 | 实际值 |
| --- | --- |
| Node | v24.15.0（现有 nvm 安装） |
| Next.js | 16.2.12，production build |
| 浏览器 | Playwright Chromium 1.61.1 |
| 审计地址 | `http://127.0.0.1:3123` |
| 数据 | 每轮使用独立 `/tmp/ascend-motion-verify.*` 数据根；结束后删除 |
| 登录 | 隔离 QA 账号，不使用现有业务数据 |
| 视口 | 1440×1000、900×1000、390×844，另含键盘与虚拟键盘场景 |

隔离实例在审计结束后已停止；端口 3123 已释放。生产构建重写了 `.next`，其他正在运行的生产实例需要使用本次构建重启后才能与源码一致。

## 3. 证据矩阵

证据目录：`docs/screenshots/motion/baseline-2026-08-01/`

- 19 张 viewport 截图和 19 份同名 JSON 元数据。
- Tasks：desktop、tablet、mobile、empty、dense、network error/recovery、conflict/recovery、keyboard simulated。
- Calendar：desktop、tablet、mobile、empty、dense、month/week/day/agenda。
- 每次截图禁用动画并读取截图前后页面状态；只有 theme、skin、scroll、viewport、document、topbar 与 sidebar 几何均稳定时才落盘，最多重试三次。
- appearance matrix 另外运行 light/dark × 5 skins，并分别验证系统 reduce 和应用 reduce。应用 reduce 检查运行时 `never → always → never`，且 URL、navigation entries 不变。

这些截图用于静态与状态矩阵复核，不等同于动效录像。

## 4. 发现的问题与处置

### F-01：移动 Sheet 的 sticky header 覆盖输入框

- 触发：390px 任务 Sheet，模拟 `visualViewport.height` 变化并用键盘遍历字段。
- 证据：第一次生产审计报出 `.inspectorHeader` 与三个 `INPUT` 发生几何重叠。
- 根因：外层 Drawer 已有固定标题，Sheet 内部 inspector header 再次 sticky，滚动聚焦时形成双层固定标题。
- 修复：仅在 `data-planner-surface="sheet"` 中将内部 inspector header 改为正常文档流；外层 Drawer 标题继续承担固定标题职责。
- 回归：新增源码合约测试；修复后完整响应式与键盘矩阵通过。

### F-02：截图证据可能在页面仍变化时落盘

- 触发：全量测试发现响应式审计缺少既定的稳定采样契约。
- 修复：截图前等待有限动画结束并回到页面顶部，读取前后几何状态；最多三次采样，持续漂移则明确失败。
- 结果：避免把过渡中间帧误当成稳定基线。

## 5. R2 实现摘要

### Motion Provider

- SSR 初始态固定为 `user`，避免 hydration 前短暂忽略系统 reduce。
- effect 合并系统媒体查询和应用 dataset，并监听 media change 与 `data-motion` MutationObserver。
- 任一来源要求 reduce 时使用 `always`；两者均 normal 时使用 `never`。
- 提供无布局、无语义影响的诊断 attribute，供真实浏览器审计等待 Provider 完成运行时切换。

### Semantic contracts

首批 contract 覆盖：

- `motion.row`：进入、退出、重排和 opacity-only reduce 版本；reduce 时关闭 layout/reorder 位移。
- `motion.feedback`：进入、退出和 opacity-only reduce 版本。

正常模式退出 120ms、进入 200ms，退出快于进入；reduce 模式仅保留不超过 120ms 的 opacity。Provider context 驱动 Planner task row 与 batch bar 实际选择 normal/reduced contract，reduced contract 不是只定义未消费的死代码。

### Motion audit

- 拒绝新增裸时长、裸 `cubic-bezier()` 和 `transition: all`。
- token 定义、semantic contract 定义和 `0.001ms` reduce neutralization 为明确允许项。
- 遗留规则按 path + rule + normalized declaration 指纹管理；同一旧声明复制一份也会失败。
- `summit.css` 仍在审计范围内，不是整文件排除。
- 扫描全部 `src` CSS 的 `@keyframes` 名称；当前没有重复名称，未来重复会直接失败。
- Motion consumer 采用显式边界清单；实际使用 `m.*` 的组件必须导入 semantic contracts，纯 `AnimatePresence` / `LayoutGroup` 容器单独允许。

## 6. 验证结果

| 门禁 | 结果 |
| --- | --- |
| `npm run audit:motion` | 通过；56 个 legacy fingerprints |
| `npm test` | 通过；62 files / 406 tests |
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过；Next.js production build |
| 完整 responsive audit | 通过；含 state、keyboard、appearance、system/app reduce matrices |

## 7. 尚未完成的闸门

R0 仍缺以下交付物，因此不能标记为全部完成：

1. 新建、完成、恢复、删除、撤销、冲突回滚的实际操作录像。
2. Calendar 待排任务拖入、事件拖拽/缩放、失败 revert 的录像。
3. Sidebar 同级切换、进入详情、浏览器返回的录像。
4. 每条流程的 Playwright trace 或 DevTools Performance 标记，以及点击、首个视觉响应、动画结束、服务端结果四个时间点。
5. 对 R1 静态视觉闸门的人工签字；自动矩阵不能替代人工视觉结论。

R2 仍需补齐 Base UI panel、View Transition 和 FullCalendar 三类代表路径的 reduce 最终状态/无位移验证，才能把整个 R2 标为完成；本批只完成了 Provider 与 Planner row/feedback 的第一条垂直切片。

下一执行顺序应保持：补齐 R0 录像/trace → R1 人工视觉闸门 → 补齐 R2 panel/View Transition/FullCalendar reduce 验证 → R3 Tasks 高频状态链。Canvas、Beam、Orbs 等品牌实验继续冻结。
