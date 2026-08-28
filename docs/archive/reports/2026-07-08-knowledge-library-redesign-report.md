# 2026-07-08 知识库与收纳重设计报告

## 结论

[COMPUTED] 本轮改动已把收纳窗口从“粘贴/拖入即上传”改为“附件先排队，点击发送后才入库”。

[COMPUTED] 本轮改动已给入库登记补上分类、文件夹、科目、知识点和多标签字段。

[COMPUTED] 本轮改动已把知识库改成按科目、标签、文件夹、知识点过滤的统一页面。

[COMPUTED] 本轮改动已修复计划页因源 Markdown 缺失导致页面级错误的问题。

[COMPUTED] 本轮结束时 `3000` 端口没有监听进程。

## 关键取舍

[INFERRED] 原左侧导航的问题不是入口数量本身，而是按数据库表暴露入口，导致“知识地图、科目、资料库、错题、视图”互相抢主次。

[COMPUTED] 新导航按“工作台 / 知识 / 复盘”分组，保留原有页面入口，但把知识库作为知识操作主入口。

[INFERRED] 网盘式操作的第一步应该是稳定的虚拟目录模型，而不是把内容寻址文件存储改回真实目录存储。

[COMPUTED] 新实现把 `folder_path` 存在资产记录上，实际文件仍走已有 blob 去重存储。

## 改动范围

[COMPUTED] `src/components/CapturePanel.tsx`：附件排队、发送后上传；增加分类、文件夹、科目、知识点、多标签登记；错题分类的文字记录写入错题接口。

[COMPUTED] `src/app/knowledge/page.tsx`：新增筛选侧栏、文件夹视图、知识点列表、文件列表。

[COMPUTED] `src/components/Sidebar.tsx`：左侧导航重排为三组。

[COMPUTED] `src/lib/db.ts` 和 `src/lib/repository.ts`：资产新增 `category`、`folder_path`，并新增知识库聚合查询。

[COMPUTED] `src/lib/plan.ts` 和 `src/app/plan/page.tsx`：计划文件安全读取，缺文件显示空状态。

[COMPUTED] `src/lib/repository.test.ts` 和 `src/lib/plan.test.ts`：新增目录/分类/筛选/计划缺文件测试。

## Bug 根因

[COMPUTED] 收纳窗口旧逻辑在 `addFiles` 内直接调用上传函数。

[INFERRED] 所以用户粘贴图片后即使随后删除附件，数据库里也已经产生资产记录。

[COMPUTED] `/plan` 旧逻辑直接读取 `agent沟通/02_十周做题驱动备考计划.md`。

[COMPUTED] 当前本机没有找到该 Markdown 文件。

[INFERRED] 服务端组件读缺失文件会抛出文件不存在错误，浏览器侧表现为页面需要 reload。

## 验证

[COMPUTED] `npm test` 通过：17 个测试文件，48 个测试用例。

[COMPUTED] `npm run lint` 通过：退出码 0。

[COMPUTED] `npm run build` 通过：Next.js 16.2.10 生产构建和 TypeScript 检查通过。

[COMPUTED] `lsof -nP -iTCP:3000 -sTCP:LISTEN` 无输出：端口 3000 未被监听。

## 剩余边界

[KNOWN] 本轮没有启动浏览器做交互截图验证，因为用户要求完成后自行启动服务。

[INFERRED] 真正的网盘式拖拽移动、重命名文件夹、批量移动文件可以作为下一步在现有 `folder_path` 模型上继续做。
