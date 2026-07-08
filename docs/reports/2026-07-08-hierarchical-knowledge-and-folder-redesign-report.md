# 2026-07-08 层级知识库与文件夹整改报告

## 结论

[COMPUTED] 收纳窗口已从扁平“科目 + 知识点”改为“科目 > 章节 > 章节内知识点标签”。

[COMPUTED] 知识点标签支持多选，也支持输入后创建；新标签归属于当前章节，后续可在该章节复用。

[COMPUTED] 知识库页新增科目、章节、章节内知识点的管理面板，支持新增、改名、删除。

[COMPUTED] 文件夹模型已从路径筛选升级为显式文件夹树，支持点击进入层级目录、新建子文件夹、上传到当前文件夹、拖文件到文件夹移动。

## 设计修正

[INFERRED] 上一版最大错误是把“知识分类”和“文件夹”混为一谈。

[COMPUTED] 现在知识分类使用 `subjects`、`subject_chapters`、`knowledge_tags`、`asset_knowledge_tags`。

[COMPUTED] 文件夹使用 `folders` 和 `assets.folder_path`。

[INFERRED] 这样章节和知识点标签服务学习管理，文件夹服务网盘式文件组织，两套结构可以关联但不互相冒充。

## 数据兼容

[COMPUTED] 现有知识地图会按 `knowledge_points.submodule` 自动回填章节，并把原知识点标题回填为章节内知识点标签。

[COMPUTED] 旧资产仍保留，新增资产可继续写入 `category`、`folder_path`、章节和章节内标签。

## 验证

[COMPUTED] `npm test` 通过：17 个测试文件，51 个测试用例。

[COMPUTED] `npm run lint` 通过：退出码 0。

[COMPUTED] `npm run build` 通过：Next.js 16.2.10 生产构建和 TypeScript 检查通过。

## 当前边界

[KNOWN] 本轮未启动本地服务做浏览器截图验证，因为之前要求完成后由用户自行启动。

[INFERRED] 如果后续继续强化网盘体验，下一步应加文件夹重命名、文件夹拖拽移动、批量选择和右键菜单。
