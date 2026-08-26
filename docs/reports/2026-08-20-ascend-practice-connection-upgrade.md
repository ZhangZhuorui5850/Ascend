# Ascend Practice 连接系统升级交付

日期：2026-08-20

## 交付结果

- [COMPUTED] VS Code 扩展升级到 0.3.0，连接档案按“服务器地址 + VS Code 运行环境”保存，可在状态栏快速切换和移除。
- [COMPUTED] 设备令牌进入 VS Code SecretStorage；0.2.0 的单令牌与服务地址会在首次启动时自动迁移。
- [COMPUTED] 扩展启动后自动恢复当前连接，并分别呈现已连接、服务器离线、授权失效、等待配对和连接异常状态。
- [COMPUTED] 新增 10 分钟浏览器配对流程：VS Code 发起请求，用户在 Ascend 网页核对设备与权限，批准后扩展自动换取长期设备凭据。
- [COMPUTED] 服务端只保存设备令牌与配对凭据的 SHA-256 哈希；配对换取支持幂等重试。
- [COMPUTED] 手动设备令牌入口继续可用，便于离线部署和兼容已有工作流。

## 验证证据

- [COMPUTED] 主项目 ESLint、生产构建、123 个测试文件和 681 项测试通过。
- [COMPUTED] 扩展连接与刷题会话 7 项 Node 测试通过，VSIX 压缩包完整性校验通过。
- [COMPUTED] 隔离实例完成登录、扩展启用、配对发起、浏览器批准、凭据换取、题目队列访问与无效凭据 401 校验。
- [COMPUTED] 隔离服务重启后，原设备凭据与幂等配对结果继续有效。
- [COMPUTED] WSL: Ubuntu 已安装 `zzr.ascend-practice@0.3.0`，发布包位于 `dist/ascend-practice-0.3.0.vsix`。

## 运维说明

- [KNOWN] 生产部署需要应用数据库迁移 `0034_algorithm_device_pairings` 并重启 Ascend 服务。
- [KNOWN] VS Code 安装升级后执行一次“Developer: Reload Window”，扩展会迁移已有连接并自动刷新题目。
