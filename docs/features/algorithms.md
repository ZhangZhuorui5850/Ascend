# 算法训练工作台

当前网页入口为 `/practice/algorithms`，由 `AlgorithmTrainingBoardV2` 提供任意日期训练计划、逾期处理、统一题库目录、完整题目编辑、CPP 上传导入、训练结果记录、设备管理与撤销。网页草稿、样例运行与 Judge 提交在 VS Code 扩展内完成。

`algorithm_library_folders` 与 `algorithm_library_items` 是物理目录的唯一数据源。算法工作台、网盘 `/assets?scope=algorithms&folder=<folderId>` 和 VS Code「题库目录」读取同一组目录 ID、父子关系与排序。网盘根目录中的“算法训练”使用普通文件夹交互，目录内同时显示子文件夹、题目和题目关联资料。

## 课程主线

题库内置“中关村学院机试学习路线”，依次组织为基础语法与 STL、模拟与枚举、前缀和/双指针/二分、递归与分治、DFS/BFS/回溯、动态规划与背包、贪心、图论与最短路、历年机试综合九章。课程章节和题目关系保存在 `algorithm_curriculum_chapters`、`algorithm_curriculum_items`；初次升级依据来源、训练周次和算法标签完成存量归档，后续调整保存为明确的数据库关系。历年题可同时保留专题主章节和历年机试综合附加章节。

课程章节承担学习顺序；“程序设计实习·例题”“课后习题”和历年批次作为来源题单；`W1–W7` 表达训练阶段；算法标签支持跨章节检索。同一道题保留这些平行维度。

## 网页流程

1. 在「算法训练」点击「添加 CPP」，选择多个 `.cpp` / `.cc` / `.cxx` 文件或整个文件夹。
2. 导入预览从文件头注释、文件名和题号提取标题、来源题单建议、训练阶段与标签；用户可在提交前修正字段。
3. 导入结果进入当前 workspace 的题库。内容哈希命中已有题目时更新元数据并保留训练证据。
4. 在题库按目录、状态、课程章节、来源题单、平台和标签筛选，再加入任意日期的训练计划。筛选状态通过 `tab`、`day`、`folder`、`problem`、`q`、`status`、`course`、`source`、`platform`、`tag`、`sort`、`page` 参数保存。
5. 训练计划通过上一天、下一天、日期输入和“回到今天”导航。今天页聚合全部逾期未完成项，支持逐题或原子批量移到今天。历史计划可按当天完成、移到今天或补记原日期完成。
6. 题库使用目录、题目列表和详情检查器三栏结构。列表读取摘要，打开题目后按题加载 Markdown 题面、样例、参考资料和训练记录。文件夹支持创建、重命名、移动、排序、删除空目录、删除并提升内容；题目支持完整 CRUD、拖放和批量操作。

服务器永久题号保存在 `algorithm_library_items.library_number`。课程、来源、知识点、文件夹和每日计划属于组织关系，同一道题可出现在多个训练视图中。

## 便携题库包

题库页支持导出和一键导入 `.ascend-algorithms.json` 文件。勾选题目可导出指定集合，“导出当前结果”可导出当前筛选范围；文件内保存题面、样例、语言与代码模板、参考代码、标签、原始题号、文件夹路径、来源题单和课程章节关系。训练记录、草稿、复习状态、设备与用户覆盖字段继续保存在原 workspace。

迁移到另一台服务器的流程：

1. 在源服务器的题库页选择范围，点击“导出题库包”并保存 JSON 文件。
2. 登录目标服务器，在算法训练顶部点击“导入题库包”，选择该文件。
3. 核对预览中的新增、复用、更新、内容一致、编号顺延和内容提示，选择目标文件夹。
4. 保持“创建独立题库文件夹”开启并执行导入；导入结果同时出现在个人文件夹和“来源课程与题单”中。

包格式使用 `ascend.algorithm-library` schema 与整数版本号。服务端校验 JSON 结构、题目内容 SHA-256、1000 题数量上限和 20 MB 文件上限。相同 package ID 与题目 ID 形成稳定导入映射；重复导入更新包管理的基础内容，已有平台题号或来源链接会复用现有题目，用户覆盖字段与个人训练数据持续生效。源永久题号空闲时直接沿用，发生占用时从目标题库下一个可用编号顺延。

## VS Code 连接

当前扩展版本为 0.9.4，安装包名为 `ascend-practice-0.9.4.vsix`。

1. 在 VS Code 运行 `Extensions: Install from VSIX...` 并选择发布目录中的安装包。
2. 运行 `Ascend: 浏览器配对新服务器`，输入 Ascend 地址。
3. 在浏览器确认设备名称和配对码，批准该设备。
4. 从 Ascend 活动栏打开题目，本地编辑 `main.cpp` 并运行样例或自定义输入。

扩展保存多个服务器档案。设备令牌绑定单一 workspace，服务端保存哈希，VS Code SecretStorage 保存明文令牌。Windows、WSL 和远程开发主机分别配对；网页「连接与设置」弹窗可随时撤销设备，撤销后该设备令牌立即失效。

打开题目后，侧边面板显示只读题面和训练工具栏，编辑区使用普通 `main.cpp`。工作区包含 `problem.md`、公开样例、`custom.in` 与 `.ascend.json`。保存后同步云端加密草稿；修订冲突提供载入云端和保留本地两条显式路径。

侧栏包含“训练计划 · 日期”“到期复习”“题库目录”三个浅层根节点。日期选择包含今天、昨天、前天、明天和自定义日期，并按 workspace 记忆。AC 结果通过统一事务同时落训练证据、复习状态和关联 Planner 任务；WA、CE、TLE、MLE、RE 保留计划项。

本地作答目录可配置为：

```json
{
  "ascendPractice.localRoot": "/mnt/c/Users/example/algorithm-workspace",
  "ascendPractice.templatePath": "/mnt/c/Users/example/algorithm/template.cpp",
  "ascendPractice.localDirectoryLayout": "library"
}
```

`library` 按服务端题库目录创建首次打开的新题，`phase` 延续 W1/W2 阶段布局。已有本地作答目录继续沿用 `.ascend.json` 路径映射。

## 数据、安全与备份

- 题库、课程章节、来源题单、文件夹、计划、训练证据、设备和代码版本位于 workspace 隔离的 SQLite 数据中。网盘、网页训练台和 VS Code 扩展共享这套数据。
- 网页草稿使用 `ASCEND_JUDGE_CODE_KEY` 加密；密钥由部署环境或 secret manager 注入。
- 题目附件进入私人网盘的内容寻址存储，通过 `algorithm_problem_assets` 关联。
- C++ 本地编译和公开样例运行发生在 VS Code 主机；在线正式评测通过独立 Judge Gateway。
- `npm run backup:verified` 覆盖数据库、附件哈希、引用关系与隔离恢复。源码密钥通过独立密钥渠道恢复。

Judge 上线门禁见 [Judge Gateway 安全手册](../security/judge-gateway.md)，物理设备验收见 [真实设备证据](../algorithm-real-device-acceptance.md)。
