# 算法插件后续升级基线

日期：2026-07-26

## 基线事实

- `[KNOWN]` 当前分支为 `main`，基准提交为
  `d14eb61 fix: harden mobile PWA layout and navigation`。
- `[COMPUTED]` 开始本阶段时，工作区包含 106 个已跟踪文件修改和
  83 个未跟踪文件；其中既有算法插件改动，也有此前项目治理、备份、
  响应式、学习证据和可观测性改动。
- `[KNOWN]` 因多个共享文件同时包含不同批次的修改，直接提交整个工作区
  无法形成可审查的算法插件提交。
- `[KNOWN]` 尝试创建 `codex/algorithm-plugin-pilot` 分支时，Git 元数据写权限
  被沙箱拒绝；提权审批服务随后返回参数错误。因此本阶段先通过本文件和
  实施记录固定边界，不绕过权限限制。
- `[COMPUTED]` 开始本阶段前的验证基线为 70 个测试文件、446 个测试，
  TypeScript、ESLint、CSS 审计和 Next.js 生产构建通过。
- `[KNOWN]` 本地数据库已经应用并校验
  `0028_algorithm_judge_foundation`。按项目规则，0028 从现在起冻结，
  后续数据库变更只能追加 0029 及之后的迁移。

## 本阶段允许修改的主边界

- `src/lib/algorithm-*`
- `src/lib/repo/algorithm-*`
- `src/components/*Algorithm*`
- `src/app/practice/`、`src/app/extensions/`
- `services/judge-gateway/`
- `scripts/*algorithm*`、`scripts/*judge*`
- 算法相关测试、设计、研究、部署和验收文档

共享文件（迁移、Agent、搜索、导出、分析、任务、导航）只做必要的窄修改，
并在交接清单中单独列出。

## 提交门禁

在 Git 元数据写权限恢复后，按以下顺序提交：

1. 插件平台与数据模型；
2. 算法训练 UI、学习证据与核心域集成；
3. 原创试点题库与题库质量测试；
4. Judge Gateway、隔离部署和攻击验证；
5. 端到端验收、试点指标与文档。

任何提交前都必须重新运行全量测试、类型检查、lint、CSS 审计、生产构建和
`git diff --check`。
