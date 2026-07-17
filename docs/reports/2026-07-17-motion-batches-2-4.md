# 全站动效批次二至四交付报告（2026-07-17）

## 交付范围

- [COMPUTED] CapturePanel 附件、SettingsForm 倒计时采用本地 entering/leaving presence；新增项获得唯一 client key，删除在动画完成后清理数据和预览 URL。
- [COMPUTED] DayNotes 使用 React `useOptimistic` 即时插入，Action 透传新随笔建立稳定 key；确认删除后请求与退场并行，快响应由本地快照承接。
- [COMPUTED] ReviewQueue 按在线成功、离线入队、失败、撤销四态实施。在线 Action 的 `revalidatePath` 会立即移除 canonical 卡片，因此评分开始时保存本地快照，依次完成 550ms 成就章和 120ms 普通退场。离线卡片保留盖章并锁定重复评分。
- [COMPUTED] MistakeReattempt 采用成功快照退场；失败保留卡片和错误信息，刷新只发生在成功退场后。
- [COMPUTED] CommandPalette 与 confirm 弹窗接入 token 化 `captureMenuIn`；segmented、知识点 tabs、日历/资料视图与科目切换补状态色过渡；树和资料拖放指示补 opacity/transform 反馈。
- [COMPUTED] dayModule、SubjectWorkbench 设置、Onboarding 精确设置在 `@supports (interpolate-size: allow-keywords)` 内接入 disclosure 高度渐进增强。
- [COMPUTED] 全站数值进度的内联 `width` 已迁为 `transform: scaleX()`；页面 ViewTransition 接入 `--motion-page` / `--motion-ease-enter` / `--motion-fast` / `--motion-ease-exit`，AppShell 死钩子已移除。
- [COMPUTED] 系统和站内减弱动效统一为近零时长；presence hook 读取 computed animation duration，并提供事件兜底。

## 验证

- [COMPUTED] `npm test`：33 个文件、255 项通过；`npm run lint`：通过；`npm run build`：Next.js 16.2.10 生产构建通过。
- [COMPUTED] 隔离生产实例 Playwright：附件、倒计时、随笔均捕获 `taskRiseIn` 与 leaving 状态，删除后完成 DOM 清理；随笔草稿到真实卡片保持同一 DOM。
- [COMPUTED] ReviewQueue 捕获“会”章、完整退场与撤销恢复；50ms 逐帧采样证明 canonical 被服务端移除后快照持续存在，并按 550ms → 120ms 顺序结束。
- [COMPUTED] ReviewQueue 离线验收捕获“熟”章，900ms 后卡片仍保留且无 leaving；重复评分后待同步数量维持 1，恢复联网后自动同步并退场。
- [COMPUTED] MistakeReattempt 成功退场后移除；进度条从 `scaleX(0.5)` 过渡到 `scaleX(1)`。
- [COMPUTED] Chromium 支持 disclosure 渐进增强，`::details-content` 的 transition property 为 `block-size, content-visibility, opacity`，开合功能通过。
- [COMPUTED] aurora / brutal / cloud / terminal 四皮肤的命令面板均运行 `captureMenuIn`；系统减弱动效下持续时间为 0.001ms，列表增删功能通过。
- [COMPUTED] 首页首次进入捕获 `data-intro="play"` 与 `summit-track-grow`；同日再次进入无 intro 标记且进度保持静态。

## 设计降级与边界

- [KNOWN] CommandPalette 过滤行、首页/analytics 常驻柱图、MindMap 缩放、NowCard 共享元素过渡继续采用设计文档的降级决策。
- [KNOWN] SubjectWorkbench 与 FileExplorer 的树结构增删属于独立 dnd 项目，本批仅处理拖放指示反馈。
- [KNOWN] 行级 React ViewTransition 属可选实验，当前 presence 模型已经覆盖快响应与减弱动效验收标准。
- [KNOWN] 生产实例使用本机 `next start`，本次构建已重写 `.next`，部署需要重启进程。
