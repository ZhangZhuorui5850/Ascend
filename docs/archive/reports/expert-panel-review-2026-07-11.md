# 专家评审团完整评估报告（2026-07-11）

六位专家角色（软件架构师、跨平台体验工程师、学习产品专家、文件管理与信息架构专家、性能与缓存工程师、UI/UX 设计师）并行深读代码后独立产出发现，最后由「委员会主席」检查集体盲区并裁决矛盾建议。每条发现均带文件:行号证据。

---

## 执行摘要

**总体结论：系统基础质量显著高于同类自托管个人项目。** 六位专家一致确认的优点：数据层 workspace 隔离纪律贯彻彻底且有端到端审计脚本、认证实现健壮（token 哈希、scrypt、限速、审计日志）、资产分发达到生产级（Range/强 ETag/immutable）、备份脚本用 online backup + 硬链接增量、朱砂手帐设计系统完整（亮暗双主题、toast/确认/空态/骨架四类反馈原语）、复习队列的键盘评分+落章动画+8秒撤销是同类产品少见的好交互。

**风险与机会集中在五个主题：**

1. **复习引擎有三处硬伤**（学习产品专家，均 high）：队列截断时层级排序方向反了（"了解"排在"精通"前，一行 SQL 修复）；遗忘后间隔不重建（一次答对跳回 30 天，制造假掌握）；新知识点没有进入复习管线的入口（不出错题就永远不复习）。对备考系统这是最影响学习效果的三件事。
2. **移动端资料库断路**（三位专家交叉确认）：触屏无法移动文件（只有 HTML5 拖拽一条路）、≤1080px 详情面板被 display:none、双击预览在 iOS 不可靠、PDF iframe 在 iOS 只显示第一页——手机上资料库退化为只能看文件名。
3. **多视图的地基已就绪**（文件管理专家）：folders 表结构、索引、getExplorer 数据面都不需要改动，缺的只是前端形态（视图切换器 + 网格/分栏组件）和一个缩略图端点。
4. **性能剩余大头是三处**（性能工程师）：根 layout 每请求全量序列化知识层级、Server Action revalidatePath 后又 router.refresh() 双往返（53 处）、图片无缩略图直出原图。
5. **集体盲区**（委员会主席）：无 CI 门禁（现有测试甚至固化了排期 bug 的行为）、时区硬编码 Asia/Shanghai 十余处、用户数据零导出能力、admin 只读审阅页无页面级鉴权且不写读审计、缺 CSP。

**裁决要点：** 多平台路线先走 PWA（半天可安装、1-2 天断网可用）而非先建 token API 层；字体自托管必须子集化且先落地性能度量；视频预览白名单可顺手改但在 20MB/3Mbps 约束下收益降为 low；移除 router.refresh() 方向正确但必须先查本版本 Next 文档并逐页回归，禁止全局批量替换；排期算法修复要连同 `review-schedule.test.ts` 的既有断言一起改（按 1-2 天评估）。

---

## 建议路线图（按优先级）

### P0 — 正确性与风险（多为半天级）
| # | 事项 | 工作量 |
|---|------|--------|
| 1 | 修复到期队列截断排序（tier 字典序反了）+ 补测试 | S |
| 2 | 遗忘后重建间隔：加 interval_step 替代总次数取阶梯（连测试断言一起改） | M |
| 3 | 错题毕业改两次跨间隔通过；修正错题本页文案 | M |
| 4 | 新知识点入管线：「今天学了」按钮 + 带知识点的学习记录自动排 D+1 | M |
| 5 | backfillAssetBlobs 加完成标记，移出启动路径；ref_count 对账挪进 gc 脚本 | S |
| 6 | createAssetFromUpload 全部 DB 语句包事务；GC 删除前 JOIN assets 再确认 | S |
| 7 | 最小 CI（lint + vitest + build）+ 升级流程加 npm test | S |
| 8 | admin workspace 审阅页补 requireAdmin() + 读操作审计日志 | S |

### P1 — 体验杠杆最高
| # | 事项 | 工作量 |
|---|------|--------|
| 9 | 移动端资料库救活：单击即预览、行内「移动到…」菜单、窄屏详情改底部 sheet | M |
| 10 | PWA 第一步：manifest.ts + 图标（可安装）；第二步 SW 壳缓存（断网可开） | S→M |
| 11 | 逐页移除多余 router.refresh()（先查 node_modules/next/dist/docs 确认语义，手动回归撤销/回声交互） | M |
| 12 | 收纳面板知识层级从 layout 移除，改为打开时按需 fetch | S |
| 13 | 缩略图管道：sharp 按 sha256 内容寻址生成 256px WebP + 复用 ETag/immutable；GC 同步清理 | M |
| 14 | iOS 三件套：输入控件 16px、capturePanel 100dvh、PDF 触屏降级为「新标签打开」（pdf.js 二期） | S |
| 15 | --quiet/--muted 对比度提升至 4.5:1 | S |
| 16 | (workspace_id, next_review) 部分索引 + 性能度量三件套（Web Vitals 落库、慢 SQL 日志、Caddy p95） | S |

### P2 — 资料库「访达式」升级（用户点名方向）
| # | 事项 | 工作量 |
|---|------|--------|
| 17 | 视图切换器（segmented，localStorage 记偏好）+ 大图标网格视图（依赖缩略图）；FileExplorer 拆为壳 + ListView/GridView + useSelection/useDragMove hooks | L |
| 18 | 多选（Ctrl/Shift）+ 批量移动/删除 + 非空文件夹删除确认分支 | M |
| 19 | OS 文件拖入 driveMain 直接上传（抄 CapturePanel 现成实现）+ 上传进度/取消 | S→M |
| 20 | 命令面板接全局搜索（知识点/文件/错题三表） | M |
| 21 | 详情面板「编辑关联」+ 科目虚拟目录视角 + 搜索扩展到 note/知识点标题 | M |
| 22 | 分栏视图（Miller columns）+ 右键菜单（触屏长按） | M |
| 23 | 视频/音频 inline 白名单 + <video>/<audio> 预览（顺手做，优先级 low） | S |

### P3 — 长期与制度
| # | 事项 | 工作量 |
|---|------|--------|
| 24 | 考试倒计时接入排期（间隔上限 min(阶梯, 距考天数/2)）+ 冲刺模式 + 模拟考记录 | L |
| 25 | 复习卡片两段式问答（prompt/answer 字段，Anki 模式）；积压补救模式（postpone） | L |
| 26 | 晚间收尾引导卡片 + 当日战报 + streak 里程碑 + 周复盘 | M |
| 27 | per-workspace 数据导出（JSON + Markdown + 附件 zip，settings 页入口） | M |
| 28 | 时区收敛：todayKey(tz) + 用户级时区设置，十余处硬编码统一 | M |
| 29 | globals.css 清理（删死层→合并同名→拆文件）——重设计落地前置 | L |
| 30 | 字体子集化自托管（先有度量，后上字体，走 immutable 缓存） | M |
| 31 | PWA 第三步离线复习队列（IndexedDB）→ 届时再统一设计 token API 层 | L |
| 32 | sessions/login_attempts 清理 + last_seen_at 节流更新；限速加纯 email 维度 | S |
| 33 | workspace_id 过滤的机制性防线（vitest 规则测试扫描 repo SQL）+ 扩审计脚本 | M |
| 34 | 领域错误分级（DomainError.status）+ 集中式输入校验/长度上限 | M |
| 35 | 备份自动化调度 + dead-man-switch 告警 + rclone 异地副本 | M |
| 36 | Caddy 加 CSP/frame-ancestors；8443 临时入口复用安全头或删除 | S |
| 37 | 日历按月窗口取数 + 删 timeGridPlugin + 窄屏 listMonth；riseIn 动画降频 | M |
| 38 | 死代码清理：7 个空 API 目录、entity_changes 等僵尸表、upload_sessions 表定去留 | S |

---

## 各专家详细发现

（以下为六位专家与委员会主席的完整原始产出）

### 软件架构师

**总评：** 这是一个远超「个人项目平均水平」的自托管系统：repo 模式贯彻彻底（所有数据访问强制携带 WorkspaceScope），SQLite 配置正确（WAL/busy_timeout/事务），认证安全细节到位（token 哈希存储、scrypt、限速、审计日志），运维面有 online backup、blob GC、多维健康探针和端到端多用户隔离审计脚本。主要风险集中在三处：一是启动路径上遗留的全量 blob 重哈希会随资料库增长把冷启动拖到不可用；二是全部业务能力锁在 Server Actions + Cookie 里，与用户想要的多平台演化方向直接冲突（api/ 下 7 个空目录暴露了未完成的意图）；三是若干「只增不删」的运行时熵（过期会话、登录记录、死掉的同步脚手架表）和约定式而非机制式的多租户隔离，会在系统长期运行和多人使用后逐渐显形。所列修复大多是半天到三天的工作量，优先做前三条即可显著提升健壮性。

**亮点：**
- 数据层隔离纪律极佳：所有 repo 函数强制接收 WorkspaceScope（src/lib/access-context.ts:4-6），0007 迁移把 11 张表重建为含 workspace_id 的复合主键并配 FK 级联（src/lib/migrations.ts:404-530），本次逐条 grep 未发现漏过滤的查询
- 还有端到端隔离验证：scripts/multi-user-audit.mjs:44-48 用 Playwright 真实创建两个用户并断言跨空间取文件返回 404，这在个人项目里极为罕见
- SQLite 使用规范：WAL + foreign_keys + busy_timeout + synchronous=NORMAL（src/lib/db.ts:27-30），复合写操作普遍包 db.transaction（如 src/lib/repo/reviews.ts:58,152,201），复习评分还带快照式 undo（reviews.ts:97-171）
- 认证实现健壮：会话 token 只存 sha256 哈希（src/lib/auth.ts:24,163）、scrypt+timingSafeEqual 校验密码（auth.ts:33-40）、登录限速（auth.ts:280）、改密吊销全部会话（auth.ts:226）、邀请令牌哈希存储+24h 过期+一次性（src/lib/repo/admin.ts:66-142）、管理动作全量审计日志且 summary 白名单过滤（admin.ts:297-300）
- 运维脚本质量高：备份用 SQLite online backup + WAL checkpoint + 对上一份备份硬链接增量 + 轮转（scripts/backup.mjs:44-94）；blob GC 有 7 天缓冲期和路径逃逸防护（scripts/gc-blobs.mjs:14-20,37）；health 探针覆盖 db/磁盘余量/WAL 膨胀/上传可写四个维度（src/app/api/health/route.ts:27-70）
- 文件服务达到生产级：Range 请求、内容寻址强 ETag、immutable 私有缓存、RFC5987 中文文件名、nosniff（src/app/api/assets/[id]/file/route.ts:53-93），上传服务端按扩展名纠正 MIME（src/lib/repo/library.ts:374）
- Server Actions 与 API 的分工清晰一致：页面内变更走统一 {ok,error} ActionResult 模式（src/app/actions/day.ts:18-24），全部 action 第一行做 requireWorkspace/requireAdmin 鉴权（grep 无一遗漏），文件上传/流式下载这类不适合 action 的场景才用 route handler 且补了 same-origin 校验（src/app/api/assets/route.ts:9）
- 迁移机制有版本表+checksum+事务包裹（src/lib/migrations.ts:555-592），初始化失败会重置连接句柄避免复用半初始化状态（src/lib/db.ts:34-40），还有独立的迁移验证脚本（scripts/verify-workspace-migration.mjs）
- 遵循了项目 AGENTS.md 的警告：proxy.ts 确实是该 Next 16 版本的正确约定（node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md 存在），且只做乐观 cookie 存在性检查、真正鉴权下沉到每个页面/route，符合该文档的推荐分层

**发现：**

#### [🔴 high · 工作量 S] 启动时全量重读并重哈希所有上传文件（backfillAssetBlobs 无终止条件）

- **现状：** src/lib/migrations.ts:594 在 runMigrations 末尾无条件调用 backfillAssetBlobs；该函数（migrations.ts:746-806）SELECT 全部 assets，对每条 readFileSync 整个文件并计算 sha256（migrations.ts:771-775），最后还全表重算 blobs.ref_count（migrations.ts:794-802）。而 runMigrations 由 getDb() 在每次进程冷启动的首个请求触发（src/lib/db.ts:32）。
- **问题：** 这是一次性回填逻辑却永久驻留在启动路径：上传库越大（每空间配额默认 2GiB，migrations.ts:221），冷启动 I/O 与 CPU 开销越大，阻塞首个请求；在 4C/40GB 盘的生产机上可能拖垮 compose healthcheck（start_period 仅 20s，compose.production.yml），造成容器反复重启循环。backfillKnowledgeHierarchy 也每次启动全跑（migrations.ts:595），虽幂等但同样是白费功。
- **建议：** 给回填加完成标记：回填成功后写入 schema_migrations（如 0009_blob_backfill_done）或 app_settings 键，启动时先查标记再决定是否执行；或只处理 relative_path 不符合 '<ws>/blobs/<xx>/<sha>' 格式的行（正常运行时应为 0 行）。ref_count 重算移入 gc-blobs.mjs 作为对账步骤。

#### [🔴 high · 工作量 L] 业务能力全部锁死在 Server Actions + Cookie 会话，多平台/移动端无 API 可用

