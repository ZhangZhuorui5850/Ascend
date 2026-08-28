# 算法训练工作台

当前网页入口为 `/practice/algorithms`，由 `AlgorithmTrainingBoardV2` 提供今日训练、题库、CPP 上传导入、课程阶段、个人文件夹、网页草稿、VS Code 同步和 Judge 结果复盘。

## 网页流程

1. 在「算法训练」点击「添加 CPP」，选择多个 `.cpp` / `.cc` / `.cxx` 文件或整个文件夹。
2. 导入预览从文件头注释、文件名和题号提取标题、来源、课程建议、阶段与标签；用户可在提交前修正字段。
3. 导入结果进入当前 workspace 的题库。内容哈希命中已有题目时更新元数据并保留训练证据。
4. 在题库按全部、未做、已做、待复习、课程阶段、平台、标签或个人文件夹筛选，再加入指定日期的训练计划。
5. 今日训练保存顺序、完成结果和次日安排；题目详情关联参考代码、草稿版本、提示与复盘。

服务器永久题号保存在 `algorithm_library_items.library_number`。课程、来源、知识点、文件夹和每日计划属于组织关系，同一道题可出现在多个训练视图中。

## VS Code 连接

当前扩展版本为 0.9.2，安装包名为 `ascend-practice-0.9.2.vsix`。

1. 在 VS Code 运行 `Extensions: Install from VSIX...` 并选择发布目录中的安装包。
2. 运行 `Ascend: 浏览器配对新服务器`，输入 Ascend 地址。
3. 在浏览器确认设备名称和配对码，批准该设备。
4. 从 Ascend 活动栏打开题目，本地编辑 `main.cpp` 并运行样例或自定义输入。

扩展保存多个服务器档案。设备令牌绑定单一 workspace，服务端保存哈希，VS Code SecretStorage 保存明文令牌。Windows、WSL 和远程开发主机分别配对；网页设置可撤销设备。

打开题目后，侧边面板显示只读题面和训练工具栏，编辑区使用普通 `main.cpp`。工作区包含 `problem.md`、公开样例、`custom.in` 与 `.ascend.json`。保存后同步云端加密草稿；修订冲突提供载入云端和保留本地两条显式路径。

本地作答目录可配置为：

```json
{
  "ascendPractice.localRoot": "/mnt/c/Users/example/algorithm-workspace",
  "ascendPractice.templatePath": "/mnt/c/Users/example/algorithm/template.cpp"
}
```

## 数据、安全与备份

- 题库、课程、文件夹、计划、训练证据、设备和代码版本位于 workspace 隔离的 SQLite 数据中。
- 网页草稿使用 `ASCEND_JUDGE_CODE_KEY` 加密；密钥由部署环境或 secret manager 注入。
- 题目附件进入私人网盘的内容寻址存储，通过 `algorithm_problem_assets` 关联。
- C++ 本地编译和公开样例运行发生在 VS Code 主机；在线正式评测通过独立 Judge Gateway。
- `npm run backup:verified` 覆盖数据库、附件哈希、引用关系与隔离恢复。源码密钥通过独立密钥渠道恢复。

Judge 上线门禁见 [Judge Gateway 安全手册](../security/judge-gateway.md)，物理设备验收见 [真实设备证据](../algorithm-real-device-acceptance.md)。
