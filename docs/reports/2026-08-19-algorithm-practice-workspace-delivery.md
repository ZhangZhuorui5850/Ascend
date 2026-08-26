# 算法刷题工作台交付记录

日期：2026-08-19

## 交付范围

- [COMPUTED] 本地 C++ 目录扫描器从 `zgca/algorithm` 解析出 88 道题，包含题面、样例、阶段、优先级、来源与素材状态。
- [COMPUTED] 题库形成 W1–W5、Extra、课程来源、固定题单、个人练习和四场模拟考试，共 18 个题单。
- [COMPUTED] 算法工作台提供今日训练、题库筛选、题单浏览、导入预览、设备管理、网页代码编辑、版本历史与网盘附件。
- [COMPUTED] VS Code 设备 API 覆盖队列、题目包、加密草稿和训练结果；设备令牌绑定单一 workspace，并以哈希形式保存。
- [COMPUTED] `Ascend Practice` 扩展提供活动栏队列、普通本地文件工作区、C++ 样例运行、自动同步和训练结果回写。

## 数据与迁移

- [COMPUTED] 迁移 `0033_algorithm_practice_workspace` 新增题单、导入来源、题目附件、VS Code 设备与代码版本表，并扩展题目内容和训练字段。
- [COMPUTED] 现有用户数据库包含 118 道题，其中本地导入 88 道、内置题 30 道；本轮重复导入的 88 个内容哈希全部保持一致。
- [KNOWN] 源资料保留 9 条解析提醒，集中在模拟考试 OCR 题面的缺失字段；导入预览持续展示这些提醒。
- [COMPUTED] 本机 `.env.local` 已配置算法目录白名单与独立 32 字节草稿加密密钥，文件受 Git 忽略规则保护。

## 验证证据

- [COMPUTED] `npm run lint` 通过。
- [COMPUTED] `npm test` 通过，共 121 个测试文件、678 项测试。
- [COMPUTED] `npm run build` 通过，五个新增 API 路由进入 Next.js 生产路由清单。
- [COMPUTED] 隔离实例完成登录、首次引导、扩展启用、88 题导入、18 题单读取、设备令牌创建、VS Code API 调用、加密草稿、代码版本、训练证据与附件上传。
- [COMPUTED] 隔离验证使用独立数据目录 `/tmp/ascend-algorithm-verify.mJiSbM/verify-data` 和端口 `3127`，验收后服务已停止。
- [COMPUTED] VSIX 已生成到 `dist/ascend-practice-0.1.0.vsix`，包内共 7 个运行文件，大小约 9.7 KB。

## 运行说明

- [KNOWN] 构建会重写 `.next`，本机 Ascend 服务需要重新启动以加载新代码和 `.env.local`。
- [KNOWN] VS Code 通过 `Extensions: Install from VSIX...` 安装发布包，并使用网页生成的一次性设备令牌连接。
- [KNOWN] 目录导入与草稿密钥的部署配置见 `docs/algorithm-practice-workspace.md`。