- **现状：** 8 个 action 文件承载全部业务写操作（src/app/actions/*.ts），REST 端点只有 3 个：POST /api/assets、GET /api/assets/[id]/file、GET /api/health（find 全仓仅 3 个 route.ts）。src/app/api/ 下 calendar、dashboard、day、knowledge、mistakes、reviews、study-sessions 全是空目录（遗留骨架）。认证只有 httpOnly cookie 会话（src/app/actions/auth.ts:26-32），无 Bearer/PAT 通道。
- **问题：** Server Actions 的调用协议是 Next.js 私有编码，原生移动 App、CLI、第三方脚本无法复用；用户明确关心多平台使用可能性。空 API 目录还会误导后续开发。好消息是 repo 层（src/lib/repo/*）与 HTTP 完全解耦、每个函数显式收 db+scope，加 API 层是平移而非重写。
- **建议：** 近期先删掉 7 个空 API 目录。规划多平台时：按 repo 函数镜像出 /api/v1/*（day、reviews、mistakes、knowledge、library），复用 requireWorkspace(request)（src/lib/request-auth.ts:26 已支持从 Request 读 cookie）；再给 sessions 表加 kind 字段发放长期 API token（token_hash 机制可直接复用 auth.ts:24,163）。

#### [🟡 medium · 工作量 S] 上传落库非原子：崩溃窗口可产生 ref_count=0 的在用 blob，7 天后被 GC 误删文件

- **现状：** createAssetFromUpload（src/lib/repo/library.ts:345-416）中 blobs 插入(375)、assets 插入(388)、ref_count+1(404)、ensureFolderPath(408)、linkAsset(409) 是五组独立语句，没有包 db.transaction。gc-blobs.mjs:34-38 会删除 ref_count=0 且超 7 天的 blob 行和文件。
- **问题：** 若进程在 assets 插入后、ref_count+1 前崩溃，asset 行存在但 blob ref_count=0，7 天后 GC 删掉物理文件，资产变成永久 404。当前靠 backfillAssetBlobs 每次启动重算 ref_count 兜底（migrations.ts:794-802），但该兜底正是上一条建议要移除的启动全量扫描——两个问题互相锁死。deleteAsset 的读-后-事务模式（library.ts:218-232）也有类似小窗口。
- **建议：** storeUploadedFile 落盘（async）完成后，把后续全部 DB 语句包进一个 db.transaction；GC 侧再加一道保险：删除前 JOIN assets 确认无行引用该 storage_key 才删。

#### [🟡 medium · 工作量 S] sessions/login_attempts 只增不删，last_seen_at 永不更新导致设备管理功能失真

- **现状：** 过期会话只在读取时判断（src/lib/auth.ts:196）从不 DELETE；login_attempts 每次登录尝试插入一行（auth.ts:128-131）无任何清理；sessions.last_seen_at 建表后全仓无 UPDATE（grep 仅 schema 定义 migrations.ts:95 与 SELECT auth.ts:264）。设置页「设备会话」显示的『最近活动』（src/components/DeviceSessions.tsx:29）实际是会话创建时间。
- **问题：** 两张表无限增长（30 天会话周期 + 每次失败登录一行），长期运行拖慢 isLoginRateLimited 的 COUNT 查询和备份体积；用户看到的设备活跃时间是错的，无法据此判断哪个会话该踢。
- **建议：** getSessionContext 命中时节流更新 last_seen_at（如距上次超过 1 小时才写，避免每请求写放大）；在启动或 backup/gc 脚本里顺手执行 DELETE FROM sessions WHERE expires_at < now 和 DELETE FROM login_attempts WHERE created_at < -7 days。

#### [🟡 medium · 工作量 M] 多用户数据隔离靠每条 SQL 手写 workspace_id 过滤，无机制性防漏

- **现状：** 所有 repo 函数签名强制传 WorkspaceScope（src/lib/access-context.ts:4-6），每条查询手写 workspace_id = ?（如 library.ts:79,171,205、reviews.ts:114、days.ts:53）。本次评审 grep 未发现遗漏，且有 Playwright 端到端跨空间审计（scripts/multi-user-audit.mjs:44-48 断言跨用户取文件返回 404）兜底。
- **问题：** 纪律执行得很好，但保障是约定式的：未来每新增一条查询都是一次泄漏机会，SQLite 没有 RLS，出错时静默返回他人数据而非报错。审计脚本只覆盖文件下载一条路径，覆盖不到新查询。
- **建议：** 增加机制层防线（任选其一即可）：a) 写一个 scopedStatement helper，接收 SQL 模板并静态断言含 workspace_id 占位符；b) 加 vitest 规则测试，扫描 src/lib/repo/ 中所有 SELECT/UPDATE/DELETE 语句字符串必须匹配 /workspace_id\s*=/（tags 等含 workspace 复合主键的表除外白名单）；c) 扩充 multi-user-audit 覆盖错题/知识点/日历读取。

#### [🟡 medium · 工作量 S] API 把领域校验错误统一按 500 返回，错误语义与监控信号失真

- **现状：** authErrorResponse（src/lib/request-auth.ts:85-95）只识别带 status 的 AuthError，其余一律 500 并 logError；而 repo 层抛的是裸 Error，如『存储空间已满』『单个文件不能超过 20MB』（library.ts:360-362）、『目标文件夹不存在』（library.ts:203），经 /api/assets 的 catch（api/assets/route.ts:33-35）全部变成 500。
- **问题：** 客户端无法区分「用户可修复的错误」和「服务端故障」，配额满这种正常业务拒绝会污染 5xx 错误日志与 health 监控判断；与 Server Actions 侧干净的 {ok,error} 模式（actions/day.ts:18-24）不一致。
- **建议：** 定义 DomainError extends Error { status }（配额→413、校验→400、不存在→404），repo 层抛错时带上状态；authErrorResponse 已有按 status 分流的逻辑，无需改动。顺带统一错误响应体形状 {error, code}。

#### [🟡 medium · 工作量 M] 输入校验非系统化，长文本字段无长度上限

- **现状：** 校验散落为手写 trim/Number 强转（reviews.ts:30-45、settings.ts:56-59、admin.ts:49-53 各写各的）；saveDayEntry 接受任意长度字符串直写 daily_entries（src/app/actions/day.ts:27-40 → repo/days.ts:130-155），day_notes/study_sessions.output 同样无上限；src/lib/limits.ts 仅有上传 20MB 一个常量。
- **问题：** 单用户场景无碍，但这是多用户系统：任一账号用脚本即可向文本字段写入几十 MB 字符串，撑大 SQLite、拖慢备份、放大内存（better-sqlite3 同步读整行会阻塞事件循环，全站单进程共享）。校验规则无处集中查阅，新端点容易漏。
- **建议：** 在 limits.ts 集中定义各字段 maxLength（如 plan/diary 64KB、title 500），写一个 validators 模块（或引入 zod）供 actions 和未来 API 复用；Server Action 入口统一先过 schema 再进 repo。

#### [🟡 medium · 工作量 M] 备份体系依赖人肉 cron 且与主数据同盘，无异地副本与备份成功监控

- **现状：** 备份脚本本身质量很高（scripts/backup.mjs:44-55 用 SQLite online backup + WAL checkpoint，63-86 硬链接增量，89-94 轮转），但调度只是 README 里一行需要手工安装的 cron（deploy/README.md『Run a daily root cron entry』）；./data 与 ./backups 挂载在同一台 40GB 主机（compose.production.yml volumes），README 自己承认『a backup on the same 40GB disk is not disaster recovery』。
- **问题：** 两个单点：cron 忘装/失效则完全无备份且无人知晓（脚本失败只写本地日志）；磁盘或主机故障同时带走数据与备份。对『备考中重度使用』的场景，丢一个月学习记录是不可接受的。
- **建议：** 1) 把 cron 安装纳入部署脚本或改用 compose 内 ofelia/系统 systemd timer；2) 备份完成后 ping 一个 dead-man-switch（healthchecks.io 免费档），失败即告警；3) 用 rclone 把 backups/ 同步到对象存储（腾讯 COS 低频档很便宜），硬链接结构注意用 --links 或直接同步最新一份。

#### [🟢 low · 工作量 M] 离线同步的数据库脚手架是死代码：entity_changes/devices/conflicts/drafts 建表后零使用

- **现状：** 0001 迁移创建了 devices、entity_changes、conflicts、drafts（migrations.ts:27-75），0007 还专门给它们加了 workspace_id（migrations.ts:279-295）；但 grep 全部 src 仅 migrations.ts 和测试引用这些表，所有 repo 写路径都不产生 change log。
- **问题：** 如果未来要做离线同步/多端冲突合并，现有写路径（直接 UPDATE/INSERT，如 reviews.ts:155-160）不经过任何变更记录层，届时要么给每个 repo 函数补 oplog（侵入面大），要么这套表推倒重来——表结构先行但架构未预留写入口，是最容易卡住的演化点。导出/导入同理：目前没有任何按 workspace 导出的通道，只有整库备份。
- **建议：** 短期二选一：接受现实删掉这些表（迁移只增不删的原则下可留表加注释）；或先做最小闭环——写一个 recordChange(db, scope, entity, op, snapshot) helper，仅在 reviews/mistakes/day_tasks 三个高价值实体的写路径调用，作为未来同步和按空间导出（SELECT snapshot_json）的地基。

#### [🟢 low · 工作量 S] prepared statement 每次调用重新编译，热路径白费开销

- **现状：** 所有 repo 函数在函数体内即时 db.prepare()（如 getDay 一次请求编译 7 条语句 repo/days.ts:73-114，getExplorer 编译 4 条 library.ts:237-299）；better-sqlite3 不做自动语句缓存。全仓 db.prepare 调用 200+ 处。
- **问题：** 每次页面导航都重复 SQL 解析/编译。当前数据量下毫秒级、非瓶颈，但这与全站 force-dynamic（12 个页面均无服务端缓存，如 src/app/page.tsx:14）叠加，意味着每次导航的全部延迟都花在这条同步路径上，且 better-sqlite3 是同步 API，会占住唯一的事件循环。
- **建议：** 在 db.ts 加一个模块级 Map<sql, Statement> 的 prepareCached(db, sql) helper，repo 层逐步替换；配合 Next 的 'use cache' 或 unstable_cache 给 subjects 概览这类低频变化查询加短 TTL 缓存前先查 node_modules/next/dist/docs 确认该版本 API。

#### [🟢 low · 工作量 S] 登录限速键含 IP，可被换 IP 绕过；纯 email 维度无兜底

- **现状：** isLoginRateLimited 按 (email_hint, ip_hint) 组合计数、15 分钟 5 次（src/lib/auth.ts:280-288）；ipHint 取 x-forwarded-for（actions/auth.ts:15）。Caddy 2.5+ 默认不信任来路 XFF（deploy/Caddyfile 未配 trusted_proxies，默认安全），伪造风险低。
- **问题：** 攻击者轮换出口 IP 即可对同一邮箱无限次试密；scrypt 验证成本高又是同步执行（auth.ts:37），高频爆破还会阻塞事件循环形成变相 DoS。
- **建议：** 追加一条仅按 email 计数的宽松阈值（如 15 分钟 20 次），以及全局失败次数熔断；密码验证可挪到 worker thread 或换 async scrypt。

#### [🟢 low · 工作量 S] run 型迁移的 checksum 只校验版本号字符串，代码漂移无法检测

- **现状：** runMigrations 对 sql 型迁移校验 SQL 文本哈希，但 run 型迁移的 checksum 是 checksum(migration.sql ?? migration.version)（src/lib/migrations.ts:576），即版本名本身——0004~0008 五个 run 型迁移的函数体改了也不会触发 mismatch。
- **问题：** checksum 机制的本意是防止已应用迁移被悄悄改写导致新旧环境 schema 分叉；对占比过半的 run 型迁移该保护完全失效，只剩「假装校验过」的错觉。
- **建议：** 对 run 型迁移用 migration.run.toString() 参与哈希（构建产物稳定的前提下），或干脆给每个 run 型迁移手写一个 contentHash 字段并在 code review 时约定函数体一旦应用即冻结；同时在 CLAUDE/AGENTS 文档注明『已应用的迁移不可修改』。


### 跨平台体验工程师

**总评：** 整体架构对多端已有认真投入：三档断点（1439/1080/820）+ 移动底部导航 + 收纳抽屉 + safe-area 适配，键盘操作（Ctrl/⌘+K 面板、复习 1-4 评分）在同类自托管工具里属于优秀水平，资产分发带 Range/ETag/immutable 缓存。但「多平台可能性」目前止步于响应式布局层：资料库的核心操作（移动文件、预览）在触屏上断路，PDF 预览在手机上基本不可用，且 PWA 三件套（manifest/图标/Service Worker）完全缺失。平台支持现状矩阵——【桌面浏览器】约 90% 可用：全功能 + 键盘快捷键，缺 OS 文件拖入上传、⌘K 标签在 Windows 显示错误；【手机浏览器】约 65% 可用：导航/收纳/复习流程有专门适配且体验好，但资料库移动文件无路径、PDF 预览损坏、输入聚焦自动放大、收纳抽屉底部被 iOS 工具栏遮挡；【PWA 安装】0%：无 manifest 无图标，无法添加为 App（iOS 添加主屏幕只得到截图图标）；【离线使用】0%：无 Service Worker，地铁断网即白屏，连已看过的页面都不可用。备考重度使用者「手机装成 App + 离线复习」的诉求，最小可行路径是 manifest.ts + 图标（半天，达成可安装）→ SW 缓存壳与静态资源（1-2 天，达成断网可打开）→ 复习队列本地缓存 + 后台同步（3 天+，达成真离线复习）。

**亮点：**
- 响应式基建扎实：globals.css:2613/2650/2670 三档断点覆盖收纳抽屉化、双栏折叠、侧栏切换底部导航，移动端有专门的「更多」抽屉面板（Sidebar.tsx:142-158）且触控目标 min-height 72px（globals.css:3159）
- 存在自动化响应式回归脚本 scripts/responsive-audit.mjs：登录/主页/今日/资料库桌面+390px 双查，且每页断言无水平溢出（responsive-audit.mjs:113-121），并回归命令面板键盘导航与主题切换
- 键盘支持超出预期：Ctrl/⌘+K 命令面板（CommandPalette.tsx:38-46，同时监听 metaKey 和 ctrlKey，跨 Win/mac）、复习队列 1-4 数字键评分且正确排除输入框焦点（ReviewQueue.tsx:101-121）、所有输入框 Enter/Escape 语义一致
- 收纳面板是触屏/桌面双优设计：全局粘贴截图自动唤起抽屉（CapturePanel.tsx:57-78）、拖拽多文件、拍照入库用 capture="environment"（CapturePanel.tsx:421）且相机按钮按 pointer:coarse 条件显示（globals.css:2664）
- iOS 细节有意识：mobileNav 和 mobileMoreSheet 用了 env(safe-area-inset-bottom)（globals.css:257, 3132），登录页用 100svh（globals.css:3491），部分面板已用 100dvh（globals.css:667, 3936）
- 加载体验用心：资产文件接口实现单段 Range + 强 ETag + immutable 缓存（api/assets/[id]/file/route.ts:53-75），next.config.ts 配置 staleTimes 客户端路由缓存，各页面有 loading.tsx 骨架
- 无障碍与偏好尊重：prefers-reduced-motion 全局关动画（globals.css:2821）、prefers-color-scheme + 手动主题双通道且有防闪烁内联脚本（layout.tsx:14）、大量 aria-label/aria-expanded
- AssetViewer 的 Markdown 预览自研渲染器输出 React 元素而非 innerHTML，无 XSS 面（AssetViewer.tsx:117-244），且大于 1MB 文本自动降级为新窗口打开

**发现：**

#### [🔴 high · 工作量 L] PWA 三件套完全缺失：不可安装、断网白屏，离「手机装 App + 地铁离线复习」有整段距离

- **现状：** 全项目无 manifest、无 Service Worker、无 PWA 图标：src/app/ 下只有 icon.svg（favicon 用），public/ 只有 Next 默认的 vercel.svg 等模板文件；grep 全库无 navigator.serviceWorker/workbox/serwist 命中；layout.tsx 的 metadata（layout.tsx:9-12）没有 manifest/appleWebApp 字段
- **问题：** 作为备考者每天要用的系统，手机上无法「添加到主屏幕」成独立 App（iOS 上添加也只得到网页截图图标、带 Safari 地址栏），任何一次断网（地铁、电梯）整站白屏——连刚看过的复习队列都消失。这与用户「多平台使用可能性」诉求的差距最大且最集中
- **建议：** 分三步走：(1) 半天達成可安装——新增 src/app/manifest.ts（本 Next 版本原生支持该文件约定，见 node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md）输出 name/short_name/display:standalone/theme_color(#b13a20)/icons，用现有朱砂印章风格出 192/512 PNG + maskable + apple-icon.png；(2) 1-2 天——按 node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md 手写轻量 SW：precache 壳 + CSS/JS stale-while-revalidate + /api/assets/*/file cache-first（该接口已有 immutable ETag，天然适合），断网时导航请求回退到缓存页；(3) 3 天+——把当天复习队列/错题写入 IndexedDB，离线打分排队、恢复网络后经现有 server action 重放。注意 better-sqlite3 全部逻辑在服务端，(3) 需要一层客户端数据镜像，建议先只做队列只读缓存

