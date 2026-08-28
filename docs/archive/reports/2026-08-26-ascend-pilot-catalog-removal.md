# Ascend 内置试点题库移除记录

日期：2026-08-26

## 结果

- [COMPUTED] 30 道 `ascend://catalog/` 内置试点题已从当前数据库删除，保留 88 道用户导入题。
- [COMPUTED] 应用启动和算法插件启用流程已取消内置题库播种。
- [COMPUTED] 迁移 `0039_remove_ascend_pilot_catalog` 会清理存量工作区中的对应题目及级联元数据。
- [COMPUTED] Judge Gateway 内置题目清单为空；后续评测题目通过独立、可追溯的题包提供。
- [COMPUTED] Markdown 题库导出器按数据库实际数量生成目录，并在重建前清理旧题目文件。

## 验证

- [COMPUTED] 全量 Vitest：128 个测试文件、717 项测试通过。
- [COMPUTED] TypeScript、ESLint 和 Next.js 生产构建通过。
- [COMPUTED] 隔离生产实例完成登录、算法插件启用和题库页面访问；数据库中的退役题目数量为 0，迁移记录存在。
- [COMPUTED] 当前数据库外键检查为 0 条违规。

## 恢复边界

- [KNOWN] 删除前 SQLite 快照保存在本机 `backups/pre-ascend-catalog-removal/`，该目录由 Git 忽略。
- [KNOWN] 代码恢复需要同时恢复对应 Git 提交与迁移前数据库快照。
