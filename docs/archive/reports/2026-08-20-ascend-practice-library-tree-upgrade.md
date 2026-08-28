# Ascend Practice 题目文件夹树升级交付

日期：2026-08-20

## 交付结果

- [COMPUTED] VS Code 扩展升级到 0.4.0，左侧新增“题目文件夹”个人整理树。
- [COMPUTED] 支持根文件夹与多级子文件夹的新建、重命名、移动和空文件夹删除。
- [COMPUTED] 题目可拖入文件夹；拖到另一题上时持久化到该题之后；文件夹可通过拖拽改变父级。
- [COMPUTED] 个人文件夹使用独立数据表，训练题单的阶段、来源和课程关系保持完整。
- [COMPUTED] 每道题获得工作区内唯一且持久的 `library_number`，界面以三位起步格式显示，例如 `007 · A+B Problem`。
- [COMPUTED] 新增题目取得下一个编号，已有题目的移动、重新导入和服务重启沿用原编号。
- [COMPUTED] 本地 `main.cpp` 目录路径保持稳定，虚拟文件夹调整只更新服务器中的组织关系。

## 完整性保护

- [COMPUTED] 服务端拒绝文件夹移动到自身或子树，避免形成循环。
- [COMPUTED] 同级文件夹名称按大小写无关方式保持唯一。
- [COMPUTED] 文件夹删除要求内容为空，题目与子文件夹因此获得明确的迁移步骤。
- [COMPUTED] 所有读取和写入按 `workspace_id` 隔离，设备令牌继续绑定单一工作区。

## 验证证据

- [COMPUTED] 主项目 ESLint、生产构建、124 个测试文件和 684 项测试通过。
- [COMPUTED] 扩展连接、题目树与刷题会话 9 项 Node 测试通过。
- [COMPUTED] 隔离实例完成浏览器设备配对、题目库初始化、两级文件夹创建、重命名、题目拖拽排序、循环保护和非空删除保护。
- [COMPUTED] 隔离服务重启后，文件夹层级、题目位置与稳定编号保持一致。
- [COMPUTED] `dist/ascend-practice-0.4.0.vsix` 完整性校验通过，WSL: Ubuntu 已安装 `zzr.ascend-practice@0.4.0`。

## 运维说明

- [KNOWN] Ascend 服务重启时会应用 `0035_algorithm_library_tree` 迁移，并为现有题目按原始 ID 顺序分配稳定编号。
- [KNOWN] VS Code 执行一次“Developer: Reload Window”后加载 0.4.0 的题目文件夹树。