#### [🔴 high · 工作量 M] 资料库在触屏上核心操作断路：移动文件只有 HTML5 拖拽一条路，预览入口依赖双击且详情面板在 ≤1080px 被隐藏

- **现状：** 移动文件/文件夹仅通过 draggable + onDragStart/onDrop 实现（FileExplorer.tsx:295-302, 353-355, 469-479），无任何菜单式「移动到…」替代；预览靠 onDoubleClick（FileExplorer.tsx:349-352），详情面板里的「预览」按钮（FileExplorer.tsx:439-443）在 @media (max-width:1080px) 下整个 .driveDetails 被 display:none（globals.css:2655-2661）；≤820px 时文件夹树子级也被 display:none（globals.css:2716-2718）
- **问题：** HTML5 drag 事件在触屏上根本不触发（iOS/Android 均不映射触摸为 dragstart），所以手机/平板上永远无法移动文件；双击在 iOS Safari 上通常被双击缩放吃掉、dblclick 不可靠，而 1081px 以下详情面板又没了——手机上点一个文件只有一圈高亮，预览和「打开原文件」入口双双消失，资料库在手机上退化成只能看文件名。这直接违背「访达/资源管理器式资料库」的多平台目标
- **建议：** 两处改动：(1) 给每行工具区加一个「移动到…」按钮（或长按/更多菜单），弹出现有文件夹树选择器后调 moveAssetAction/moveFolderAction——数据层已齐备，纯 UI 工作；(2) ≤1080px 时把 driveDetails 改为点击行后从底部弹出的 bottom sheet（复用 mobileMoreSheet 的样式模式），把预览/重命名/删除/移动都收进去，同时把行的单击行为改为直接打开详情。这也顺带解决键盘用户无法移动文件的问题

#### [🔴 high · 工作量 M] PDF 预览用 iframe 直嵌，在 iOS Safari 只显示第一页、部分 Android Chrome 直接触发下载

- **现状：** AssetViewer.tsx:65 对 PDF 用 <iframe src={url}>，样式侧 .viewer-pdf 设 overflow:hidden 全靠浏览器内建查看器（globals.css:4810-4818）
- **问题：** iframe 内嵌 PDF 依赖浏览器内建查看器：iOS Safari 在 iframe 里渲染 PDF 只画第一页且不可滚动（多年未修的已知行为）；Android Chrome 无内建 inline PDF 查看器时会把 iframe 源当下载处理。备考资料大量是 PDF 讲义/真题，等于手机端资料库最重要的文件类型无法在站内看
- **建议：** 引入 pdfjs-dist 做 canvas 渲染（自托管无 CDN 依赖，符合部署形态），按页懒加载 + 手势缩放；工作量在意 pdf.js 体积的话，退一步的最小修复是在触屏设备上检测 kind==="pdf" 时不渲染 iframe，改为大按钮「在新标签页打开」（顶层标签页里 iOS Safari 的 PDF 查看是完整的），这半天可完成

#### [🟡 medium · 工作量 S] 全站表单控件 font-size < 16px，iOS Safari 聚焦时整页自动放大

- **现状：** .field input/textarea/select 等统一 font-size:14px（globals.css:364-371），taskCreate select 12.5px（globals.css:1184）、noteCard textarea 13.5px（globals.css:1232）；layout.tsx 未导出 viewport（Next 默认注入 width=device-width, initial-scale=1，不含 maximum-scale），也没有任何 text-size-adjust 处理
- **问题：** iOS Safari 对 font-size <16px 的输入控件聚焦时会自动 zoom 到 16px 等效比例，页面被放大后不会自动缩回，用户每次记任务/写日志/收纳备注都要手动捏合还原——今日工作台和收纳面板全是输入框，这是手机端最高频的烦扰之一
- **建议：** 在 @media (max-width:820px)（或 pointer:coarse）内把所有 input/textarea/select 的 font-size 提到 16px（设计上可接受的话直接全局 16px 最省事）。不要用 maximum-scale=1 去压制（Android 上会禁用无障碍缩放，且 generate-viewport 文档 node_modules/next/dist/docs/.../generate-viewport.md:152-153 中该写法只是完整性示例）

#### [🟡 medium · 工作量 S] 收纳抽屉 height:100vh + position:fixed，iOS Safari 下底部「入库」按钮被浏览器工具栏遮挡

- **现状：** .capturePanel 基础规则 height:100vh; overflow-y:auto（globals.css:205-206），窄屏抽屉态叠加 position:fixed; top:0（globals.css:2618-2630, 3070-3083）后 height:100vh 仍生效；而项目其他地方已经正确使用 100dvh（globals.css:667, 3936）和 100svh（globals.css:3491）
- **问题：** iOS Safari（及 Android Chrome 地址栏可见时）100vh 比可视视口高约 50-100px，固定定位的抽屉底部——恰好是主操作「入库 N 个文件」按钮（CapturePanel.tsx:414-417）和提示文字——被浏览器底栏盖住，需要先在面板内滚动才能看到，手机拍照收纳这条黄金路径被打断
- **建议：** 把 .capturePanel 的 height 改为 100dvh（有 fallback 需求就 height:100vh; height:100dvh 两行），或在 fixed 态用 inset:0 auto 0 auto + bottom:0 替代显式 height；顺带给 .sidebar 的 height:100vh（globals.css:83）做同样处理（虽然它在 ≤820px 隐藏，平板横竖屏切换时仍可能受影响）

#### [🟡 medium · 工作量 S] 触屏点击目标普遍低于 24px 最低标准：行内工具按钮实际命中区约 23px

- **现状：** .driveRowTools button 为 13px 图标 + padding:5px ≈ 23×23px（globals.css:2119-2127，FileExplorer.tsx:394/405 icon size=13），移动端还把它设为常显（globals.css:2732-2734）作为主要操作入口；知识点行的星标/删除同为 size=13（SubjectWorkbench.tsx:341, 356），章节上移/下移 size=14（SubjectWorkbench.tsx:212-221）
- **问题：** WCAG 2.5.8 最低 24×24px、Apple HIG 建议 44×44pt；在手机上这些按钮是重命名/删除/移动的唯一入口（详情面板已隐藏），误触删除按钮的代价还叠加在 confirm 弹窗上，单手操作命中率很低
- **建议：** 在 @media (pointer: coarse) 里给 .driveRowTools button、.chapterTools button、.pointLine 的 examStar/iconDanger 统一 min-width/min-height:40px（图标可保持小，扩 padding 即可），行高相应放宽；这个 media query 项目里已有先例（globals.css:2664）

#### [🟡 medium · 工作量 M] 日历页 FullCalendar 月视图无窄屏策略，390px 下 7 列格子 + 每天最多 5 个事件挤成不可读

- **现状：** CalendarView.tsx:24-32 固定 initialView="dayGridMonth"，headerToolbar 一行塞 prev/next/today + 标题 + 三个视图切换按钮；每天最多推 5 个事件条（学习/资料/复习/错题/已总结，CalendarView.tsx:14-18）；globals.css 对 .calendarShell 的响应式覆写只有 border-radius（globals.css:4514-4516），未引入 @fullcalendar/list（package.json 只有 daygrid/timegrid/interaction）
- **问题：** 390px 宽下每列约 50px，事件条「学习 60m」被截断成噪点，工具栏按钮换行挤压；timeGridWeek 在手机上更是横向不可用。日历是本系统的主导航隐喻，手机端却是全站最差的一页
- **建议：** 安装 @fullcalendar/list，用 useEffect + matchMedia('(max-width:760px)') 在窄屏把 initialView 切为 listMonth、headerToolbar 精简为 prev,next / title，dateClick 语义不变；或者更轻：窄屏下自绘一个每行一天的密度列表（数据 getCalendarSummaries 已是按天聚合，甚至不需要 FullCalendar）

#### [🟡 medium · 工作量 M] responsive-audit.mjs 覆盖缺口：5 个页面不测、无触屏仿真、Chromium 探测只认 macOS 路径

- **现状：** 脚本只测 login//（主页）/day/assets/subjects 列表五处（responsive-audit.mjs:21-30），calendar、subjects/[code]（知识详情，含行内展开表格）、mistakes、analytics、settings 全部不在断言范围；page 未启用 hasTouch/isMobile/deviceScaleFactor（responsive-audit.mjs:18 只是 setViewportSize）；findChromiumExecutable 的候选路径全是 /Applications/... 的 macOS 路径（responsive-audit.mjs:140-145），Windows 上必然落空
- **问题：** 恰恰是问题最多的页面（calendar 挤压、subjects/[code] 的 pointLine 网格在 760px 的降级、analytics 的 weekBars）没有回归保护；不带触屏仿真意味着 pointer:coarse 分支（cameraButton）和 touch 交互路径永远测不到；headless Chromium 用 overlay 滚动条，body 的 max-width:100vw（globals.css:29）在 Windows 经典滚动条下可能产生的 1 条水平溢出也测不出来
- **建议：** (1) 给 auditPage 补 calendar/mistakes/analytics/settings/subjects/[code] 各断点；(2) 用 browser.newContext({ ...devices['iPhone 14'] }) 增加一轮真触屏仿真，至少断言 cameraButton 可见、mobileMoreSheet 内每个目标 boundingBox ≥40px；(3) findChromiumExecutable 增加 Windows 候选（如 C:/Program Files/Google/Chrome/Application/chrome.exe）或干脆信赖 playwright 自带浏览器

#### [🟡 medium · 工作量 S] 资料库文件行对键盘完全不可达：div+onClick 不可聚焦，选中/预览/打开无键盘路径

- **现状：** 文件行是 <div role="row" onClick/onDoubleClick>（FileExplorer.tsx:343-357），无 tabIndex、无 onKeyDown；行内 span.driveName（FileExplorer.tsx:373-377）不是按钮（文件夹行的名称是 button，FileExplorer.tsx:318 反而可达）；移动文件如前述只有拖拽
- **问题：** Tab 键在文件列表里只能落到每行的重命名/删除小按钮上，无法选中文件、无法触发预览或打开——桌面键盘流用户（以及屏幕阅读器用户）在资料库里只能删东西不能看东西，与「访达式体验」目标相悖（访达全键盘可操作）
- **建议：** 把 driveName 的文件名统一改为 button（点击=选中，Enter/再次点击=预览），或给行 div 加 tabIndex={0} + onKeyDown(Enter→预览, F2→重命名, Delete→删除)；配合发现 #2 的「移动到…」菜单即可补齐键盘移动。role=row 应挂在 role=table 的合法结构里（当前 role 用法本身也不符合 ARIA grid 语义，可顺手改成 listbox/option）

#### [🟡 medium · 工作量 S] 桌面端资料库不支持从 OS（资源管理器/访达）拖文件进来上传，拖错位置还会导致浏览器直接打开文件离开页面

- **现状：** FileExplorer 的 onDrop 只消费内部 dragRef（FileExplorer.tsx:141-152），event.dataTransfer.files 完全没读；driveMain/driveTable 容器层没有 dragover/drop 拦截，只有行和树节点各自 preventDefault（FileExplorer.tsx:297, 473）；OS 拖入上传目前只在收纳面板里支持（CapturePanel.tsx:184-189）
- **问题：** 桌面用户最自然的动作——把 PDF 从资源管理器拖到资料库当前文件夹——不仅不上传，若松手落在行间空白或表头处，浏览器默认行为会直接导航到该本地文件，工作现场丢失。这与「访达/资源管理器式」目标的差距很直观
- **建议：** 在 .driveMain 容器上加 onDragOver(preventDefault) + onDrop：若 dataTransfer.files 非空则复用 uploadFiles 的循环逻辑上传到 explorer.currentPath（拖到某个文件夹行上则传该行 path），内部移动与外部上传用 dragRef.current 是否为 null 区分即可；再加一个 isDraggingOver 高亮态与收纳面板视觉一致

#### [🟢 low · 工作量 S] iOS 手机浏览器上「粘贴截图」路径失效，只能靠相机/相册按钮兜底

- **现状：** 全局 window paste 监听（CapturePanel.tsx:57-78）与面板 onPaste（CapturePanel.tsx:277）都依赖 clipboardData.files；桌面 Chrome/Edge/Firefox/Safari 均工作。收纳面板另有拍照（capture=environment）和文件选择兜底（CapturePanel.tsx:420-421）
- **问题：** iOS Safari 只在可编辑元素获得焦点且用户从系统菜单选「粘贴」时才派发 paste 事件，且对图片剪贴板支持不完整——window 级监听在 iOS 上基本不会触发，用户在手机上截图后想粘贴入库会发现没反应，而界面文案「拖拽文件到这里、粘贴截图」（CapturePanel.tsx:289）在触屏上是双重误导
- **建议：** 在 pointer:coarse 环境把 dropZone 文案改为「点击选择文件或拍照」；可选增强：在收纳面板加一个「从剪贴板读取」按钮走 navigator.clipboard.read()（iOS 16.4+ 支持，需用户手势触发），失败时降级提示用相册选择

#### [🟢 low · 工作量 S] 桌面平台差异细节：Windows 用户看到「⌘ K」快捷键提示；滚动条样式未统一，Windows 经典滚动条下有溢出风险

- **现状：** TopBar 搜索按钮硬编码 <kbd>⌘ K</kbd>（TopBar.tsx:46），命令面板实际同时支持 Ctrl+K（CommandPalette.tsx:38）；全站自定义滚动条只有一处 scrollbar-width:thin（globals.css:3938），sidebar/capturePanel/viewerBody 等 overflow 容器在 Windows Chrome/Firefox 显示系统默认宽滚动条，与朱砂手帐视觉不搭；body 设 max-width:100vw（globals.css:29），Windows 经典（非 overlay）滚动条下 100vw 含滚动条宽度，可能出现约 15px 的水平溢出
- **问题：** Windows 是用户自己的主力平台（开发环境即 Win11），⌘ 符号对 Windows/Linux 用户无意义；100vw 问题在 headless 审计中测不出（overlay 滚动条），真机上偶发底部横向滚动条
- **建议：** (1) 用 navigator.platform/userAgentData 判断显示 Ctrl K 或 ⌘ K（一处三行改动）；(2) body 的 max-width:100vw 直接删掉（有 min-width:0 的 grid 布局已足够防溢出）或改 overflow-x:clip；(3) 给主要滚动容器统一加 scrollbar-width:thin + scrollbar-color（现代 Chrome/Edge/Firefox 都支持标准属性，无需 ::-webkit 前缀双写）


