# Ascend 故障排查

本页保存按需加载的运行与浏览器排障经验。生产拓扑和恢复步骤见 [部署手册](./deployment.md) 与 [备份恢复手册](./backup-restore.md)。

## 生产服务

```bash
ssh friday
cd /opt/apps/ascend
docker compose -f compose.production.yml ps
docker compose -f compose.production.yml logs --tail=200 app caddy
curl -fsS https://ascend.zhuorui.me/api/health
```

页面版本落后时，核对服务器 commit、应用镜像构建时间和容器创建时间。Caddy 负责公网 HTTPS，Next.js 应用端口只存在于 Compose 网络。

## Playwright

- 登录页选择器：`input[name="email"]`、`input[name="password"]`、`button[type="submit"]`。
- Chromium 原生拖拽可使用 `mouse.down()`、分步 `mouse.move()`、`mouse.up()`。目标元素保持在视口内；长列表场景可扩大视口高度。
- `chromium-headless-shell` 的 CJK 字体取决于宿主环境。视觉证据使用安装完整字体的浏览器环境。
- RSC 写入等待以可观察 UI 或响应完成为准；`networkidle` 适合作为附加稳定条件。
- Service Worker 或缓存场景使用全新 browser context，记录安装、离线、恢复在线与重载顺序。
- 慢网络场景固定延迟和吞吐参数，并分别记录保存中、失败恢复和重试结果。

测试脚本与截图放在临时目录。日志和证据移除密码、token、邮箱、私人源码、隐藏用例与个人通知。

## 进程与数据清理

验收启动时保存进程 PID 和临时根目录。收尾按 PID 终止该实例，确认端口释放，再删除已核对路径下的临时数据。生产数据根目录为远端 `/opt/apps/ascend/data/`，始终通过备份恢复手册管理。
