# 算法训练平台与 Ascend Practice 0.7.0 升级交付

日期：2026-08-25

## 交付结果

- [COMPUTED] 服务端生成稳定 `server_instance_id`；VS Code 本地题目路径、会话和同步状态按服务器实例、工作区、设备档案隔离。
- [COMPUTED] 草稿写入采用 `baseRevision + operationId` 乐观并发协议，服务端返回结构化 409，网页与 VS Code 均提供载入云端、保留本地两种冲突处理。
- [COMPUTED] Web 与 VS Code 共用训练会话应用层，统一记录客户端、设备、有效作答时间、思路、作答前信心、提示级别、结果与复盘；模板重开会结束旧的进行中会话。
- [COMPUTED] 新增 `/api/algorithm/v1/*` 版本化契约与能力发现入口；旧 `/api/algorithm/vscode/*` 继续复用同一读写逻辑。
- [COMPUTED] 全局代理允许算法设备入口执行自身 Bearer 或配对鉴权，浏览器配对发起、设备令牌换取与 v1 API 调用形成完整链路。
- [COMPUTED] VS Code 本地运行器限制 stdout、stderr 各 1 MiB，设置编译与运行超时，并按平台终止完整进程树。
- [COMPUTED] 扩展升级到 0.7.0，采用 TypeScript 入口、严格类型 API 客户端与 esbuild 单文件发布包；核心状态、同步、活动计时、运行器和题库逻辑已拆为独立模块。
- [COMPUTED] 今日推荐统一由 `buildAlgorithmTodayQueue()` 排序；插件运行时通过注册表调用 `todayRecommendations` 与 `analytics` 贡献。

## 验证证据

- [COMPUTED] 主项目 128 个测试文件、716 项测试通过；ESLint、TypeScript、生产构建与 `git diff --check` 通过。
- [COMPUTED] 扩展 21 项 Node 测试与 TypeScript 检查通过；真实 VS Code Extension Host 完成激活和五项关键命令注册检查。
- [COMPUTED] `dist/ascend-practice-0.7.0.vsix` 打包成功，只包含清单、README、LICENSE、图标和 138.6 KB CommonJS 构建入口。
- [COMPUTED] 隔离实例完成登录、插件启用、30 道托管题加载、浏览器设备授权、能力发现、开题、草稿写入、陈旧修订 409、活动记录、AC 回写和网页代码工作区打开。
- [COMPUTED] 两个独立数据目录分别生成 `ascend-23c0925910c9885f79e6054d002b15d6` 与 `ascend-587a0b0d1aa44e253137e72a5002d0d1`；第二服务器同题草稿修订为 0，跨服务器隔离成立。

## 运维说明

- [KNOWN] 部署需要应用数据库迁移 `0037_algorithm_sync_identity` 与 `0038_algorithm_cross_client_sessions`，随后重启 Ascend 服务。
- [KNOWN] 正式评测继续受 Judge Gateway、代码加密密钥和试点准入共同控制；其余题目、草稿、本地样例与人工结果流程可独立使用。
- [KNOWN] 本次生产构建重写了 `.next`；当前开发实例需要重启以加载最新构建状态。
- [KNOWN] VS Code 安装 `dist/ascend-practice-0.7.0.vsix` 后执行一次 “Developer: Reload Window”。
