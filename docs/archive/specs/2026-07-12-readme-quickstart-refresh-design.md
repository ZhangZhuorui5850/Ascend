# README 与操作速查表更新设计

## 目标

让第一次了解项目的人可以通过根 `README.md` 掌握产品、开发和部署全貌，同时让维护者打开根目录下的 `QUICKSTART.md` 后，可以快速复制高频服务器与本地操作命令。

## 文档职责

### `README.md`

作为稳定的项目入口，包含：

- 产品定位与主要页面；
- 当前技术栈和运行架构；
- 本地开发与环境变量入口；
- 测试命令；
- 腾讯云生产部署概览；
- 数据持久化与代码结构；
- 指向 `QUICKSTART.md` 和 `deploy/README.md` 的链接。

删除或降级已经失效的 Mac mini 主部署说明，不在根 README 中重复详细运维步骤。

### `QUICKSTART.md`

作为高频命令速查表，服务器操作优先，依次包含：

1. SSH 登录与进入 `/opt/apps/ascend`；
2. 安全更新：备份、拉取、测试、构建、启动、迁移校验和健康检查；
3. 快速重启；
4. 服务状态与日志；
5. 数据、上传和备份路径；
6. 备份与基础回滚入口；
7. 本地首次运行；
8. 本地日常开发；
9. 测试与生产构建；
10. 常见命令错误。

命令应可直接复制，但不包含密码、令牌或 `.env.production` 的真实值。

### `deploy/README.md`

继续作为完整生产运维手册。此次只在必要时修正与实际部署冲突的内容，不复制速查表的解释性文字。

## 准确性来源

- 实际生产主机：`ssh friday`，即 `friday@ssh.zhuorui.me`；
- 生产目录：`/opt/apps/ascend`；
- Compose 文件：`compose.production.yml`；
- 宿主机持久化目录：`data/` 与 `backups/`；
- 站内上传目录：`data/uploads/`；
- 公网域名：`ascend.zhuorui.me`；
- 当前脚本以 `package.json` 为准；
- 页面和 API 清单以 `src/app` 为准。

## 验证

更新完成后进行以下检查：

- 扫描文档中的旧域名、旧 Mac mini 主部署描述及错误的 `compose.productions.yml`；
- 对照 `package.json` 验证所有 npm 脚本；
- 对照 `compose.production.yml` 验证卷路径和服务名；
- 检查 Markdown 链接和代码块；
- 查看 Git diff，确保没有写入秘密信息或修改无关文件。