### 学习产品专家

**总评：** 整体的「待处理队列 → 任务 → 快速记录 → 晚间总结 → 明日第一步」骨架完整且交互细节用心（撤销、键盘评分、计划回声、清零正反馈都是同类产品少见的好设计）。但间隔重复引擎存在三处硬伤：新知识点没有进入复习管线的入口（不出错题就永远不复习）、每日队列截断时层级排序方向反了（'了解'级排在'精通'级前面）、遗忘后一次答对即跳回最长间隔。错题回炉的毕业条件也过松（隔天一次答对即毕业）。作为备考系统，检索练习内容（闪卡问答）、考前冲刺模式和模拟考记录是明显缺环。

**亮点：**
- 复习/回炉评分支持 8 秒内撤销，且用快照完整回写知识点状态，误触成本为零（src/lib/repo/reviews.ts:97-192, src/components/ReviewQueue.tsx:40-44,156-166）
- 「昨晚你说」计划回声 + 一键转任务 + 未完成任务顺延，把晚间'明日第一步'真正接回了次日早晨，闭环首尾相接（src/components/DayTasks.tsx:69-91, src/app/page.tsx:62-64）
- 每日复习上限（默认 12）防止积压压垮用户，并诚实提示「还有 N 个排在后面」（src/lib/repo/days.ts:71,95-105, src/components/ReviewQueue.tsx:150-152）
- 键盘 1-4 直接给队首评分，把单次复习操作成本压到一次按键，符合高频复习场景（src/components/ReviewQueue.tsx:102-125）
- 队列清零时的「毕」印章 + 完成次数回显，是明确设计过的'今日完成'正反馈时刻（src/components/ReviewQueue.tsx:128-139）
- 连续天数计算宽容：今天还没学不立刻断连击，从昨天起算，避免早晨打开就看到 streak 归零的挫败（src/lib/repo/stats.ts:44-46）
- 统计页弱点优先级给出可解释的 reasons（层级/掌握度/到期/错题/真题），不是黑盒分数（src/lib/repo/stats.ts:256-268）
- 全站日期统一 Asia/Shanghai 时区的 dateKey，排期比较用字符串序，无时区漂移隐患（src/lib/dates.ts:1-9, src/lib/repo/days.ts:98）

**发现：**

#### [🔴 high · 工作量 M] 新知识点没有进入复习管线的入口：不出错题就永远不会被复习（冷启动断点）

- **现状：** knowledge_points 的 next_review 只在两处被写入：applyReviewOutcome（src/lib/repo/reviews.ts:289-299）和 applyMistakeOutcome（reviews.ts:315-328）。createPoint 初始 status='未学'、next_review=NULL（src/lib/repo/knowledge.ts:473-492，UI 显示「未排期」SubjectWorkbench.tsx:348）。而 UI 中 scoreReview 唯一调用点是 ReviewQueue（src/components/ReviewQueue.tsx:50），该队列只显示 next_review 已到期的点（src/lib/repo/days.ts:95-101）；记学习 createStudySession 完全不触碰 knowledge_points（reviews.ts:25-47）。
- **问题：** 间隔重复的核心是「学完新内容 → 进入 D+1/D+3/... 复习序列」，但当前一个知识点除非被错题挂上（且错题几乎无法关联知识点，见另一条），否则永远不会出现在复习队列。等于间隔重复只对错题生效，'学过的东西按遗忘曲线巩固'这个主循环根本没有入口，是整个闭环最大的断点。
- **建议：** 在 SubjectWorkbench 的知识点行加「今天学了」按钮（调用 createReviewEvent 或直接设 status='学习中'、next_review=D+1）；同时让带 knowledgePointId 的 createStudySession 自动把该点排入 D+1 首次复习。这样新学内容当天记录即自动进入次日队列。

#### [🔴 high · 工作量 S] 每日队列截断时的层级排序方向反了：'了解'级排在'精通'级前面

- **现状：** src/lib/repo/days.ts:99 到期复习用 `ORDER BY tier ASC, next_review ASC` 排序后 LIMIT 12。tier 取值 'r'(精通)/'y'(掌握)/'g'(了解)（src/lib/types.ts:39-43），字典序 ASC 结果为 g < r < y，即「了解」级最先出队、「掌握」级垫底。而 stats.ts:259 的权重 r=30 > y=18 > g=8 证明设计意图是 r 最优先。
- **问题：** 平时队列不满看不出来；一旦积压超过每日上限（备考中断几天很常见），截断后展示的 12 个恰恰是最不重要的'了解'级知识点，核心考点反而被挤出当日队列，直接损害有限复习时间的投资回报。
- **建议：** 改为 `ORDER BY CASE tier WHEN 'r' THEN 0 WHEN 'y' THEN 1 ELSE 2 END, next_review ASC`，并考虑把掌握度低、逾期久的排前（如再加 mastery ASC）。一行 SQL 修复，建议顺手补一条积压截断顺序的测试。

#### [🔴 high · 工作量 M] 遗忘后间隔不重建：失败也累加 reviews 计数，下一次答对直接跳回 30 天

- **现状：** applyReviewOutcome 中 reviews = point.reviews + 1 无论评分高低都递增；score<=1 时 next_review 用阶梯 index 0（明天），但下次 score>=2 时用 nextReviewDate(day, reviews)（src/lib/repo/reviews.ts:286-289），阶梯 [1,3,7,16,30] 按总复习次数取值且封顶（src/lib/review-schedule.ts:1-8）。例：已复习 6 次的点评「忘了」→ 明天重来，明天评「基本会」→ reviews=8 → 直接排 30 天后。
- **问题：** SM-2 对失败会重置 repetition 计数并降低 ease，让间隔从 1 天重新爬梯；FSRS 会显著下调 stability。当前实现里一次遗忘后只需一次'基本会'就跳回最长间隔，遗忘的记忆得不到密集重建，恰恰是备考最危险的假掌握来源。此外评 2（基本会）和评 3（熟练）产生完全相同的间隔，评分粒度浪费。
- **建议：** 给 knowledge_points 增加 interval_step（连续成功次数）字段替代用总 reviews 取阶梯：score<=1 重置为 0，score=2 +1，score=3 可 +1 并乘 1.3 左右的系数或跳一级。迁移成本低（现有 reviews 字段保留做统计）。

#### [🔴 high · 工作量 M] 错题毕业条件过松：隔天一次「已会」即毕业，且回炉间隔恒为 1 天

- **现状：** reattemptMistake 中 score>=2 即 graduated=1（src/lib/repo/reviews.ts:213-214），UI 只提供「仍错(1)/已会(3)」两键（src/components/MistakeReattempt.tsx:36-41, ReviewQueue.tsx:207-214）；未毕业时 nextReview 恒为 nextReviewDate(day, 0)=D+1（reviews.ts:70,214）。而错题本页文案宣称「答对两级即毕业」（src/app/mistakes/page.tsx:21），与单次即毕业的实现不符。
- **问题：** 错题创建次日（记忆最新鲜时）答对一次就永久毕业，无法区分「短期记住了」和「真正修复了错因」——这正是错题反复重犯的经典原因。间隔重复文献里 lapse 恢复通常要求 2+ 次跨间隔成功。同时错题若一直答错永远 +1 天，与知识点阶梯不一致。
- **建议：** 引入 pass_count：第一次「已会」排 D+4 再考一次，第二次通过才毕业；「仍错」重置 pass_count 并保持 D+1。顺带修正错题本页文案与实现一致。可选：毕业时若关联知识点，把该点 next_review 拉近做一次确认复习。

#### [🟡 medium · 工作量 L] 复习卡片没有可回忆的内容，检索练习退化为「看标题自评」

- **现状：** knowledge_points 表只有 title/tier/status 等元数据，没有任何内容字段（src/lib/db.ts:55-69）；ReviewQueue 卡片只展示「科目·层级·掌握度 + 标题」四个评分键（src/components/ReviewQueue.tsx:168-193），关联资料/错题要去科目页展开才能看（SubjectWorkbench.tsx:359-399）。
- **问题：** 间隔重复起效的前提是主动检索（retrieval practice）：先尝试回忆，再对照答案自评。当前只有标题没有'问题—答案'结构，用户很容易扫一眼标题就点「熟练」，产生系统性高估的假掌握，进而让 30 天长间隔建立在虚假评分上。
- **建议：** 给知识点加 prompt/answer（或 notes）字段，队列卡片做两段式：先显示问题 →「显示答案」→ 再评分（Anki 模式）；短期低成本方案是把该点关联的最近错题和资料缩略内联到卡片里，至少给回忆一个锚点。

#### [🟡 medium · 工作量 M] 错题在 UI 上无法关联知识点，回炉结果不回写掌握度，且页面文案与事实不符

- **现状：** addMistake 支持 knowledgePointId（src/app/actions/day.ts:60-66），但唯一入口 QuickLog 只有科目下拉（src/components/QuickLog.tsx:114-122），CapturePanel 只处理资料关联（CapturePanel.tsx:203）。因此 reattemptMistake 中回写知识点的分支（reviews.ts:226-234）实际永远不触发；错题本页却写着「新错题…会自动关联科目和知识点」（src/app/mistakes/page.tsx:78）。
- **问题：** 错题是备考中最强的弱点信号，现在这个信号进不了知识体系：错题不压低对应知识点掌握度、不触发该点提前复习，统计页弱点优先级里的 openMistakes 权重（stats.ts:261）也几乎总是 0。知识体系「驱动复习优先级」的设计只剩一半。
- **建议：** QuickLog 错题模式选了科目后级联出章节/知识点选择（getCaptureHierarchy 已提供现成层级数据，src/lib/repo/knowledge.ts:214-247）；对未关联的存量错题，在错题本提供补挂知识点的入口。同时修正错题本页文案。

#### [🟡 medium · 工作量 M] 到期积压没有恢复策略，中断几天后用户只能面对一个不断增大的数字

- **现状：** 逾期知识点的 next_review 停留在过去日期，每天仍只按上限 12 出队（src/lib/repo/days.ts:71,95-105），其余只以「还有 N 个排在后面」提示（ReviewQueue.tsx:150-152）和统计页积压计数（stats.ts:219-226）呈现，没有任何主动处置手段。
- **问题：** 备考者生病/考试周中断 3-5 天很常见，积压到 50+ 后按每日 12 个要一周才能清完，且这期间新到期的还在进来。积压数字只增不减会造成'回避感'，是间隔重复产品用户流失的头号原因（Anki 社区大量讨论、FSRS 专门提供 postpone/advance 工具）。
- **建议：** 加「补救模式」：一键把 g 级/高掌握度的逾期点顺延 N 天（相当于 FSRS postpone），把复习火力集中在 r/y 级；或在积压超过阈值时临时把每日上限翻倍并在 UI 明示'清欠进度 12/47'。

#### [🟡 medium · 工作量 M] 晚间总结/明日第一步没有触发时刻，闭环收尾环节最容易被跳过

- **现状：** DayJournal 是页面底部的被动 textarea（src/components/DayJournal.tsx:52-75），自动保存做得好但没有任何引导；复习清零的「毕」印（ReviewQueue.tsx:128-139）和任务完成的空状态（page.tsx:92-100）都不指向'该写总结了'；复盘率只在统计页事后呈现 reflectionDays（stats.ts:181-185）。
- **问题：** 「明日第一步」是这个系统次日启动力的来源（首页 heroTitle 和 DayTasks 的计划回声都依赖它），但写它的动作排在一天最疲惫的时刻、页面最底部、无任何提示——摩擦最大、价值最高的一步恰恰最容易断。一旦当晚没写，次日的「昨晚你说」回声整条链路失效。
- **建议：** 在当日队列清零或最后一个任务勾掉时，于 day 页浮出轻量「收个尾：一句总结 + 明天第一步」卡片（两个输入框直接内联，不跳转）；连续 N 天有 tomorrow 记录可纳入 streak 或单独的复盘连击。

#### [🟡 medium · 工作量 L] 考试倒计时与排期/优先级完全脱钩，缺考前冲刺模式和模拟考记录

- **现状：** 考试倒计时仅是首页展示的 chip（src/app/page.tsx:48-52, src/lib/repo/settings.ts:43-54），不影响任何排期：review-schedule.ts 阶梯固定封顶 30 天，弱点优先级评分（stats.ts:258-261）不含'距考试天数'因子；全站无计时做题/模拟考成绩记录（study_sessions 只有 duration_minutes，db.ts 无 mock/score 类表）。
- **问题：** 备考系统区别于通用记忆工具的核心就在'考试日期约束排期'：考前 10 天把一个知识点排到 30 天后等于宣告弃考该点；缺少限时真题演练记录，也就无法暴露'会做但太慢'这类考场致命弱点，弱点分析停留在记忆维度。
- **建议：** 最小改动：nextReviewDate 增加可选 examDate 参数，间隔上限取 min(阶梯值, 距考天数/2)；weakPoints 评分给 exam=1 的点随倒计时递增权重。进阶：加'模拟考'记录（科目+用时+得分），倒计时 ≤14 天时首页切冲刺视图（只推 r/y 级到期 + 未毕业错题 + 模考安排）。

#### [🟢 low · 工作量 M] 正反馈只有零散瞬间，缺'今日完成'仪式和里程碑，激励密度不足以支撑长期备考

- **现状：** streak 只是首页一个数字（src/app/page.tsx:74），无里程碑（7/30/100 天）、无历史最长纪录；day 页顶部状态条是纯数字（day/[date]/page.tsx:60-66）；统计页只有 7 天窗口 + 周环比（stats.ts:161-216），没有周复盘引导或月度视图；复习清零有「毕」但一天全部收尾（任务+复习+总结）没有汇总性完成时刻。
- **问题：** 备考周期以月计，行为科学上单调的即时反馈会快速钝化；「今日全部完成」的汇总画面和阶段性里程碑（连续 7 天、错题毕业 50 道、某科目掌握 80%）是维持长期坚持最廉价有效的手段，当前基本空缺。
- **建议：** 低成本三件套：1) day 页在任务+队列+总结三者齐活时显示当日'战报'（分钟数/评分分布/streak+1）；2) streak 里程碑 toast + 历史最长纪录；3) 每周一首页插入'上周复盘'卡片（复用 getLearningAnalytics 的周数据，引导写一句周总结）。


### 文件管理与信息架构专家

