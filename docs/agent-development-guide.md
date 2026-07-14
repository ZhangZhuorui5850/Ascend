# Agent 开发指南（Ascend / 登峰）

## 架构速览
- Next.js 16 App Router + React 19，源码在 `src/`；无 tailwind，样式为 `src/app/globals.css` + `src/styles/tokens.css` CSS 变量（多套 `data-skin` 皮肤，颜色一律走 token）。
- 数据库 better-sqlite3（同步、无 ORM）：建表 `src/lib/db.ts`（服务全新库），版本化迁移 `src/lib/migrations.ts`（服务存量库，带 checksum，只能追加不能改旧迁移）。查询集中在 `src/lib/repo/*.ts` 手写 prepared statements，多租户按 `workspace_id` 隔离。
- 写路径统一：客户端组件 → `src/app/actions/*`（server action，`requireWorkspace()` 鉴权 → repo → `revalidatePath`）→ 客户端 `router.refresh()`。action 一律返回 `{ok, error?}`，不抛错给客户端。

## 测试与验证
- `npm test`（vitest，测试与源码同目录 `*.test.ts`，repo 测试用 `createTestDb()` 内存库跑全量建表+迁移）；`npm run lint`；`npm run build`。三者全绿才算完成。
- 用户生产实例是本机 `next start`（真实数据），改码后需 build + 重启才生效。

## 文档
- 设计 spec：`docs/superpowers/specs/`；实施计划：`docs/superpowers/plans/`；交付报告：`docs/reports/`（报告用 [COMPUTED]/[INFERRED]/[KNOWN] 声明标签标注结论来源）。
