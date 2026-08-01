# Planner v2 Phase 0 契约与原型

日期：2026-07-31  
状态：已冻结

## 语义决策

1. 任务与事件使用独立实体和 repo。
2. `due_date/due_at` 表达承诺边界，`scheduled_start_at/scheduled_end_at` 表达计划占用。
3. UTC ISO 字符串保存瞬时值，IANA 时区保存编辑语境，`YYYY-MM-DD` 保存全天日期。
4. 全天结束日期使用 exclusive 语义。
5. 重复规则保存 RFC 5545 RRULE，实例以 UTC 起点作为稳定 `occurrence_key`。
6. DST gap 阻止保存并要求用户选择有效时间；DST fold 默认选择较早瞬时值，编辑器提供较早、较晚与拒绝三种消歧。
7. 单次展开上限 500，范围查询增加前后一天缓冲。

## 依赖与运行时原型

| 项目 | 结论 |
| --- | --- |
| Node | 24.15.0 满足仓库 Node 24 约束 |
| SQLite | 3.53.2，FTS5 已启用 |
| `rrule` | 2.8.1，BSD-3-Clause，服务端与客户端纯函数可用 |
| `date-fns` | 4.4.0，MIT，支持 `@date-fns/tz` 上下文 |
| `@date-fns/tz` | 1.5.0，MIT，IANA offset 与 DST 扫描可用 |
| `web-push` | 3.6.7，MPL-2.0，Node ≥16，限定服务端 Worker |

FTS5 `trigram` 对三个及以上 Unicode 字符的中文短语有效。两个汉字的查询进入 Phase 5 规范化 token 或受限 `LIKE` 回退路径。

Web Push 原型在本机生成 VAPID 密钥、P-256 订阅密钥和加密请求体。真实发送需要部署环境提供 VAPID 凭据与浏览器 Push endpoint。

## Worker 运行方式

提醒 Worker 使用独立 Node 进程，生产环境由 systemd 管理。进程每 30 秒扫描一次，通过数据库事务领取 lease；稳定 reminder id 与发送状态提供幂等边界。应用 Web 进程负责订阅 CRUD，Worker 负责发送与退避。

## 界面线框

桌面 `/tasks`：240px 智能视图与清单栏、弹性任务列表、320px 检查器。  
桌面 `/calendar`：240px 日历与筛选栏、弹性时间轴、300px 待排任务与检查器。  
平板：左栏折叠为顶栏入口，检查器使用侧 Sheet。  
390px 手机：任务列表或议程占满主视图，筛选与待排区使用底部 Sheet。

## 键盘路径

- `N` 新建任务，`E` 新建事件，`/` 聚焦搜索，`G` 打开日期跳转。
- 方向键移动列表选择，`Enter` 打开检查器，`Space` 完成任务，`Escape` 关闭浮层并归还焦点。
- 编辑器按 DOM 顺序覆盖标题、组织字段、时间、重复、提醒、子任务、备注与活动记录。
- 日历事件提供可聚焦替代入口，键盘调整通过检查器时间字段完成。

## 验收 fixture

`src/lib/planner/acceptance-fixtures.ts` 固化 20 个跨 Phase 2–6 的代表性场景。每个 fixture 包含稳定 id、前置条件、操作与可验证结果，后续 repo、组件和 E2E 测试引用同一语义。