**总评：** 现状：资料库已经是一个"单一列表视图 + 左侧文件夹树"的类资源管理器（src/components/FileExplorer.tsx，517 行单组件）：URL 用 ?folder=path 导航（page.tsx:18-21），有面包屑（FileExplorer.tsx:219-228）、单击选中/双击预览或新窗口打开（343-356）、新建/重命名/删除文件夹、文件重命名/删除、HTML5 拖拽移动（文件→文件夹、文件夹→文件夹）、文件名搜索、按名称/大小/日期排序；预览支持图片/PDF/Markdown/纯文本四类（AssetViewer.tsx:21-31）。数据层质量高：folders 表按 workspace 隔离且有 (workspace_id, parent_path, path) 索引，重命名/移动子树在事务里整体改写路径；文件端点已有 Range/ETag/immutable 缓存。主要差距在于：只有一种列表视图（无网格/分栏）、完全没有缩略图（详情面板直接加载原图）、无多选与批量操作、无右键菜单、外部文件拖入页面不能上传、资料与知识点的关联只能在上传时设置且后期不可编辑。多视图和缩略图是当前收益最大的两件事，且现有数据模型无需改动即可支撑。

**亮点：**
- 文件下载端点工程质量很高：单段 Range 解析（206/416）、基于内容哈希的强 ETag + If-None-Match 304、private immutable 长缓存、RFC 5987 的 filename* 中文文件名处理（src/app/api/assets/[id]/file/route.ts:53-94，src/lib/assets.ts:84-100），这套响应头为视频流式播放和缩略图缓存打好了地基
- 内容寻址存储做得规范：blob 按 sha256 去重存储、ref_count 引用计数、删除文件保留 blob 供复用、配额按去重后字节统计（src/lib/repo/library.ts:216-233、328-343，src/lib/assets.ts:21-27），还有配套 GC 脚本（package.json 的 gc:blobs）
- 文件夹子树重命名/移动在单个事务里整体改写 folders.path、parent_path 和 assets.folder_path，并做了循环移动校验（不能移入自己子目录）和同名冲突检查（src/lib/repo/library.ts:108-184）
- 资源管理器交互底子已具备：文件夹树 + 面包屑 + 双击预览 + 拖拽移动 + 行内重命名（Enter/Escape 键盘处理）+ 可排序列头（FileExplorer.tsx:76-93、268-315、343-356）
- Markdown 预览用 React 元素渲染而非 innerHTML，无 XSS 面；不安全协议链接降级为纯文本（src/components/AssetViewer.tsx:117-244）
- 服务端按扩展名纠正 MIME（防浏览器把代码文件标错），Content-Disposition 用白名单决定 inline/attachment，SVG 等可执行类型默认 attachment 规避了存储型 XSS（src/lib/assets.ts:84-95、112-144）
- folders/assets 都有 workspace 维度复合索引（src/lib/migrations.ts:324-325），getExplorer 的子树文件计数在应用层一次聚合完成（src/lib/repo/library.ts:255-264），当前规模下无性能隐患

**发现：**

#### [🔴 high · 工作量 L] 多视图（列表/大图标网格/分栏）：数据模型已就绪，缺的只是前端形态与组件拆分

- **现状：** 只有一种视图：五列表格行（.driveRow 的 grid-template-columns，globals.css:2010-2016），由 517 行的单体组件 FileExplorer.tsx 渲染。视图形态硬编码，无切换器、无偏好记忆。数据侧 getExplorer 已返回 tree/folders/files/breadcrumbs 全量（src/lib/repo/library.ts:235-308），folders 表 (workspace_id, path, name, parent_path) 带索引（migrations.ts:459-467、325）。
- **问题：** 备考资料里图片（拍照笔记、错题截图）占比高，列表视图只有 16px 图标（FileExplorer.tsx:360、374），找一张图必须逐个点开；深层目录在列表视图里来回跳转效率低。这正是访达提供图标/列表/分栏多视图的原因：不同资料形态适合不同视图。
- **建议：** (a) 共存切换：在 driveToolbar 的搜索框左侧放三段式 segmented 切换器（项目已有 .segmented 样式，globals.css:578），视图偏好写 localStorage（键如 assets:viewMode，纯客户端偏好不必进 app_settings 表；跨设备同步是加分项可后做），URL 不携带视图参数以保持链接简洁。(b) 建议三种视图——列表视图（保留现状，适合按大小/日期排序整理）、大图标网格视图（repeat(auto-fill, minmax(140px,1fr))，文件夹与文件混排、图片显示缩略图、其他类型按 previewKind 显示大图标+扩展名徽标，适合浏览图片类资料，优先做）、分栏视图（Miller columns，每列一层目录、单击逐列展开、最右列显示选中文件详情+预览，适合深目录结构快速横移；实现时每列复用 folders 的 parent_path 查询即可，可作二期）。(c) 导航细节：面包屑已有；补充 Backspace/Alt+↑ 返回上级、方向键在网格中移动焦点、Enter 打开；网格视图沿用'单击选中、双击进入/预览'，与现有列表行为（343-351）一致。(d) 数据模型完全够用，唯一 API 变化是新增缩略图端点（见下条）；分栏视图可直接用现有 getExplorer 按 ?folder= 逐列取，或加一个轻量 /api/library/children?path= 避免整页刷新。(e) 组件拆分：FileExplorer 收敛为壳（工具栏+树+详情+选择状态），抽出 ListView/GridView/ColumnView 三个展示组件，共享 useSelection、useDragMove 两个 hook 和 FileIcon/FolderCard 原子组件；排序、重命名、删除回调从壳下传，避免三份重复逻辑。

#### [🔴 high · 工作量 M] 完全没有缩略图机制：详情面板直接加载原图，网格视图的硬前提缺失

- **现状：** 图片在详情面板用 <img src="/api/assets/{id}/file"> 加载全尺寸原文件（FileExplorer.tsx:425），预览弹层同样（AssetViewer.tsx:63）。package.json 无 sharp 等图像库，代码库中无任何 thumbnail/resize 逻辑。
- **问题：** 单文件上限 20MB（src/lib/limits.ts:2），手机拍照的笔记轻松 3-8MB；网格视图一屏 30 个缩略图若都拉原图等于一次拉几十上百 MB，自托管小水管下不可用。immutable 缓存只救第二次访问，首次浏览体验决定网格视图成败。
- **建议：** 引入 sharp（better-sqlite3 已证明项目接受原生依赖，Docker 里 npm install 即可），新增 GET /api/assets/[id]/thumbnail：按需生成 256px WebP，落盘到 uploadRoot 的 <workspace>/thumbs/<sha2>/<sha256>.webp（与 blobs 目录结构对齐，天然按内容去重——同一 blob 的多个 asset 共享一份缩略图）；生成后复用现有 ETag/immutable 响应头逻辑（file/route.ts:53-68 可抽公共函数）；非图片类型返回 404 由前端回退到类型图标；PDF 首页缩略图二期再说（需 pdfium/ghostscript，不必现在背）。注意 gc-blobs 脚本要同步清理孤儿缩略图。

#### [🔴 high · 工作量 M] 在线预览：图片/PDF/文本/Markdown 已覆盖，视频音频是低垂果实但被 Content-Disposition 挡住

