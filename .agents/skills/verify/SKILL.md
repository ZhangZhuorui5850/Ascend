---
name: verify
description: 在隔离实例上端到端验证 Ascend 的改动（构建、启动、登录、驱动 UI、隔离数据）
---

# Ascend 端到端验证配方

## 隔离实例启动（不碰生产数据）

生产数据在 `./data`（`ZGCA_DATA_ROOT` 可重定向）；用户生产实例是本机 `next start`。验证一律用独立数据目录 + 独立端口：

```bash
npm run build   # 注意：会重写 .next，若用户 dev/start 实例正在跑会受影响，验证后提醒重启
ZGCA_DATA_ROOT=<scratch>/verify-data APP_LOGIN_EMAIL=qa@test.local APP_LOGIN_PASSWORD=test1234 \
  npx next start -p 3123 &
```

- `APP_LOGIN_EMAIL/PASSWORD` 会在首次登录时引导创建用户 + workspace（`ensureBootstrapUsers`）。
- 有 "output: standalone" 警告但 `next start` 实际可用（页面与静态资源均 200）。
- 数据库文件：`$ZGCA_DATA_ROOT/workbench.sqlite`。

## Playwright 驱动

- 浏览器：`npx playwright install chromium chromium-headless-shell`（headless 需要 headless-shell）。无系统 Chrome。
- 脚本放 scratchpad 时用 `createRequire("/home/zzr/Ascend/package.json")` 解析 better-sqlite3/playwright。
- 登录表单：`/login`，`input[name="email"]`、`input[name="password"]`、`button[type="submit"]`。
- 造数据最快路径：登录一次让 bootstrap 建好 workspace，然后直接用 better-sqlite3 往 `subjects` / `subject_chapters` / `knowledge_points` 插行（参考 `src/lib/repo/testing.ts` 的 seedSubjectWithChapter 字段）。
- 原生 HTML5 拖拽用 mouse.down → 多步 mouse.move → mouse.up 可靠触发（Chromium 拖拽拦截自动生效）；中途 `page.screenshot` 可捕获指示线。
- 坑：目标元素必须在视口内，`boundingBox()` 对视口外元素返回坐标但 mouse.move 过去不会触发 dragover——直接用超高视口（如 1440x2600）最省事。
- 坑：headless-shell 无 CJK 字体，截图里中文是方框（不影响布局判断）。
- 提交拖拽后等 `router.refresh()`：`waitForTimeout(900)` + `waitForLoadState("networkidle")` 足够。

## 收尾

按 PID kill 自己起的 `next start`（**不要** `pkill -f next`，会误伤用户实例/自身命令）。提醒用户生产实例需 build + 重启才吃到新代码。
