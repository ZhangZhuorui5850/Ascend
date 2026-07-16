# Node 24 运行时对齐报告

## 背景

开发服务器使用 Node 24.15.0，工作区中的 `better-sqlite3` 曾由 Node 22 编译。两者对应的 Node ABI 分别为 137 和 127，原生模块加载因此返回 `ERR_DLOPEN_FAILED`。

## 调整

- `.nvmrc` 固定为 Node 24.15.0。
- `package.json` 与 `package-lock.json` 将 Node 引擎范围设为 `>=24 <25`。
- Docker 的依赖、构建和运行阶段统一使用 Node 24。
- GitHub Actions继续读取 `.nvmrc`，本地、CI 与容器共享同一主版本。
- `better-sqlite3` 使用 Node 24 重新编译。

## 验收

- `process.versions.modules` 为 137。
- `better-sqlite3` 可加载并完成内存数据库读写。
- 全量测试、ESLint、生产构建与隔离页面启动均使用 Node 24 执行。
