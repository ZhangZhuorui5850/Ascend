# 算法训练平台与 VS Code 扩展强化设计

日期：2026-08-25
状态：实施中

## 1. 目标

本轮把算法训练从快速增长阶段推进到稳定平台阶段，覆盖以下结果：

1. 多个 Ascend 服务器、工作区和设备拥有完全隔离的本地状态。
2. Web 与 VS Code 并发编辑草稿时提供显式冲突检测和版本恢复。
3. 本地编译运行具备输出上限、进程树终止和可解释失败结果。
4. Web、VS Code 与 Agent 共享统一训练会话和应用命令。
5. VS Code API 使用版本化契约、结构化错误、能力发现和请求追踪。
6. VS Code 扩展形成可独立测试的连接、协议、同步、会话、运行与 UI 模块。
7. 今日推荐规则拥有唯一实现，并向每个客户端返回推荐原因。
8. 内置插件通过贡献接口接入 Today 与 Analytics。

## 2. 稳定身份与本地状态

服务端向设备返回以下稳定身份：

- `serverInstanceId`：服务实例公开标识，首次迁移时生成 UUID；
- `workspaceId`：当前设备绑定的工作区标识；
- `deviceId`：当前设备标识；
- `profileId`：VS Code 根据服务地址与运行环境生成的本地连接标识。

本地题目键定义为：

```text
serverInstanceId / workspaceId / problemId / language
```

`.ascend.json` 使用带版本的元数据：

```json
{
  "schemaVersion": 2,
  "profileId": "...",
  "serverInstanceId": "...",
  "workspaceId": "...",
  "deviceId": "...",
  "problemId": 12,
  "language": "cpp17"
}
```

连接切换会取消全部同步计时器、清理会话缓存、关闭题面面板并重新加载题树。旧版路径记录在首次读取时迁移到当前连接命名空间。

## 3. 草稿并发协议

每个草稿拥有单调递增的 `revision` 和内容 `sha256`。读取返回当前修订；保存携带调用方读取时的 `baseRevision` 与稳定 `operationId`。

```text
PUT draft(baseRevision = 18)
├── currentRevision = 18 → 保存 revision 19
├── 内容哈希相同       → 幂等成功，保持当前 revision
└── currentRevision ≠ 18 → 409 DRAFT_CONFLICT
```

冲突响应包含当前修订、更新时间、设备名称和 sha256。源码通过单独的授权读取路径获取，避免冲突响应扩大源码暴露面。Web 展示“载入云端版本”和“将本地内容保存为新版本”；VS Code 展示差异并提供明确选择。

## 4. 训练会话应用层

统一会话模型由应用命令维护：

- `startPracticeSession`
- `recordPracticeActivity`
- `recordPracticeHint`
- `savePracticeDraft`
- `submitPracticeCode`
- `finishPracticeSession`
- `savePracticeReflection`

客户端只提交意图和测量值，服务端从题目、设备和工作区读取可信上下文。正式 Judge 与人工结果最终都投影为同一 `algorithm_attempts`、学习证据、复测和分析读模型。

## 5. VS Code API v1

新入口位于 `/api/algorithm/v1/*`。旧 `/api/algorithm/vscode/*` 在一个兼容周期内转发到同一应用服务。

所有响应包含：

```json
{
  "ok": true,
  "apiVersion": 1,
  "requestId": "...",
  "data": {}
}
```

错误响应包含：

```json
{
  "ok": false,
  "apiVersion": 1,
  "requestId": "...",
  "error": {
    "code": "DRAFT_CONFLICT",
    "message": "云端草稿已经更新",
    "retryable": false,
    "details": {}
  }
}
```

`GET /api/algorithm/v1/capabilities` 返回服务身份、工作区身份、支持语言、Judge 能力、草稿并发能力和协议范围。

## 6. VS Code 扩展结构

```text
extensions/ascend-practice/src/
├── extension.ts
├── connection/
├── api/
├── library/
├── session/
├── sync/
├── runner/
├── webview/
└── commands/
```

构建使用 TypeScript 与 esbuild 输出单一 CommonJS 入口。纯领域模块使用 Node test；关键用户路径使用 VS Code Extension Host 集成测试。发布包只包含构建产物、资源、README 和 LICENSE。

## 7. 本地运行安全

本地运行器执行以下保护：

- stdout 与 stderr 各 1 MiB 上限；
- 编译 30 秒、样例 5 秒默认超时；
- 超时和输出超限终止完整进程树；
- 输出结果携带 `timedOut`、`outputLimited`、`durationMs` 和退出码；
- 输出面板只展示有界摘录；
- Windows、Linux、macOS 使用平台对应的进程树终止策略。

## 8. 推荐引擎与插件贡献

`buildAlgorithmTodayQueue()` 是今日推荐唯一实现，输入题目读模型、日期和容量，输出：

```ts
type RankedProblem = {
  problem: AlgorithmProblem;
  reason: "due_review" | "in_progress" | "material_review" | "priority_new" | "continue_learning";
  reasonLabel: string;
  score: number;
};
```

插件贡献注册表提供 `todayRecommendations` 与 `analytics` handler。核心运行时遍历已启用插件并调用对应 handler，插件 ID 分支留在各自贡献实现内部。

## 9. 验收证据

- repo 单测覆盖草稿并发、修订幂等、会话命令和推荐排序；
- API 契约测试覆盖能力发现、结构化错误、401、409 和兼容路由；
- 扩展单测覆盖状态命名空间、连接切换、同步冲突和输出上限；
- Extension Host 测试覆盖激活、命令注册、连接恢复和窗口重载；
- `npm test`、`npm run lint`、`npm run typecheck`、`npm run build` 全部通过；
- verify skill 在隔离实例完成登录、配对、开题、双端冲突、运行、结果回写和跨服务器隔离验证。