- **现状：** previewKind 支持 image/pdf/markdown/text 四类（AssetViewer.tsx:21-31），PDF 走浏览器原生 iframe（AssetViewer.tsx:65），文本 1MB 上限保护（AssetViewer.tsx:10、99-101）。视频/音频：previewKind 返回 "none"；contentDispositionFor 的 inline 白名单不含任何 video/*、audio/*（assets.ts:85-94），新窗口打开会直接触发下载；EXTENSION_MIME_TYPES 也没有 mp4/mp3/m4a/webm（assets.ts:113-138）。而文件端点的 Range 支持（file/route.ts:71-89）其实已经为 <video> 流式拖动进度条准备好了。
- **问题：** 备考场景常有网课片段、听力音频；后端能力（Range+缓存）已就位，只差前端 <video>/<audio> 标签和响应头白名单三行改动，性价比极高。Office 文档则相反：自托管无 Office Online，onlyoffice/collabora 需常驻数百 MB 内存容器，对单人自托管不划算。
- **建议：** 优先级排序：P0 视频/音频——inline 白名单加 video/mp4、video/webm、audio/mpeg、audio/mp4、audio/wav，扩展名表补 mp4/webm/mov/mp3/m4a/wav，previewKind 加 "video"/"audio" 分支，AssetViewer 渲染 <video controls>/<audio controls>（半天内完成，但注意 20MB 上传上限会限制视频用途，见批量上传条）。P1 PDF 增强——原生 iframe 在 iOS Safari 只显示第一页，若移动端看 PDF 是刚需再自托管 pdf.js viewer（CSP 内自包含）。P2 Office——不建议做在线预览，退而求其次：上传 docx/pptx/xlsx 时提示'不支持预览'，详情面板给显眼的下载按钮即可；确有需求时用后台 LibreOffice headless 离线转 PDF 存为衍生文件，而非实时预览服务。

#### [🟡 medium · 工作量 M] 无多选/批量操作/右键菜单：选择模型是单选，整理大量资料时效率低

- **现状：** 选择状态是单个 selectedFileId（FileExplorer.tsx:46），无 Ctrl/Shift 多选、无框选；操作按钮以每行悬浮工具（driveRowTools，385-407）呈现，无右键菜单；删除/移动只能逐个做；deleteFolder 拒绝删除非空文件夹（library.ts:186-197），叠加无批量删除，清理一个有 30 个文件的文件夹要点 60 次确认。
- **问题：** 资源管理器范式的核心价值就在批量整理：多选后拖拽移动、Delete 键批量删、右键就地操作。当前模型下'整理旧资料'这类高频备考动作成本过高，非空文件夹删除更是死路。
- **建议：** 分两步：第一步（S）把 selectedFileId 改为 Set<number>，支持 Ctrl/Cmd 点击加选、Shift 范围选、Esc 清空，工具栏出现'已选 N 项：移动/删除'批量条，后端加 moveAssetsAction/deleteAssetsAction（在事务里循环现有 moveAsset/deleteAsset 即可，repo 无需改）；顺带给 deleteFolder 加'连同 N 个文件一起删除'的二次确认分支。第二步（M）自定义右键菜单（onContextMenu，复用批量动作+重命名+预览+下载），框选（marquee）优先级最低可不做。多选状态也是网格视图的共享前提，建议在拆组件时一并做进 useSelection hook。

#### [🟡 medium · 工作量 S] 从操作系统拖文件进资料库页面不能上传，与'像网盘一样'的预期直接冲突

- **现状：** FileExplorer 的 onDragOver/onDrop 只处理内部 dragRef 载荷（141-152），dataTransfer.files 从未被读取；外部文件拖入页面时浏览器会直接导航到该文件。上传只能点'上传到当前目录'按钮走 <input type=file>（243-246、454）。而 CapturePanel（速记面板）反而实现了完整的拖入上传（CapturePanel.tsx:184-189）。
- **问题：** 拖文件进窗口是网盘类产品的第一直觉操作，用户明确要'像网盘一样'；且项目里已有现成实现可以抄。
- **建议：** 在 .driveMain 上加 dragenter/dragover/drop 监听（参照 CapturePanel 的 dragDepthRef 计数防抖，176-189），drop 时读 dataTransfer.files 复用现有 uploadFiles 逻辑传当前 folderPath，配全屏'松手上传到「当前文件夹」'高亮遮罩；注意与内部拖拽区分——dragRef.current 非空时是内部移动，跳过上传分支。

#### [🟡 medium · 工作量 M] 资料与学习流的关联只能在上传瞬间设置，资源管理器里无法补挂/改挂知识点

- **现状：** linkAsset 仅被 createAssetFromUpload 调用（library.ts:409-414），src/app/actions/library.ts 里没有任何编辑关联的 action；详情面板只读展示科目/知识点（FileExplorer.tsx:436-437）；从资料库上传时 formData 只带 folderPath（FileExplorer.tsx:169），意味着走资料库入口的文件永远没有科目关联。反向入口做得不错：知识点详情能列出关联资料（SubjectWorkbench.tsx:366-373，knowledge.ts:187）。
- **问题：** 这是学习系统区别于普通网盘的核心差异点：文件夹是物理组织，科目/章节/知识点是逻辑组织，理想状态是同一份资料两条路径都能到达。现在逻辑组织是'一次性写入、终身只读'，实际使用中上传时往往来不及选知识点，事后又补不了，asset_links 会长期稀疏，知识点页的'关联资料'功能随之空转。
- **建议：** (1) 详情面板加'编辑关联'：科目/章节/知识点三级选择器（数据源复用 CapturePanel 已有的选择逻辑），新增 updateAssetLinksAction（先 DELETE 该 asset 的 links 再重建，repo 已有 linkAsset 可复用）。(2) 在资源管理器加'按科目浏览'虚拟维度：树侧栏底部或视图切换器旁提供'科目视角'，用 asset_links 按 subject_code→chapter→knowledge_point 生成虚拟目录树（只读、不可拖入），让逻辑组织获得与物理文件夹同等的浏览体验。(3) 批量多选就绪后支持'批量挂知识点'，这是补旧账的关键路径。

#### [🟡 medium · 工作量 M] 移动端交互严重降级：拖拽是唯一的移动手段，触屏上无法移动文件

- **现状：** 移动文件/文件夹只能靠 HTML5 drag-and-drop（FileExplorer.tsx:141-152），触屏不触发 dragstart；≤820px 时子文件夹树被整体隐藏（globals.css:2716-2718），≤1080px 时详情面板隐藏（globals.css:2659-2661），后者导致'预览'按钮和文件元信息在平板/手机上不可达（只剩双击预览这个不易发现的入口）。
- **问题：** 用户关心多平台使用，备考场景手机/平板占比不低（拍题上传、床上翻资料）；当前移动端是只读浏览+上传，整理动作全部失效。
- **建议：** (1) 加'移动到…'对话框：文件行操作里加移动按钮，弹出文件夹树选择器（数据就在 explorer.tree），桌面端也受益（拖拽到深层目录本就费劲）。(2) 窄屏详情面板改为底部抽屉（点文件上滑出现），而非直接 display:none。(3) 右键菜单在触屏映射为长按。这三点都不需要后端改动。

#### [🟢 low · 工作量 S] 搜索只匹配文件名，笔记备注和知识点标题都搜不到

- **现状：** searchAssets 只对 a.original_name 做 LIKE（library.ts:321），assets.note 字段存了上传备注（library.ts:401）、knowledge_titles 在 SELECT 里但不在 WHERE 里；搜索结果上限 100 且无分页提示。
- **问题：** 拍照类资料文件名多是 IMG_2031.jpg 之类无意义串，真正可检索的信息在 note 和关联知识点里；文件名搜索对这类资料等于失效。
- **建议：** 短期（S）：WHERE 扩成 (original_name LIKE ? OR note LIKE ? OR EXISTS(知识点标题子查询))，命中字段在结果行标注来源。长期：若资料量上千再上 SQLite FTS5 虚表（better-sqlite3 原生支持），现在不必。另外搜索结果行双击预览已可用，但建议加'定位到所在文件夹'操作（跳转 ?folder= 并选中该文件）。

#### [🟢 low · 工作量 M] 上传为串行且 20MB 上限全内存缓冲，schema 里的分片上传表是未完成的半成品

- **现状：** 多文件上传逐个 await（FileExplorer.tsx:160-179），10 个文件要排队 10 轮；服务端 Buffer.from(await file.arrayBuffer()) 整文件进内存（assets.ts:37）；上限 20MB（limits.ts:2）。migrations.ts:118-125 建了 upload_sessions 表（status/received_bytes/expires_at 字段齐全），但全代码库没有任何 API 路由使用它——分片上传只建了表没写实现。
- **问题：** 20MB 上限直接封死了视频资料的可能性（与预览扩展条冲突）；串行上传让批量传几十张拍照笔记体验差；死表结构是维护噪音，会误导后来者以为已有分片能力。
- **建议：** 若决定支持视频：实现基于 upload_sessions 的分片上传（PUT 分片+完成时拼接算 sha256），上限提到 500MB，流式写盘替代全内存缓冲。若近期不做视频：把并发上传改为 Promise 池（并发 3）先解决体验（S），并在代码注释或迁移中明确 upload_sessions 的状态（保留待实现/删除），避免僵尸 schema。

#### [🟢 low · 工作量 S] getExplorer 的 exists 标志计算后从未消费：进入已删除文件夹得到伪空目录而非明确报错

- **现状：** getExplorer 返回 exists 字段（library.ts:237、307），但 FileExplorer.tsx 全文没有读取它；访问 /assets?folder=不存在的路径 会渲染一个正常外观的空文件夹（面包屑照常显示），此时'上传到当前目录'会经由 createAssetFromUpload→ensureFolderPath（library.ts:408）静默把这个幽灵路径重新创建出来。
- **问题：** 文件夹被删/改名后，旧书签或另一设备的旧标签页会静默复活已删除的目录结构，多用户/多设备场景下尤其容易产生'删了又出现'的困惑。
- **建议：** FileExplorer 消费 exists：false 时显示'此文件夹不存在或已被移动'占位页+返回根目录按钮，并禁用上传/新建；顺带把排序偏好（sortKey/sortAsc，54-55）持久化到 localStorage，目前每次导航都重置为按名称升序。


### 性能与缓存工程师

**总评：** 这套自托管 Next.js 16 应用的性能基础明显高于同类个人项目：资产分发有完整的 ETag/immutable/Range 管道，客户端路由缓存（staleTimes）+ 全路由骨架屏 + 导航预取已落地，SQLite 有 WAL 与成体系的 workspace 复合索引，Caddy 层压缩与静态缓存配置正确。当前剩余的优化空间集中在三处：根 layout 每请求全量序列化知识层级导致的普遍 over-fetching、Server Action revalidatePath 与 router.refresh() 叠加造成的每操作双往返、以及图片无缩略图直出原图。另有一个结构性缺口是完全没有性能度量手段，建议先补最小度量再继续调优，否则后续改进无法验证。

**亮点：**
- 静态文件缓存做得很到位：api/assets/[id]/file 有基于内容哈希的强 ETag、304 协商、private+max-age=31536000+immutable、单段 Range 支持（src/app/api/assets/[id]/file/route.ts:53-94）
- 客户端路由缓存三件套已落地：experimental.staleTimes{dynamic:30,static:180}（next.config.ts:8-14）、9 个路由段 loading.tsx 骨架、侧栏/移动导航 prefetch={true}（src/components/Sidebar.tsx:82,92,124），对应提交 9ebd8a0
- 零 webfont 成本：四个字体变量全部是系统字体栈（src/styles/tokens.css:57-60），没有任何字体下载阻塞首屏
- 反向代理层配置正确：Caddy encode zstd/gzip、/_next/static/* immutable 一年缓存、JSON access log（deploy/Caddyfile:7,13-14,26-29）
- SQLite 调优扎实：WAL + busy_timeout=5000 + synchronous=NORMAL（src/lib/db.ts:27-30），且各业务表都有 workspace_id 前缀的复合索引（src/lib/migrations.ts:308-337）
- getSubjectOverviews 用标量子查询替代三表 LEFT JOIN，并写明是为了避免笛卡尔扇出导致 AVG 失真（src/lib/repo/knowledge.ts:97-120），查询意识好
- 任务勾选已有乐观更新与失败回滚（src/components/DayTasks.tsx:149-163），复习评分有盖章动效 + 8 秒可撤销（ReviewQueue.tsx:40-61）
- 文本预览有 1MB 上限保护、Markdown 用零依赖 React 渲染无 XSS 面（src/components/AssetViewer.tsx:10,99-100,117）

**发现：**

#### [🔴 high · 工作量 M] 根 layout 每个请求都查询并序列化整棵知识层级，所有页面为收纳面板买单

- **现状：** src/app/layout.tsx:21-24 在 RootLayout 里对每次 RSC 请求调用 getCaptureHierarchy（src/lib/repo/knowledge.ts:214-247，拉取 workspace 全部 subjects+chapters+knowledge_points 标题），并把整棵树作为 props 传给客户端 AppShell → CapturePanel（src/components/AppShell.tsx:54）。
- **问题：** 全站每个页面（包括登录后每次 router.refresh，见下一条）都要执行这 3 条全量查询并把全部知识点标题序列化进 RSC payload。知识点体量按考纲通常上千条，payload 会显著膨胀，而 CapturePanel 只有在用户点开收纳面板时才需要这份数据。这是目前最普遍的 over-fetching 点，且随着知识体系增长线性恶化。
- **建议：** 二选一：(a) 把 hierarchy 从 layout props 移除，CapturePanel 首次打开时经 /api/knowledge 按需 fetch 并在客户端缓存；(b) 保留服务端注入，但用本版本已支持的 cacheComponents + `use cache` + cacheTag（node_modules/next/dist/docs/.../cacheComponents.md、cacheTag.md 已确认存在）包住 getCaptureHierarchy，在知识点增删的 action 里 revalidateTag 精确失效。方案 (a) 更简单且同时减小 payload。

#### [🔴 high · 工作量 S] Server Action 已 revalidatePath，客户端仍普遍追加 router.refresh()，每次操作双倍往返

- **现状：** 所有 planner action 都调用 revalidatePath(`/day/${day}`)（src/app/actions/planner.ts:26,37,53,64…），但客户端 report() 在成功后又调 router.refresh()：src/components/DayTasks.tsx:44-47、src/components/FileExplorer.tsx:81-85、src/components/ReviewQueue.tsx:58-61（后者还先 setTimeout 360ms 再 refresh）、SubjectWorkbench/DayNotes 等共 17 个文件 53 处。
- **问题：** 本版本文档（node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md『Server Functions: Updates the UI immediately (if viewing the affected path)』）确认 action 内 revalidatePath 已随 action 响应带回最新 RSC payload；随后的 router.refresh() 是第二次完整 RSC 请求（还会重跑 layout 的 getCaptureHierarchy）。勾选任务/评分复习的延迟感有相当一部分来自这次多余的往返。文档还注明 revalidatePath 目前会让所有已访问页面下次导航时重新拉取，等于每次点击也顺带作废了 staleTimes:30 的路由缓存。
- **建议：** 系统性删除 action 成功路径上的 router.refresh()（先在 /day 页验证 revalidatePath 单独生效），只在 action 未 revalidate 的场景保留；操作按钮改用 useTransition 的 isPending 提供等待反馈。ReviewQueue 的 360ms 人为延迟可保留盖章动画但不应阻塞数据刷新。

#### [🔴 high · 工作量 M] 图片全部原图直出：无缩略图、无懒加载，详情栏用原图当预览

- **现状：** src/components/FileExplorer.tsx:425 详情侧栏 <img src=`/api/assets/${id}/file`> 直接加载原图作小预览；src/components/AssetViewer.tsx:63 预览弹窗同样加载原图；两处均无 loading="lazy"/decoding="async"。服务端只有原文件流式响应（src/app/api/assets/[id]/file/route.ts），没有任何缩略图/降采样管道。
- **问题：** 备考场景大量是手机拍摄的笔记/试卷照片（数 MB），点选文件即触发全尺寸下载才能显示 200px 预览，弱网/移动端体验差且浪费流量。immutable 缓存只能救第二次访问，救不了首次。
- **建议：** 上传入库时用 sharp 生成按 sha256 内容寻址的缩略图（如 320px/1280px 两档）存 blobs 旁，file route 加 ?w= 参数分发，天然复用现有 ETag+immutable 管道与 GC 脚本；所有 <img> 补 loading="lazy" decoding="async"。这也是后续做资料库网格/图标视图（访达式多视图）的前置能力。

#### [🟡 medium · 工作量 M] 日历页无时间窗全量拉取整个历史，数据量随使用线性增长

- **现状：** src/lib/repo/stats.ts:93-115 getCalendarSummaries 对 daily_entries/assets/study_sessions/review_events/mistakes 各做一次不带日期范围的全 workspace 聚合；src/app/calendar/page.tsx:17 一次性把全部结果序列化给客户端 FullCalendar。
- **问题：** 日历一次只显示一个月，却传输并渲染全部历史事件（CalendarView.tsx:12-20 还会按类别扇出为最多 5 倍事件数）。一年重度使用后是数千个 event 对象，RSC payload 和 FullCalendar 初始化都会变慢。
- **建议：** 给 getCalendarSummaries 加 from/to 参数，页面按当前可见月±1 拉取；FullCalendar 用 datesSet 回调经 /api/calendar 增量取数（该 API 路由已存在）。顺带把 5 条 GROUP BY 加 day 范围条件，可用现有 idx_*_workspace(workspace_id, day) 索引。

#### [🟡 medium · 工作量 S] knowledge_points 缺 (workspace_id, next_review) 索引，到期复习查询是最高频却走不到索引

- **现状：** 到期复习过滤 next_review <= today 出现在首页 getHomeSnapshot（src/lib/repo/stats.ts:67-68）、day 页 getDay 的 dueReviews+COUNT（src/lib/repo/days.ts:95-105）、getSubjectOverviews（src/lib/repo/knowledge.ts:109-111）。现有索引 idx_points_workspace 是 (workspace_id, subject_code, chapter_id)（src/lib/migrations.ts:317），对 next_review 无覆盖；对比 mistakes 已有 (workspace_id, next_review, graduated)（migrations.ts:337）。
- **问题：** 这两条查询在关键路径（登录→主页→今日工作台）每次都执行，当前只能对 workspace 前缀做范围扫描再逐行过滤 next_review。几千个知识点时单次仍是毫秒级，但它是最频繁的查询且修复成本极低，属于『便宜的保险』。
- **建议：** 在 migrations.ts 增加部分索引：CREATE INDEX IF NOT EXISTS idx_points_due ON knowledge_points(workspace_id, next_review) WHERE next_review IS NOT NULL，并用 EXPLAIN QUERY PLAN 验证三处查询命中。

#### [🟡 medium · 工作量 M] 零性能度量：无 Web Vitals、无慢查询记录、无 Server-Timing

- **现状：** grep 全 src 无 useReportWebVitals/instrumentation/Server-Timing/performance.* 命中；唯一的观测面是 Caddy JSON access log（deploy/Caddyfile:26-29）和结构化错误日志（src/lib/log.ts）。scripts/ 里只有功能性 smoke/audit。
- **问题：** 『缓存体验已有很大改进但仍有优化空间』目前只能靠体感判断，没有数据回答『慢在哪一跳』：TTFB、RSC 往返次数、还是某条 SQL。后续每一项优化都无法验证收益。
- **建议：** 最小可行三件套（均为本版本文档确认的 API）：(1) 在 layout 挂一个含 useReportWebVitals 的小客户端组件（docs/.../use-report-web-vitals.md），POST 到 /api/vitals 落 SQLite，analytics 页加一块 p75 LCP/INP 卡片；(2) 包一层 db.prepare 计时，>20ms 的语句走 log.ts 记录；(3) 用现有 Caddy JSON 日志脚本化统计各路由 p95 TTFB（jq 即可）。合计一两天，之后所有优化有据可依。

#### [🟡 medium · 工作量 L] 全站 force-dynamic：合理的默认，但低频数据可用 Next 16 cacheComponents 精确缓存

- **现状：** 12 个页面/布局全部 export const dynamic = "force-dynamic"（src/app/page.tsx:14、day/[date]/page.tsx:19、subjects/[code]/page.tsx:9 等），无任何 Suspense 边界（grep 无命中），无 `use cache`。next.config.ts 只开了 experimental.staleTimes。
- **问题：** 个人学习数据全动态是安全的默认，但代价是每次导航都在服务端重算所有卡片。其中大量数据是低频变化的：科目列表、知识层级、settings。本版本已支持 cacheComponents + `use cache` + cacheTag/revalidateTag（node_modules/next/dist/docs/.../cacheComponents.md、use-cache 指令），可以让静态骨架 PPR 直出、动态块流式补齐，且注意多用户下缓存 key 必须包含 workspaceId。
- **建议：** 渐进式采用：先不开全局 cacheComponents，挑 getSubjects/getSettings/getCaptureHierarchy 这类『读多写少』函数加 `use cache` + cacheTag(`ws:${workspaceId}:subjects`)，在对应 action 里 revalidateTag；验证收益后再考虑页面级。若嫌复杂，仅做第 1 条 finding 的按需加载已覆盖大头。

#### [🟢 low · 工作量 S] FullCalendar 三插件全量进入 /calendar 首屏 bundle，timeGrid 基本无用

- **现状：** src/components/CalendarView.tsx:3-6 静态导入 @fullcalendar/react + daygrid + timegrid + interaction；事件全部是无时刻的日级摘要（CalendarView.tsx:14-18），timeGridWeek/timeGridDay 视图里只能显示为全天条。
- **问题：** App Router 按路由分包，所以只拖慢 /calendar 首次进入的下载+hydration（FullCalendar 系 min 后约 200KB+），但其中 timegrid 插件对当前数据形态没有产出价值；页面骨架屏结束后仍有一段白日历等待 JS 的空窗。
- **建议：** 先直接删掉 timeGridPlugin 与对应 headerToolbar 按钮（零风险减重）；若想进一步，把 CalendarView 用 next/dynamic({ ssr: false, loading }) 懒加载，让路由骨架先出。长期看，日级密度热力图用自绘 CSS grid 即可替代 FullCalendar 整个依赖。

#### [🟢 low · 工作量 S] 每请求两次 session 查询：layout 与 page 各查一次，可用 React cache() 去重

- **现状：** RootLayout 调 optionalSession（src/app/layout.tsx:21），每个页面又调 requirePageWorkspace → requireSession（src/lib/page-auth.ts:5-7），两者都走 getSessionContext 的 sessions JOIN users JOIN workspaces 查询（src/lib/auth.ts:172-196）；proxy.ts:14-16 只做 cookie 存在性检查（轻量，合理）。
- **问题：** 同一请求内重复执行同一条鉴权 SQL。better-sqlite3 同步查询单次亚毫秒，影响很小，但这是每个请求的固定税，且 React 的 cache() 一行就能消除。
- **建议：** 把 optionalSession/requireAccessContext 用 react 的 cache() 包一层（按 cookie token 记忆化，请求级自动失效），layout 与 page 自然共享一次查询。

#### [🟢 low · 工作量 S] 9 个路由共用同一个三块灰条骨架，与真实布局形状不符

- **现状：** 所有 loading.tsx 都渲染同一个 PageSkeleton（src/components/PageSkeleton.tsx:1-12：一条线 + 三格 grid），而 day 页真实布局是左右两栏多卡片、assets 是三栏文件管理器。
- **问题：** 骨架与最终内容形状差异大时，内容到达瞬间发生整体布局跳变，『有骨架但仍觉得闪』——感知性能打折。这是 9ebd8a0 提交打好的地基，值得做第二层。
- **建议：** 为 3 个最高频路由（/day、/assets、/）各写一个贴近真实栅格的骨架（复用现有 skeletonLine 样式即可），其余路由继续用通用款。

#### [🟢 low · 工作量 M] 资料库文件夹导航每次点击都是整页 RSC 往返（含配额与全树重算）

- **现状：** src/components/FileExplorer.tsx:76-79 openFolder 用 router.push('/assets?folder=…') 切换文件夹；服务端 src/app/assets/page.tsx:20-23 每次重新执行 getExplorer（整棵目录树）+ getStorageUsage + 可选 searchAssets。
- **问题：** URL 可分享/可后退是正确取舍，但每次点文件夹都重算整棵树和配额（配额是按 blob 去重的聚合查询），目录树和配额在一次浏览会话内几乎不变；folder 查询参数变化也不命中 staleTimes 缓存，弱网下逐层点进深目录会有连续的等待感。
- **建议：** 低成本改法：树与配额已在首次载入的 props 里，切换文件夹时只需当前目录的文件列表——为 /assets 增加一个仅返回 files 的轻量 API，客户端切换用它 + history.replaceState 维护 URL；或等做多视图重构时把 explorer 数据面整体改为客户端缓存（按 folder path 记忆化）。


### UI/UX 设计师

**总评：** Cinnabar redesign（朱砂手帐）落地质量整体超出自建项目常见水准：设计令牌完整、亮暗双主题、toast/确认框/空状态/骨架屏四类反馈原语齐备，复习队列的键盘评分+落章动画+撤销条是真正为重度使用者设计的微交互。主要问题集中在三层：视觉资产的可移植性（衬线字体依赖本机字体、globals.css 已成 5343 行的地层堆积）、可访问性基线（--quiet/--muted 对比度不达标、对话框无焦点管理）、以及资料库作为「访达式」愿景与现状（单一列表视图、移动端几乎无法打开文件、无上传进度）之间的差距。以下建议均与 docs/design-proposals.html 的四方向重设计兼容——无论选哪个方向（或不选）都值得做，其中字体自托管与 CSS 清理正是提案落地计划的前置项。

**亮点：**
- 设计令牌系统完整且有主题叙事：src/styles/tokens.css 定义了色彩/圆角/阴影/间距/字体全套变量，暗色不是简单反色而是「夜灯下的手帐」暖褐色体系（tokens.css:64-97），并同时支持 prefers-color-scheme 与 data-theme 手动覆盖
- 深色模式无闪烁：layout.tsx:14 内联 themeScript 在 hydration 前应用 localStorage 主题，ThemeSwitcher.tsx 提供 系统/浅/深 三态切换
- 统一的反馈基础设施：FeedbackProvider.tsx 提供 toast（aria-live=polite）+ Promise 化 confirm 对话框，所有破坏性操作（删科目/章节/知识点/文件/文件夹/设备/随笔）都走确认且文案写明后果（如 SubjectWorkbench.tsx:56-61 精确列出将删除的章节与知识点数量）
- 复习队列微交互是全站亮点：键盘 1-4 直接评分（ReviewQueue.tsx:102-125）、评分后宋体单字落章动画、8 秒撤销条（armUndo, ReviewQueue.tsx:40-44）、清零后的「毕」印庆祝态（queueCleared）——完整闭环
- 空/加载/错误三态齐备：EmptyState.tsx 纸签式空状态带行动入口，全部 11 个路由都有 loading.tsx 骨架屏（skeleton-shimmer），根级 error.tsx 兜底；prefers-reduced-motion 全局尊重（globals.css:2821-2826）
- 主页是行动优先而非数据陈列：page.tsx:28-38 根据到期复习/首个任务动态生成 hero 标题与 CTA，「昨晚你说」计划回显（page.tsx:62-64）形成日间-晚间仪式闭环
- 中文排版有真实思考：正文黑体+标题宋体分工（globals.css:4336-4345）、展示数字用 Georgia 衬线（--font-num）、时钟 tabular-nums 对齐、正文 line-height 1.65、AssetViewer 的 mdView 限宽 72ch
- AssetViewer.tsx:119-244 自研 Markdown 渲染输出 React 元素而非 innerHTML，无 XSS 面，且非 http 链接主动降级为纯文本（renderInline:225-234）

**发现：**

#### [🔴 high · 工作量 M] 衬线字体栈依赖本机字体，「朱砂手帐」的视觉身份在 Windows/Android 上不存在

- **现状：** tokens.css:57-59 定义 --font-serif: "Noto Serif SC","Source Han Serif SC","Songti SC","SimSun",serif，globals.css:4337-4353 让全站 h1/h2/h3、品牌、印章字都走宋体，但没有任何 next/font 或 @font-face 加载（全仓 grep 无 next/font 引用）
- **问题：** 绝大多数 Windows 没装思源宋体，会落到 SimSun——小字号发虚、无真粗体（font-weight:600 走合成加粗），印章「今/毕/空」和 masthead 全部劣化；Android 没有衬线中文字体，直接回退黑体，整套「手帐」识别层失效。用户明确关心多平台使用，而这是自托管部署（无 CDN 顾虑）。design-proposals.html:751 提案自己也承诺了 next/font 自托管
- **建议：** 用 next/font/local 自托管思源宋体 woff2 子集：标题/印章只需常用汉字+数字，pyftsubset 可压到 1-2MB；--font-num 的 Georgia 同理可换成子集化的衬线数字字体。此项无论最终选四方向中哪个都必须做（B 依赖 Bahnschrift/Cascadia、C 依赖楷体，跨平台问题完全相同）

#### [🔴 high · 工作量 S] 辅助文本对比度大面积不达 WCAG AA，且承载的是决策信息而非装饰

- **现状：** 实测（WCAG 相对亮度公式）：浅色模式 --quiet #a89c80 在 surface 上 2.54:1、在 bg 上 2.34:1；--muted #85795f 在 surface 上 4.01:1；暗色 --quiet #6e6249 仅 2.73:1。而 --quiet 用于 11-12.5px 的 .listRow small、.pointDue「下次 07-15」（globals.css:1752-1756）、.queueInfo small、.hint、kbd 等
- **问题：** 复习到期日、文件大小、错题归因这些是用户每天做判断的依据，不是装饰文本；4.5:1 是小字号 AA 底线，2.3-2.7:1 意味着长时间备考场景下（疲劳、夜间、低亮度屏）实际不可读。对比度问题换任何视觉方向都会带着走，因为它是令牌层的取值问题
- **建议：** 浅色 --quiet 加深到 ≥#877a5c（约 4.5:1）、--muted 加深到 ≈#75694f；暗色 --quiet 提亮到 ≥#8d7f60。纯装饰元素（eyebrow 大字距标签）可单独留浅色变量。改完跑一遍全站截图对比，半天工作量

#### [🔴 high · 工作量 L] globals.css 已成 5343 行的地层堆积：节序错乱、同名选择器反复覆盖、死代码，是任何重设计落地的第一障碍

- **现状：** 单文件 5343 行；节编号顺序为 12→13→20→19→17→18→16→15→14→21→…（globals.css:2828 起）；.capturePanel 定义了 3 次（199、3070、4520 设圆角后 4524 又立即清零）、.loginShell 2 次（2557、3414）、.homeContext 2 次（4152、5260）、.countdownChip 2 次（4190、5290）、.pulseMetric 的 backdrop-filter 在 4469 被显式抹掉；死代码包括 .homeHero(902)、.countdownCard(941-1000)、.homeStats/.homeStat 的主页用法（现仅 admin 页复用）、.legend(4342，全仓无组件渲染 legend）
- **问题：** 每次改样式都要靠源码顺序赢得级联，新人（或未来的你）无法判断哪个定义生效；design-proposals.html:748 的落地计划本来就要「重写 globals.css 全部视觉层」，带着 40% 的覆盖层和死层去重写，成本和回归风险都翻倍
- **建议：** 分三步：1) 删死层（homeHero/countdownCard/legend 等，grep className 交叉验证）；2) 合并同名选择器为单一最终定义，按「外壳/原语/逐页」重排节序；3) 中期把逐页样式迁到 CSS Modules 或按 section 拆成 @import 的多文件。这是纯清理，不改视觉输出，可用截图 diff 验证

#### [🔴 high · 工作量 S] 资料库在移动端几乎无法打开/预览文件

- **现状：** 文件行单击仅选中（FileExplorer.tsx:348），打开/预览依赖 onDoubleClick（FileExplorer.tsx:349-352）；而「预览/打开原文件」按钮在右侧详情栏里，1080px 以下 .driveDetails 被 display:none 直接砍掉（globals.css:2655-2661）
- **问题：** 触屏没有可发现的双击习惯（且双 tap 与浏览器缩放手势冲突），详情栏又整个隐藏，结果手机上选中文件后没有任何可见的「打开」入口——资料库的核心动作在移动端断裂。用户明确提出多平台使用诉求
- **建议：** 窄屏下把交互改为「单击即打开预览、行尾工具加信息按钮弹出底部 sheet 显示详情」；或最低成本方案：coarse pointer 下单击直接调用现有 AssetViewer/window.open 逻辑。与视觉重设计无关，纯交互层修复

#### [🟡 medium · 工作量 L] 资料库只有单一列表视图，行不可键盘操作，离「访达式」目标差一个交互层

- **现状：** FileExplorer.tsx:343-357 文件行是 div + onClick/onDoubleClick：无 tabIndex、无方向键移动选择、无 Enter 打开、无多选、无右键菜单；无网格/缩略图视图切换；role="table"/"row" 声明了但没有 gridcell 且行不可聚焦，ARIA 语义只做了一半；排序状态不持久（刷新即失）
- **问题：** 这是用户点名要的核心方向（访达/资源管理器多视图）。当前键盘用户完全无法选中或打开文件（可访问性硬伤）；图片类学习资料（截图、拍照笔记）在纯列表里无法扫视
- **建议：** 分两期：一期把行改为可聚焦网格（tabIndex + roving focus，方向键/Enter/Delete，补全 role=grid/row/gridcell），顺带解决可访问性；二期加「列表/网格」segmented 切换（复用现有 .segmented 原语），网格用现有 /api/assets/[id]/file 出图片缩略图、非图片用类型图标，视图与排序偏好存 localStorage。四方向提案只换皮不动交互结构，此项选谁都不浪费

#### [🟡 medium · 工作量 M] 上传无每文件进度、不能取消，且主文件区不接受从操作系统拖入文件

- **现状：** FileExplorer.tsx:154-186 串行 fetch 上传，唯一反馈是上传按钮上的 spinner（243-244 行），失败汇总成一条 toast；driveListPanel/driveRow 的 onDrop 只处理内部移动的 dragRef（FileExplorer.tsx:141-152），不读 event.dataTransfer.files——从桌面拖 PDF 进资料库主区没有任何反应（收纳面板反而有 dropZone）
- **问题：** 20MB 上限下多文件上传可能持续十几秒，无进度=用户不敢离开也不敢重试；「拖文件进文件夹区域」是资源管理器隐喻下最自然的动作，落空会直接打断心智模型
- **建议：** 1) driveMain 增加外部文件 drag 检测（event.dataTransfer.types 含 Files 时高亮当前目录）并 onDrop 上传；2) 上传队列 UI 复用收纳面板的 attachmentCard 样式，用 XHR 的 upload.onprogress 显示每文件进度与取消。全部是现有原语组合

#### [🟡 medium · 工作量 S] 确认对话框与命令面板没有焦点管理：不移焦、不困焦、Esc 不关、焦点不归还

- **现状：** FeedbackProvider.tsx:49-57 的 confirmDialog：打开时焦点仍留在触发按钮上，无 focus trap，Tab 会跑进背后页面，无 Escape 关闭，关闭后不归还焦点；CommandPalette.tsx 只做了 Esc 和输入框聚焦，同样无 trap；role="alertdialog"/aria-modal 声明了但行为没跟上
- **问题：** 键盘用户在「删除科目」这类危险确认弹出后，焦点还在原删除按钮上，再按一次 Enter 语义不明；屏幕阅读器用户会读到背景内容。这是全站统一原语，修一处全站受益
- **建议：** 把 confirmDialog 和 commandPalette 换成原生 <dialog> + showModal()——自带焦点陷阱、Esc 关闭、::backdrop，Next.js 16/React 19 下无兼容顾虑；打开时 focus 到「取消」按钮（危险操作的安全默认），close 后浏览器自动归还焦点。约半天

#### [🟡 medium · 工作量 M] 任务删除既无确认也无撤销，与全站「危险操作要么确认要么可撤销」的模式不一致

- **现状：** DayTasks.tsx:207-214 删除按钮直接调 deleteTaskAction，无 confirm 无 undo；且该按钮桌面端 hover 才显形（globals.css:1153-1159 opacity:0→1），紧贴科目 select。对照组：随笔删除有确认（DayNotes.tsx:97）、复习评分有 8 秒撤销（ReviewQueue.tsx:40-44）、设置页保存反馈用的又是内联 saveStatus 而非 toast（SettingsForm.tsx:109）
- **问题：** 一条写了半行字的任务被误删就没了；三种反馈/防误模式（确认框、撤销条、内联文字）在不同组件里随机出现，用户建立不起稳定预期
- **建议：** 为轻量对象统一「不打断+可撤销」：扩展 FeedbackProvider 的 notify 支持 action 参数（如 notify('任务已删除', {action:{label:'撤销', run}})），删除任务后 toast 内一键恢复（服务端已有 addTaskAction 可复用做恢复）；同时把 SettingsForm 的保存反馈并入 toast。撤销比确认框更符合高频工具的手感

#### [🟡 medium · 工作量 M] ⌘K 承诺「搜索或快速操作」，实际只能搜 9 个导航项

- **现状：** CommandPalette.tsx:24-34 的 commands 仅由 getNavigation() 的页面链接 + 「收纳资料」组成，按 label 前缀过滤；TopBar.tsx:46 的触发按钮文案是「搜索或快速操作」
- **问题：** 备考系统里真正高频的查找对象是知识点（几百个）、文件、错题，现在找一个知识点要 科目页→找科目卡→进详情→肉眼扫章节。命令面板的壳已经很好（键盘导航、分组样式都有），内容层空着，是全站杠杆率最高的一个补强点
- **建议：** 加一个 /api/search?q=（SQLite 对 knowledge_points/assets/mistakes 三表 LIKE，或上 FTS5），palette 输入 ≥2 字时防抖查询，结果分「页面/知识点/文件/错题」四组渲染（复用现有 commandList 样式），Enter 直达科目锚点/文件预览/错题本。属于纯功能层，与任何视觉方向正交

#### [🟢 low · 工作量 M] 错题本是只读清单：不能筛选、不能编辑、行无任何操作入口

- **现状：** mistakes/page.tsx:41-75 「回炉中/已毕业」两栏是纯静态 listRow：无科目筛选，不能修改 title/cause，不能手动毕业或删除，行不可点击展开更多信息（cause 与 knowledge_title 二选一挤在一个 small 里，49-51 行）
- **问题：** 错题本是备考核心资产，几个月重度使用后「回炉中」会累积到几十上百条，没有筛选就失去检索价值；录错了归因或题干（收纳面板快速录入很容易错）也无法修正，只能永远错下去
- **建议：** 一期：顶部加科目 segmented 筛选（复用 .segmented）+ 行点击展开显示完整 cause/关联知识点/历次重做记录；二期：展开区内提供编辑（title/cause/关联知识点）与「手动毕业」「删除」操作，走现有 confirm/undo 原语

#### [🟢 low · 工作量 S] 页面级 riseIn 入场动画每次导航都全量重播，高频切页时拖慢体感

- **现状：** globals.css:4674-4682 对 .mainPane > .pageStack > * 施加 0.38s riseIn，且逐子元素叠加至 0.24s 延迟——每次路由切换（包括 day 页前后翻日、router.refresh 后）末尾元素要 ~0.6s 才稳定
- **问题：** 对展示型网站合适，但这是一天进出几十次的工具：主页↔今日↔科目来回切换时内容反复「浮起」，与骨架屏叠加后感知加载时间被人为拉长；日期翻页（day/[date] 前后箭头）这种同构导航尤其不该重播全套入场
- **建议：** 两个方案择一：a) 动画只保留首屏（body 加一次性 class，导航后移除）；b) 时长砍到 0.18s、延迟阶梯砍半，并对 day 页翻日这类同布局导航禁用。四方向提案对动效的共识都是「极少而准确」（design-proposals.html:376），此调整与之同向

#### [🟢 low · 工作量 S] 日历页事件色彩语义无图例，且 .legend 样式已写但从未渲染

- **现状：** CalendarView.tsx:14-18 用五种色块类（eventStudy/Asset/Review/Mistake/Done）编码事件类型，页面上没有任何图例说明；globals.css:4342 存在 .legend strong 选择器但全仓无组件输出 legend
- **问题：** 事件标题自带文字（「学习 142m」）所以不算硬伤，但月视图缩略下文字被截断时只剩颜色，五色语义要靠记忆；死选择器说明图例曾在计划中而没落地
- **建议：** calendarShell 顶部加一行五个色点+标签的图例（样式已经写好了，补 JSX 即可）；顺手在日历页头加「本月学习 X 分钟 · 活跃 Y 天」汇总，让日历从纯导航升级为节奏审视页


### 委员会主席 · 集体盲区补漏

#### [🔴 high] 测试与 CI/交付门禁维度六位专家全部缺席——测试套件存在但没有任何机制保证它被执行，且现有测试固化了被判定为 bug 的行为

现状：项目其实有 17 个 vitest 单测文件覆盖整个数据层（src/lib/*.test.ts、src/lib/repo/*.test.ts，vitest.config.ts include 为 src/**/*.test.ts），质量不低；但仓库根本没有 .github/ 目录（无任何 CI），deploy/README.md 的「Safe upgrade」流程（第 38-49 行）只跑 backup → git pull → build → verify-workspace-migration，从头到尾不执行 npm test；Server Actions（src/app/actions/ 8 个文件）、API 路由和组件层零测试。更关键的证据：学习产品专家找出的三个 high 级排期 bug 所在模块恰好有测试——src/lib/review-schedule.test.ts:10-11 明确断言 nextReviewDate(today, 9) 封顶返回 30 天，这正是「遗忘后一次答对跳回最长间隔」赖以发生的行为，说明测试在固化错误而非拦截错误，修复排期算法时必须连测试断言一起改。为什么有问题：六位专家提了几十条修改建议（排期算法重写、Server Action 改造、CSS 重构、组件拆分），在没有 CI 门禁的仓库里批量落地这些建议，回归风险会全部由生产环境和这位正在备考的重度用户承担。建议：先加一个最小 GitHub Actions workflow（lint + vitest + next build），把 npm test 写进 deploy/README.md 的升级步骤；再为本轮要改的 review-schedule / reviews repo 补齐「失败后重建间隔」的期望行为测试（红→绿）。工作量：CI 半天，排期行为测试随算法修复一起 1 天内。

