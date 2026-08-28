---
name: verify
description: 当用户明确要求 Ascend 的端到端、浏览器、视觉或交互验收时，在隔离实例上驱动真实 UI 并保存可复核证据。
---

# Ascend 浏览器验收

`.agents/skills/verify/SKILL.md` 是本技能的维护源；`npm run skills:sync` 生成 `.claude` 副本。

## 适用范围

用户明确提出端到端、浏览器、视觉、响应式或交互验收时使用本技能。代码级验证按 `docs/development.md` 分级执行，日常发布按 `docs/operations/deployment.md` 执行。

## 隔离边界

- 默认目标为隔离的本地或 staging 实例。生产验收需要用户明确指定生产环境和允许的操作范围。
- 使用 `mktemp -d` 创建专用 `ZGCA_DATA_ROOT`，设置专用端口和测试账号。
- 浏览器步骤只写入测试 workspace。涉及 Judge 时连接隔离 Gateway。
- 记录自己启动的进程 PID，收尾时按 PID 终止。

本地功能验收可从以下形状开始：

```bash
verify_root="$(mktemp -d)"
ZGCA_DATA_ROOT="$verify_root/data" \
APP_LOGIN_EMAIL=qa@test.local \
APP_LOGIN_PASSWORD=test1234 \
npm run dev -- --port 3123
```

## 验收闭环

1. 读取当前功能手册和变更 diff，提取本次可观察的验收项。
2. 启动隔离实例，确认 `/login` 与目标页面可达。
3. 使用 Playwright 驱动 Chromium；首次缺少浏览器时安装 `chromium` 与 `chromium-headless-shell`。
4. 覆盖与任务相关的主流程、失败恢复、目标视口、键盘和主题状态。
5. 保存关键截图、控制台错误、失败请求和复现步骤。真实设备验收使用对应 evidence 模板。
6. 核对测试数据目录与生产数据目录相互独立，停止已记录 PID，并删除临时数据。

登录页稳定选择器为 `input[name="email"]`、`input[name="password"]` 与 `button[type="submit"]`。详细 Playwright 排障见 `docs/operations/troubleshooting.md`。
