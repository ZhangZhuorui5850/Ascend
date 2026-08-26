# 算法刷题工作台

Ascend 将本地算法资料整理为题库、题单和学习证据，并提供网页编辑与 VS Code 本地开发两条入口。原始题目目录仍可作为资料源，导入后的进度、复测日期、反思、草稿版本和附件由 Ascend 统一管理。

## 功能边界

- 目录导入：扫描白名单目录中的 C++ 题目，提取题面、样例、标签、阶段和优先级。
- 题库与题单：按 W1–W5、来源、模拟考试和个人练习组织题目。
- 今日训练：到期复测、进行中题目和高优先级题目组成每日队列。
- 网页编辑：保存加密 C++ 草稿、版本记录，并关联私人网盘附件。
- VS Code：使用只读题面板、普通本地 `main.cpp`、样例测试、自定义输入和训练会话工具栏完成作答。

## 服务端配置

```dotenv
ASCEND_ALGORITHM_IMPORT_ROOTS=/mnt/c/Users/13110/OneDrive/桌面/zgca/algorithm
ASCEND_JUDGE_CODE_KEY=<32-byte-base64-key>
ASCEND_JUDGE_CODE_KEY_VERSION=1
```

多个导入目录用英文逗号分隔。容器部署需要将目录挂载到容器内，并把 `ASCEND_ALGORITHM_IMPORT_ROOTS` 写成容器内绝对路径。

草稿密钥可用 `openssl rand -base64 32` 生成。密钥通过部署环境或 secret manager 注入，数据库只保存加密后的草稿。轮换密钥时提高 `ASCEND_JUDGE_CODE_KEY_VERSION`，并把旧版本放入 `ASCEND_JUDGE_CODE_PREVIOUS_KEYS_JSON`。

配置完成后重启 Ascend，在「算法训练 → 导入与同步」执行预览与导入。重复导入会按文件内容哈希更新题目，并保留学习进度与代码版本。

## VS Code 连接

1. 在 VS Code 运行 `Extensions: Install from VSIX...`，安装 `dist/ascend-practice-0.8.0.vsix`。
2. 运行 `Ascend: 浏览器配对新服务器`，输入 Ascend 地址。
3. 在自动打开的网页确认设备名称和配对码，然后点击“允许此设备”。
4. 从活动栏 Ascend 视图打开今日题目。

扩展会保存多个服务器连接档案。点击状态栏中的 Ascend 项可直接切换服务器、添加连接或移除本地档案。重启电脑、VS Code 或 WSL 后，扩展会自动恢复当前档案并读取题目。状态栏会分别显示服务器离线、授权失效和等待连接，离线期间连接档案持续保留。

侧栏固定为三个入口：“开始学习”展示当前课程、今日任务、到期复习和继续上次；“浏览题库”按课程与题单、知识点、来源、难度和学习状态组织全部题目；“我的目录”提供个人整理树和未整理收纳。默认展开“开始学习”，其余入口保持折叠。

“我的目录”支持多级文件夹、新建、重命名、内容提升删除、空文件夹删除、目标文件夹选择，以及题目和文件夹拖拽。课程、来源、知识点、搜索结果和学习队列中的题目都可拖入个人文件夹；多选移动会去重并在服务端事务内整体提交。拖动只更新 Ascend 中的组织关系，本地已经生成的 `main.cpp` 路径保持稳定。训练题单继续承载阶段、来源和课程关系，同一道题可以同时出现在个人文件夹与多个训练题单中。

服务器永久题号由 `algorithm_library_items.library_number` 保存，从 `P001` 开始递增。标题前的两位起步序号表示当前列表位置，拖拽与排序后自动重排；永久题号在今日训练、到期复测、个人文件夹和训练题单中保持一致。

“开始学习”和“浏览题库”由题目学习证据与元数据自动计算。搜索支持题目名称、永久题号、平台题号、来源、阶段、优先级和标签；搜索期间侧栏只显示搜索结果。文件夹汇总总题数、到期复测数与稳定比例，题目行显示训练状态、本地代码、云端草稿和同步状态。

文件夹树支持多选批量拖拽和单步撤销，文件夹可以置顶、上下移动；删除文件夹时可以把内容提升到上一级。展开状态、选择位置和排序方式保存在 VS Code workspaceState。

题目右键菜单支持快速编辑训练元数据。本地代码入口会记录题目目录和最近打开时间；文件夹工作区命令根据已经生成本地目录的题目创建 `.ascend-workspaces/*.code-workspace`，并在新 VS Code 窗口中打开。

打开题目后，左侧显示只读题面与训练工具栏，右侧显示普通 `main.cpp`，底部 `Ascend Practice` 输出面板展示编译、样例结果和首处差异。每道题同时生成离线 `problem.md`、`samples/*.in`、`samples/*.out`、`custom.in` 和 `.ascend.json`。

推荐目录结构：

```text
zgca/
├── algorithm/            # 原始题库与 template.cpp
└── algorithm-workspace/  # 实际作答目录
    ├── W1/
    ├── W2/
    └── Extra/
```

首次作答使用题库根目录的 `template.cpp`。本地已有 `main.cpp` 与云端草稿会继续使用；导入的原始 CPP 进入参考代码区。“查看参考”会把本次训练最高提示级别记为 L4。“模板新作答”会先备份当前代码到 `.ascend-history`。

WSL 中可以显式配置 Windows 目录和模板：

```json
{
  "ascendPractice.localRoot": "/mnt/c/Users/13110/OneDrive/桌面/zgca/algorithm-workspace",
  "ascendPractice.templatePath": "/mnt/c/Users/13110/OneDrive/桌面/zgca/algorithm/template.cpp"
}
```

浏览器配对码有效期为 10 分钟，配对成功后换取长期设备令牌。服务端保存令牌哈希，VS Code 使用 SecretStorage 保存原始令牌；连接地址与设备名称进入普通连接档案。Windows 本机、WSL 和远程开发主机各自创建独立设备，令牌可随时在网页撤销。手动令牌连接作为兼容入口保留。

## 数据与备份

- 题库、题单、进度、设备和代码版本位于 Ascend SQLite 数据库。
- 题目附件使用私人网盘的内容寻址存储，并通过 `algorithm_problem_assets` 关联。
- 本地 VS Code 工作区保存可直接编辑的代码副本，可独立使用 Git 备份。
- 模板新作答产生的本地历史位于题目目录的 `.ascend-history`。
- 常规 `npm run backup` 会覆盖数据库与网盘附件；恢复演练需同时验证两者。

## 安全约束

- 网页和 API 只读取配置白名单中的导入目录。
- VS Code API 采用独立设备令牌并绑定单一 workspace。
- C++ 编译与样例运行发生在用户本机 VS Code 环境。
- 在线 Judge 继续通过独立 Judge Gateway 执行，并使用独立凭据与隔离运行环境。
