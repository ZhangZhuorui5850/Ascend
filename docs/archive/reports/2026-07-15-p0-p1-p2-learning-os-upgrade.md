# Ascend P0–P2 学习操作系统升级交付报告

日期：2026-07-15

## 已交付

- [COMPUTED] P0 学习引擎：首次学习 D+1、独立间隔阶梯、遗忘重建、精通层级优先、主动回忆提示/答案、错题跨日两次通过、操作 ID 幂等。
- [COMPUTED] P0 数据与发布：上传事务和文件补偿、Node 22 与 CI 门禁、CSP/安全响应头、备份 manifest、成功标记、异地镜像及恢复校验脚本。
- [COMPUTED] P1 使用闭环：四步初始化、学习目标和主线科目、3/7 天积压恢复及恢复事件、14 天临考冲刺、模考成绩/能力拆分/趋势/薄弱项。
- [COMPUTED] P2 移动体验：手机日历默认列表、月历切换、今日模块折叠、移动输入 16px 与关键操作 44px 触控区。
- [COMPUTED] P2 资料生产力：列表/网格、图片预览、多选批量移动和删除、系统文件拖入、三路并发上传与总进度、日期/科目/章节/知识点/分类/备注编辑、扩展搜索。
- [COMPUTED] P2 离线复习：工作区隔离的 IndexedDB 快照与 outbox、离线评分、联网自动同步、服务端 operationId 幂等、退出清理；Service Worker 继续只缓存公共离线壳和图标。

## 数据结构

- [COMPUTED] `0013_learning_engine` 增加主动回忆、间隔阶梯、遗忘次数、错题通过状态和复习操作 ID。
- [COMPUTED] `0014_learning_product` 增加首次初始化状态和模考记录。
- [COMPUTED] `0015_recovery_audit` 增加积压恢复事件。

## 验收证据

- [COMPUTED] `npm test`：30 个测试文件、230 项测试全部通过。
- [COMPUTED] `npm run lint`：通过，0 个错误与警告。
- [COMPUTED] `npm run build`：Next.js 16.2.10 生产构建通过，包含 `/onboarding`、`/mock-exams` 和 `/api/reviews/sync`。
- [COMPUTED] `npm run smoke`：登录、初始化、设置、今日工作台、知识树、资料库、错题、统计、日历、收纳和退出全路径通过。
- [COMPUTED] `npm run responsive:audit`：1440px 桌面、390px 手机、360px 小屏和 844×390 横屏通过；PWA 公共缓存边界通过。
- [COMPUTED] `npm run audit:multi-user`：邀请、双工作区内容、交叉附件 404、管理员只读摘要、停用会话和审计日志共 9 项通过。
- [COMPUTED] `npm run audit:offline-review`：断网评分、IndexedDB outbox、联网清空并提交通过。
- [COMPUTED] 隔离数据库迁移验证：2 个工作区、224 个知识点、2 个附件，跨空间关系异常 0，缺失文件 0。
- [COMPUTED] 备份恢复演练：SQLite `integrity_check=ok`，2 个上传文件进入快照，异地镜像完整，`verify:backup` 返回 `ok: true`。

## 运维动作

1. 使用 Node 22.23.1 执行 `npm ci`、测试和构建。
2. 发布前运行 `npm run backup`，生产环境设置独立磁盘或挂载路径 `ZGCA_BACKUP_MIRROR_ROOT`。
3. 运行 `npm run verify:backup` 与 `npm run verify:migration`，确认两项输出中的 `ok` 均为 `true`。
4. 部署新构建并执行 `npm run smoke` 与 `npm run responsive:audit`。
