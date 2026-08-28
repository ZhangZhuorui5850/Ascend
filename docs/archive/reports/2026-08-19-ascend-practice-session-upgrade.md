# Ascend Practice 刷题会话升级记录

日期：2026-08-19

## 交付范围

- [COMPUTED] 题目导入协议将根目录 `template.cpp` 保存为作答模板，将每题原始 CPP 保存为参考代码。
- [COMPUTED] VS Code 打开题目时优先保留已有本地 `main.cpp`，其次恢复云端草稿，首次作答使用 C++ 模板。
- [COMPUTED] 扩展使用只读 Webview 呈现题面、输入输出、样例、计时和训练工具栏，右侧继续使用标准 C++ 编辑器。
- [COMPUTED] 样例测试输出包含编译耗时、运行耗时、退出码和首处输出差异；`custom.in` 支持自定义输入。
- [COMPUTED] 参考代码通过只读虚拟文档打开，查看行为写入本地会话提示级别 L4，并随训练结果回写 Ascend。
- [COMPUTED] 模板新作答会先将当前代码复制到 `.ascend-history`，再重置 `main.cpp` 与会话计时。
- [COMPUTED] 0.1 工作区的题目目录继续原位使用；新题按 W1–W5 与 Extra 分层创建。

## 兼容与安全

- [COMPUTED] VS Code 设备 API 同时保留兼容字段 `sourceCode`，0.1 客户端会收到模板或云端草稿。
- [COMPUTED] Webview 使用本地 CSP nonce 和 HTML 转义，题面内容无法注入脚本或外部资源。
- [COMPUTED] C++ 编译继续通过参数数组调用本地编译器，运行超时后终止子进程。
- [COMPUTED] 参考代码只存在于 API 响应和只读虚拟文档，刷题目录按需生成作答文件。

## 验证

- [COMPUTED] `session-core.test.js` 覆盖草稿/模板选择、输出标准化、首处差异、Markdown 转义和安全目录名。
- [COMPUTED] `npm run lint` 通过；`npm test` 通过，共 122 个测试文件、679 项测试；`npm run build` 通过。
- [COMPUTED] 隔离实例完成首次引导、扩展启用、88 题导入、设备令牌和题目包读取；模板、参考代码和云端草稿分别具有独立内容哈希。
- [COMPUTED] 隔离实例先读取模板，再保存云端草稿并重新读取，API 与网页编辑器均恢复草稿，同时保持模板与参考代码原值。
- [COMPUTED] `dist/ascend-practice-0.2.0.vsix` 包含 8 个运行文件，压缩包校验通过，大小约 16.6 KB。
- [COMPUTED] WSL: Ubuntu 中的 `zzr.ascend-practice` 已从 0.1.0 升级到 0.2.0。
- [COMPUTED] 现有用户的 88 道导入题已重新写入模板与参考代码元数据，题目内容和学习证据保持原值。