#### [🟡 medium] 时区被硬编码为 Asia/Shanghai，「多用户 + 多平台」系统没有任何时区机制，跨平台专家的适配矩阵也完全没测这一维

现状：src/lib/dates.ts:3 的 todayKey() 硬编码 timeZone: "Asia/Shanghai"，且这不是孤例——src/lib/repo/library.ts:363、src/app/analytics/page.tsx:184、src/app/day/[date]/page.tsx:150、src/components/HomeClock.tsx:27,34、DeviceSessions.tsx:54、DayNotes.tsx:69、admin/page.tsx:87 等十余处组件层再次各自硬编码。整个系统的「今天」（日工作台路由、任务清零、到期复习判定、日历、统计）都锚定在 UTC+8。为什么有问题：这是邀请制多用户系统（invite/[token]、admin 用户管理俱全），用户本人在马来西亚（恰好也是 UTC+8，所以至今无感），但任何非 UTC+8 的用户会遇到日界错位：晚上 11 点复习被记到「明天」、任务在错误时刻清零、streak 断裂。跨平台体验工程师给出了完整的设备/浏览器矩阵却没有覆盖时区这一「平台差异」；学习产品专家谈了排期算法却没谈日界定义。建议：把时区收敛为 workspace/user 级设置（settings 表已存在），todayKey(tz) 接受参数，组件层的十余处 Intl 硬编码统一走一个 formatInTz 工具；至少先做到「单点定义、可配置」。工作量：收敛硬编码 1 天，加用户级时区设置再 1 天。

