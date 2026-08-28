# Calendar 交互与动效升级交付

日期：2026-08-11

## 结论

- [COMPUTED] 日期卡片原动画未生效有两层原因：旧样式依赖 `.above/.below`，但 Base UI 1.6 实际输出 `data-side="top|bottom|left|right"`；修正方向后，Root 又在首次挂载时直接处于 `open=true`，没有稳定绘制进入起始帧。
- [COMPUTED] 日期卡片现先挂载关闭态，再在下一动画帧打开；四个实际方向均绑定显式 220ms 进入关键帧，退出继续由更短的 `data-ending-style` 动画完成，并覆盖系统与应用内 reduced motion。
- [COMPUTED] Calendar 任务写入现在以客户端任务快照承接 `useOptimistic`：草稿立即出现，成功实体以稳定 `clientKey` 原位接管，失败恢复；Server Action 通过 `after()` 在响应完成后统一失效首页、任务、日历和日期详情，避免把当前日历的整棵 RSC 更新绑定到点击响应。
- [COMPUTED] 日期卡片使用点击瞬间冻结的虚拟锚点，不再跟随 FullCalendar 重建后的日期 DOM 重新定位；卡片采用固定框架，连续新增只扩展内部滚动列表。
- [COMPUTED] 关闭、添加和手机端任务行操作均达到 44×44px；“关闭”文字按钮改为有可访问名称的单一 X 图标；待排任务的“安排”按钮增加边界、图标和 `aria-expanded`。

## 响应式与运行时证据

- [COMPUTED] 1440×1000 本地运行时：日期卡片实际方向 `data-side="top"`，计算样式挂载 `day-popover-enter-top`，持续 220ms；关闭后弹层 DOM 卸载。
- [COMPUTED] 390×844 隔离生产实例：卡片边界为 left 15 / right 375 / top 32 / bottom 422，无水平溢出；弹层内最小按钮为 44×44px。
- [COMPUTED] 应用内 reduced motion 下，弹层运行时 transition/animation 均被压到近即时并移除 transform。
- [COMPUTED] 隔离数据新增“无刷新新增验证”后，URL 与弹层保持不变，弹层内只出现一个实体；硬加载后仍能读取该任务，服务端无 `after()` / revalidation 错误。
- [COMPUTED] 隔离生产实例连续新增两项：新增前后卡片始终为 top 254 / left 771 / 360×500 / `data-side="right"`；任务数从 9 增到 11，只有内部列表 `scrollTop` 从 0 增到 382、443。
- [INFERRED] 自动化视口不能替代真实 iPhone Safari/PWA 对安全区、键盘和触摸反馈的最终验收。

## 验证

- `npm run lint`
- `npm test`：119 files / 682 tests passed
- `npm run typecheck`
- `npm run audit:motion`
- `node scripts/css-audit.mjs`
- `npm run build`
- `RESPONSIVE_AUDIT_DAY=2026-08-11 npm run responsive:audit`：9 routes × 6 viewports、移动导航复位、iPhone standalone 安全区等全部通过
- 隔离 `next start` + 浏览器：桌面弹层、退出、任务新增/持久化、390×844、应用内 reduced motion
