# README 与操作速查表更新实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 更新项目入口说明，并新增一份服务器优先、可直接复制命令的操作速查表。

**Architecture:** 根 `README.md` 只承担稳定的项目全貌与入口导航；根 `QUICKSTART.md` 承担高频操作；`deploy/README.md` 继续承担详细生产运维。三份文档通过链接连接，减少重复维护。

**Tech Stack:** Markdown、Docker Compose、Next.js 16.2.10、npm、Git、Ubuntu 24.04、Caddy。

## Global Constraints

- 服务器操作必须位于速查表最前面。
- 生产目录固定为 `/opt/apps/ascend`，Compose 文件固定为 `compose.production.yml`。
- 不写入密码、令牌或生产环境变量真实值。
- npm 命令必须与 `package.json` 一致，服务与卷路径必须与 `compose.production.yml` 一致。

---

### Task 1: 重写项目入口文档

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `package.json` 脚本、`src/app` 路由、`compose.production.yml` 架构。
- Produces: 指向 `QUICKSTART.md` 与 `deploy/README.md` 的项目入口。

- [x] **Step 1: 重组 README**

保留产品定位与主要页面，补充技术栈、快速入口、本地开发、测试、生产架构、持久化路径和当前代码结构；移除 Mac mini 作为当前主部署的表述。

- [x] **Step 2: 核对 README 中的事实**

Run: `rg -n "Mac mini|compose\.productions\.yml|zgca\.zhuorui\.me|/opt/apps/ascend|QUICKSTART" README.md`

Expected: 只出现当前部署信息和速查表链接，不出现错误的 Compose 文件名。

### Task 2: 新增高频操作速查表

**Files:**
- Create: `QUICKSTART.md`

**Interfaces:**
- Consumes: `deploy/README.md` 的安全部署顺序及 `package.json` 的脚本。
- Produces: 从 SSH 登录、生产更新到本地开发的可复制指令集。

- [x] **Step 1: 写服务器优先的命令块**

顺序为登录、更新、重启、状态、日志、路径、备份和回滚。安全更新明确执行备份、拉取、测试、构建、启动、迁移校验与健康检查。

- [x] **Step 2: 写本地开发命令块**

包含首次安装、日常启动、测试、lint、生产构建、冒烟与审计命令，并解释需要先启动测试服务的命令。

- [x] **Step 3: 加入常见错误**

明确 `compose.production.yml` 没有复数 `productions`，说明构建耗时定位方法，并链接详细运维手册。

### Task 3: 文档验证

**Files:**
- Verify: `README.md`
- Verify: `QUICKSTART.md`
- Verify: `deploy/README.md`

**Interfaces:**
- Consumes: Tasks 1-2 的最终文档。
- Produces: 无错误路径、无秘密信息、无 Markdown 空白错误的可交付文档。

- [x] **Step 1: 扫描过时和错误内容**

Run: `rg -n "compose\.productions\.yml|zgca\.zhuorui\.me|Mac mini" README.md QUICKSTART.md`

Expected: 无匹配。

- [x] **Step 2: 检查关键命令和路径**

Run: `rg -n "ssh friday|/opt/apps/ascend|compose\.production\.yml|npm test|verify:migration|api/health" README.md QUICKSTART.md`

Expected: 所有生产和验证入口均可找到。

- [x] **Step 3: 检查 diff**

Run: `git diff --check && git diff -- README.md QUICKSTART.md`

Expected: `git diff --check` 无输出，diff 仅包含预期文档更新且没有秘密值。
