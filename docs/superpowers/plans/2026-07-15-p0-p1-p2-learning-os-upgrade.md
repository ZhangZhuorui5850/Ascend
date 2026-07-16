# Ascend P0–P2 学习操作系统升级实施计划

状态：2026-07-15 已完成实施与验收。证据见 `docs/reports/2026-07-15-p0-p1-p2-learning-os-upgrade.md`。

对应设计：`docs/superpowers/specs/2026-07-15-p0-p1-p2-learning-os-upgrade-design.md`

## 批次 A：P0 学习引擎

1. 追加学习状态字段迁移和索引。
2. 重写首次学习、复习评分、撤销与错题回炉状态机。
3. 补齐状态机、排序、跨工作区和幂等测试。
4. 快速记录接入章节/知识点级联选择。
5. 知识点接入“今天学了”、prompt 与 answer 编辑。

## 批次 B：P0 发布可靠性

1. 上传数据库写路径事务化并增加失败补偿测试。
2. 增加全局安全响应头与临时 Caddy 入口一致配置。
3. 固定 Node 22，增加 GitHub Actions 门禁。
4. 备份增加 manifest、成功标记、异地复制钩子和文档。

## 批次 C：P1 学习体验

1. 新增首次初始化向导及完成状态。
2. 复习卡升级为“提示 → 显示答案 → 评分”。
3. 增加积压恢复计划和顺延动作。
4. 增加考试临近权重、模拟考试记录和效果分析指标。

## 批次 D：P2 移动与资料

1. 手机日历列表与今日页折叠分区。
2. 资料库网格、缩略图、多选与批量操作。
3. OS 拖入、三并发上传、逐文件进度。
4. 资料元数据重绑和扩展搜索。

## 批次 E：P2 离线复习

1. 增加登录态离线快照和幂等评分端点。
2. 实现 IndexedDB 快照/outbox。
3. 保持 Service Worker 公共壳边界，联网事件同步 outbox，退出账号清理本机学习缓存。
4. 完成离线、重连、冲突和跨账号隔离测试。

## 完成门禁

每个批次执行相关单测；最终执行：

```bash
npm test
npm run lint
npm run build
npm run verify:migration
npm run smoke
npm run responsive:audit
```

交付报告记录每项验收的 `[COMPUTED]`、`[INFERRED]` 或 `[KNOWN]` 证据。