#### [🟡 medium] 用户学习数据零导出能力：备考核心资产（错题、笔记、复习历史、知识点掌握度）被单向锁进 SQLite

现状：全库 grep「导出/export/takeout」在 src/ 下没有任何用户侧导出功能——没有导出 Server Action、没有导出 API 路由、UI（settings、mistakes、analytics）无任何导出入口；唯一的取回途径是服务器管理员级的 scripts/backup.mjs 整库快照（普通被邀请用户完全拿不到自己的数据）。为什么有问题：这是备考系统，错题本、每日笔记、复习历史是用户投入数月的核心资产；架构师谈了「备份」（灾难恢复视角）、跨平台专家谈了「离线」（缓存视角），但都没有触及「用户能否把自己的数据带走/在其它工具里用」。考试结束后系统退役、迁移到 Anki/Obsidian、或多用户场景下某个用户想退出，目前都无路可走；这也是成本最低的一种「多平台互操作」。建议：先做一个 per-workspace 导出 Server Action（JSON 全量 + 错题/笔记的 Markdown 渲染，附件打 zip），在 settings 页给入口；repo 层已按 WorkspaceScope 隔离，导出天然安全。工作量：JSON 导出 1 天，Markdown+附件 zip 再 1-2 天。

#### [🟡 medium] 管理员「只读审阅」用户工作区页面：页面自身无鉴权（只靠段级 layout 守卫），且敏感读取完全不写审计日志

现状：src/app/admin/users/[id]/workspace/page.tsx:11-24 直接 getDb() 后用目标用户的 workspace_id 构造 scope 查询其任务、科目掌握度、最近资料，页面本身没有任何 requireAdmin/鉴权调用，唯一防线是 src/app/admin/layout.tsx:8 的 requireAdmin()；同时 writeAuditLog（src/lib/repo/admin.ts:271）的全部 6 个调用点（admin.ts:80,132,181,202,232,260）都在变更操作里，管理员浏览用户学习数据这一最敏感的读操作不留任何痕迹——尽管页面 UI 自己宣称「只读审阅」「文件内容受权限保护」。为什么有问题：其一，仅靠 layout 做鉴权正是架构师批评的「约定式而非机制式」的最尖锐实例（Next.js 官方指引也是把鉴权放在贴近数据处，而非依赖 layout；按 AGENTS.md 要求改动前先核对 node_modules/next/dist/docs 的相关文档）——未来任何人在 admin 段下新增页面或重构 layout 都可能悄悄失去防线；其二，多用户系统里「管理员可无痕翻阅所有用户的学习数据」是隐私设计缺口，六位专家（包括写了多用户隔离审计脚本视角的架构师）都没有提到读操作审计。建议：页面顶部补 requireAdmin()（与其它 admin server 代码一致），并在渲染前 writeAuditLog 一条 action: "workspace.view"；顺带把 sanitizeAuditSummary 的白名单扩一个字段即可。工作量：半天。

#### [🟢 low] Web 安全响应头缺 CSP 与防嵌入头，8443 临时 IP 入口整段裸奔无任何安全头

现状：deploy/Caddyfile 的 {$APP_DOMAIN} 站点块设置了 X-Content-Type-Options / Referrer-Policy / Permissions-Policy / HSTS（做得比多数自托管项目好），但没有 Content-Security-Policy，也没有 X-Frame-Options / frame-ancestors；备案期的临时入口 https://82.157.141.186:8443 整个 server 块没有任何安全头。为什么有问题：会话是 sameSite=lax 的 HttpOnly cookie（src/app/actions/auth.ts:26-32，本身配置正确），CSRF 和 iframe 携带 cookie 的风险已被 lax 大幅缓解，所以这不是 high；但 CSP 是对「用户上传内容 + 未来功能演化」的纵深防御——目前 contentDispositionFor（src/lib/assets.ts:84-95）用 inline 白名单挡住了 SVG/HTML 的存储型 XSS，这条防线一旦被后续改动（比如文件管理专家建议扩大 inline 白名单）削弱，CSP 是唯一兜底。src/app/layout.tsx:28 只有一段内联 themeScript，全站无外部脚本，正是最容易上严格 CSP 的形态。建议：在 Caddy 加 CSP（default-src 'self'; script-src 'self' 加 themeScript 的 sha256 hash; frame-ancestors 'self'）与 frame-ancestors，8443 临时块复用同一 header 片段（或按 deploy/README.md 的既定计划尽快删除该入口）。工作量：半天含回归验证。

### 委员会主席 · 矛盾裁决

- 【多平台路线之争：架构师的 token API 层 vs 跨平台工程师的 PWA 最小路径】架构师把「业务能力锁死在 Server Actions + Cookie、无 API 可用」列为 high 并暗示要开放 API 层；跨平台工程师给出的最小可行路径（manifest → SW → 离线复习队列）却完全不需要新 API——PWA 与站点同源，现有 api/ 路由通过 requireWorkspace(request) 读 cookie 即可用（src/lib/request-auth.ts:26-33 确认为纯 cookie、无 Bearer 分支；proxy.ts:18-20 对无 cookie 的 API 请求返回 401）。两者争夺同一份「多平台」预算且顺序有讲究。裁决：先走 PWA 路线（半天到 3 天即可命中用户「手机装 App + 离线复习」的真实诉求），token API 层降级为「确定要做原生客户端或第三方集成时」的后置项，且届时应与 PWA 第三阶段的离线后台同步设计成同一套接口，避免做两遍。

- 【字体自托管 vs 部署带宽与性能预算】UI/UX 设计师把「衬线字体依赖本机字体」列为 high 并要求自托管字体作为重设计前置项；但部署文档明确 3Mbps 上行是主约束（deploy/README.md："The 3Mbps uplink is the main constraint"），中文衬线字体全量 woff2 通常 5-15MB，不做处理会让首屏在这条链路上灾难性变慢，而性能工程师恰好指出「零性能度量、改进无法验证」。裁决：两条建议可并存但有硬前置——字体必须子集化（常用字级别可压到几百 KB-2MB）+ font-display: swap + 走 Caddy 已有的 /_next/static immutable 缓存，且应先落地性能工程师的最小度量（Web Vitals）再上字体，用数据确认没有击穿加载体验；执行顺序上性能度量在前。

- 【视频/音频在线预览的优先级】文件管理专家称「视频音频是低垂果实，被 Content-Disposition 挡住」（改 src/lib/assets.ts:85-94 的 inline 白名单即可）；但部署现实是 20MB 上传上限 + 3Mbps 上行且文档明确写了 "avoid serving large video files"（deploy/README.md），绝大多数备考视频根本传不进来也拉不动。裁决：改白名单本身安全无害（video/*、audio/* 不可执行脚本，HTML/SVG 继续 attachment，不削弱现有 XSS 防线），可以顺手做，但「低垂果实」的收益判断在当前容量下不成立，优先级应降为 low，不应与缩略图/多视图争资源；若未来真要做视频学习资料，先解决分片上传（schema 里的半成品表）和带宽，再谈预览。

- 【移除 router.refresh() vs 全站交互反馈质量】性能工程师把「revalidatePath + router.refresh() 双往返」列为 high 建议移除；但被 UI/UX 和学习产品专家点名称赞的撤销条、计划回声、清零正反馈都依赖操作后界面即时且正确地更新。项目 AGENTS.md 明确警告此 Next.js 16 版本的 API 可能与训练数据有破坏性差异——revalidatePath 与客户端路由缓存（staleTimes）在本版本中的失效语义必须先查 node_modules/next/dist/docs 确认，否则一刀切移除 refresh 可能引入「操作后界面不更新」的回归，恰好砸掉三位专家共同认可的交互质量。裁决：性能工程师方向正确，但执行方式应为——先查本版本文档确认 revalidatePath 的失效范围，再逐页移除 refresh 并对撤销/回声等关键交互做手动回归，禁止全局批量替换；这也再次依赖第一条遗漏（CI/测试门禁）先补上。

- 【修复排期算法 vs 现有测试断言】学习产品专家的三个 high 级排期修复（失败重建间隔、队列截断排序、毕业条件）会直接与现有测试冲突：src/lib/review-schedule.test.ts:10-11 断言 completedReviews>=4 一律返回 30 天封顶，正是「遗忘后跳回最长间隔」行为的单元层固化。裁决：学习产品专家的判断在产品上正确（间隔重复引擎失败后必须重建间隔），落地时需把 review-schedule.ts 的接口从「只看累计次数」改为「携带失败信号」，并同步重写该测试为新期望行为——这不是简单改一行算法，涉及 reviews repo 调用方（src/lib/repo/reviews.ts 的快照读写路径）一起动，工作量应按 1-2 天而非几小时评估。
