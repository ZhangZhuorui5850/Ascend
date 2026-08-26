# 算法训练平台与 VS Code 扩展强化实施计划

日期：2026-08-25
依据：`docs/superpowers/specs/2026-08-25-algorithm-practice-platform-hardening-design.md`

## Phase 1：数据安全基线

1. 增加服务实例 ID 与草稿 revision 迁移。
2. 扩展本地状态使用连接命名空间。
3. 连接切换清理旧运行态和同步任务。
4. 草稿保存增加乐观并发、幂等键和冲突测试。
5. 本地运行器增加输出上限与进程树终止。

## Phase 2：统一协议与会话

1. 建立共享 Zod API contract。
2. 增加 `/api/algorithm/v1/capabilities`、queue、problem、draft、session 和 submission 路由。
3. 旧 VS Code 路由复用相同 handler。
4. 建立训练会话 application commands。
5. Web 与 VS Code 接入统一会话写路径。

## Phase 3：扩展工程化

1. 引入 TypeScript 与 esbuild。
2. 拆分连接、API、同步、会话、本地运行和 UI 模块。
3. 保持命令 ID、配置项和用户数据迁移兼容。
4. 增加 Extension Host 测试和 VSIX 内容契约。

## Phase 4：推荐与插件贡献

1. 抽取算法今日推荐领域服务。
2. Web 与 VS Code queue 复用同一结果。
3. 建立插件贡献 handler 注册表。
4. Today 与 Analytics 通过贡献注册表聚合。

## Phase 5：验证与交付

1. 执行格式、单测、lint、类型检查和生产构建。
2. 打包 VSIX 并检查内容。
3. 使用 verify skill 完成隔离端到端验证。
4. 写交付报告，记录计算证据和运行说明。
