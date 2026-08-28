# Next.js RSC 回流调查（2026-07-17）

状态：历史调查。实验基于 Next.js 16.2.10；当前项目版本见根目录 `package.json`。

## 现象

Server Action 完成写库并返回约 36 KB flight，响应包含 `x-action-revalidated`。软导航到达的页面仍可能保留旧 RSC 树，表现为乐观行短暂出现后消失，硬刷新后显示数据库结果。

## 隔离实例矩阵

整页硬加载后，以下调用形状应用了 RSC 回流：

- 事件内直接 `startTransition(async () => await action())`；
- 事件内直接 async 调用；
- 事件内发起 Action 后接 `.then()`；
- `confirm()` Promise 回调内调用。

以下调用形状稳定丢失回流：

- `setTimeout` 中启动 transition；
- transition 内在 Action 前加入额外 `await`。

软导航场景中，实验里的 `refresh()` 组合均未应用回流。相同写入改用 `revalidatePath()` 后，硬加载、软导航和往返路由缓存三种场景均获得新数据。

## 当时结论

结构性写入由 Server Action 调用 `revalidatePath()`，并覆盖所有读取该数据的路由。事件内的乐观状态负责即时反馈，路由失效负责后续导航一致性。

当前开发契约见 [`docs/development.md`](../../development.md)。升级 Next.js 后如需重新评估，以隔离实例复现实验并记录新版本、导航来源、响应头与客户端应用结果。
