# 知识结构与学习工作台重构报告

日期：2026-07-16

## 设计结论

- [KNOWN] 图谱区负责定位、层级理解与结构编辑；右侧工作台负责单个知识点的学习加工与证据回看。
- [KNOWN] 右侧默认任务是主动回忆卡，资料、错题、复习记录按独立内容分区组织。
- [KNOWN] 科目名称、考试形式与删除操作集中进入“科目设置”，顶部保留视图、排序两组高频控制。
- [KNOWN] 手机端选中知识点后进入全屏工作台，关闭按钮回到图谱；底部导航在编辑期间收起。

## 信息架构

1. 知识点身份：标题、目标层级、复习排期、真题属性。
2. 学习状态：掌握度、首次学习入口、复习次数与最近复习。
3. 主动回忆：检索问题 + 答案骨架，支持 `Ctrl/Cmd + Enter` 保存并反馈同步状态。
4. 学习证据：资料、错题、复习轨迹分别呈现，数量直接显示在分区导航中。

## 调研依据

- [INFERRED] [RemNote 的笔记内回忆卡](https://www.remnote.com/feature/flashcards-in-your-notes)支持“知识内容与主动回忆位于同一工作流”的结构选择。
- [INFERRED] [RemNote 间隔重复说明](https://help.remnote.com/en/articles/6022755-getting-started-with-spaced-repetition)支持突出到期状态、练习反馈与自动排期。
- [INFERRED] [Atlassian 导航设计复盘](https://www.atlassian.com/blog/how-we-build/designing-atlassians-new-navigation)支持以缩进表达层级并控制标签噪音。
- [INFERRED] [Carbon Tabs 指南](https://carbondesignsystem.com/components/tabs/usage/)支持在侧面板中用分区导航降低认知负担。
- [INFERRED] [W3C 手风琴模式](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/)与 [WAI 页面结构指南](https://www.w3.org/WAI/tutorials/page-structure/)支持显式状态、语义区域和键盘可达结构。

## 实现范围

- `SubjectWorkbench.tsx`：工作台标题层级、图谱/目录切换、排序控制、科目设置收纳。
- `MindMapView.tsx`：稳定双栏结构、选中前引导、知识点选中状态。
- `PointDetailPanel.tsx`：学习状态、层级按钮、分区导航、资料/错题/复习证据视图。
- `PointRecallEditor.tsx`：问答结构、保存状态、快捷键与异常处理。
- `globals.css`：桌面双栏比例、现代节点卡、右侧工作台、全屏移动面板、缩放和溢出修复。

## 验证

- [COMPUTED] 桌面 1440px：图谱区 629.6px，详情区 440px，页面横向溢出为 0。
- [COMPUTED] 手机 390×844：详情工作台覆盖完整视口，根页面横向溢出为 0。
- [COMPUTED] Vitest 30 个文件、230 条测试通过；ESLint 通过；Next.js 生产构建通过。
- [COMPUTED] 视觉验收截图：`knowledge-workbench-desktop.png`、`knowledge-workbench-detail.png`、`knowledge-workbench-mobile.png`。
