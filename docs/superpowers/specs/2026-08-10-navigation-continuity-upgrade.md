# Ascend 导航连续性与局部切换设计

日期：2026-08-10  
分支：`codex/ascend-product-convergence`

## 结论

- [KNOWN] Tasks 的智能视图和清单原先都使用 `/tasks?...` 链接；每次点击会重新执行动态 Server Component、重复读取任务，并以 `view` 为 key 让整个任务组退场和入场。
- [KNOWN] 科目工作台的目录/图谱和聚焦层级所需数据已经全部在客户端，但原先仍通过 `router.push` 重新请求同一个动态页面。
- [KNOWN] 第一版局部导航仍把 Tasks 筛选和科目工作台状态更新包在 React Transition 中；由于 AppShell 同时声明了页面级 `ViewTransition`，本地小按钮仍可能被提升为整页转场。
- [KNOWN] Tasks 的视图间任务 id 大量不重合；若所有任务行都执行 presence 退场/入场，视觉上仍等同于整块刷新。
- [COMPUTED] 这两类交互应属于“已加载工作区内的状态切换”，而不是页面导航。
- [INFERRED] 资料库文件夹和搜索会改变服务端分页数据，不能假装成纯客户端筛选；它仍属于数据驱动导航，但应保留稳定外壳，不叠加额外的整页动画。

## 唯一交互分类

| 层级 | 示例 | 状态与 URL | 动效 |
| --- | --- | --- | --- |
| 控件状态 | 排序、显示模式、展开/收起 | 本地状态；通常不写 URL | 即时颜色、边框或小范围位移 |
| 工作区切换 | Tasks 智能视图/清单、科目目录/图谱/聚焦 | 本地状态 + History API | 外壳不动，只让新增/移除的内容项反馈 |
| 数据驱动浏览 | 资料库文件夹、分页、搜索 | Next 客户端导航并读取新数据 | 稳定页面骨架；不伪装成本地筛选 |
| 同级页面 | Tasks/Calendar、主导航模块 | `nav-switch` | 无方向性的轻量替换 |
| 深入/返回 | 科目列表/详情、Today/日期详情 | `nav-forward` / `nav-back` | 单一方向语义 |
| 临时表面 | Dialog、Drawer、Sheet、Popover | 组件 presence | Base UI 生命周期 + 统一面板令牌 |

不允许同一个交互同时使用页面 View Transition、组件整块退场和列表行布局动画。

## Tasks 数据与状态模型

1. 服务端只读取一次与原实现相同上限的任务源：按 `updated_at` 取最多 2,000 项，同时取得 Inbox id。
2. 服务端仓库查询和客户端工作区共用纯函数 `filterPlannerTaskView`，避免出现两套“今天/近期/逾期”定义。
3. 每个视图继续保留最多 500 项的既有上限，排序、时区日期和删除状态语义保持不变。
4. 乐观增删改作用于统一任务源；当前可见任务由视图和清单即时派生，因此完成、删除、恢复或移动后会自然进入正确视图。
5. 智能视图与清单使用按钮切换，不再使用同路由 `<Link>`；地址栏通过 `window.history.pushState` 更新，`popstate` 恢复前进/后退状态。
6. 任务工作区、Quick Capture、详情 Inspector 和各滚动容器保持挂载；筛选只按视图 key 重建中央结果子树，`AnimatePresence initial={false}` 不为新筛选结果重演入场。
7. 同一视图内的真实新增、完成、删除和重排继续复用稳定的结果子树，因此保留任务行 Motion 反馈。
8. 本地筛选使用同步 `setState`，不使用 React Transition，不触发 AppShell 的页面级 `ViewTransition`。
9. Inspector 从统一任务源解析选择；所选任务暂时不属于新筛选时，右栏继续保持，列表仅取消可见选中态。
10. Next 16 的 React Compiler 在全项目启用，自动复用 props 未变化的稳定子树；它是状态边界修正后的补充，不替代正确的数据所有权。

## 预加载边界

- [COMPUTED] Tasks 的所有视图在首次进入时已经具备同一份规范化数据，因此后续筛选不需要网络预取。
- [COMPUTED] 科目目录/图谱/聚焦复用页面已经下发的章节与知识点，不再重复取数。
- [KNOWN] 全局 Sidebar 与 Planner Tasks/Calendar 仍使用 Next Link 预取和 `nav-switch`。
- [INFERRED] 不预先下载资料库所有文件夹内容：文件量和分页规模不受控，盲目全量预加载会增加首屏成本。该场景应按目标数据读取。

## 无障碍和状态连续性

- 当前工作区选项使用 `aria-current="page"`；内存筛选是同步操作，不伪造 `aria-busy` 或 loading 状态。
- 浏览器后退/前进恢复工作区筛选；直接打开带 query 的 URL 仍由服务端校验视图和清单。
- 减弱动效继续由全局 MotionProvider 与 View Transition 规则统一处理；本地切换不会额外触发页面级动画。
- 任务详情选择优先保留；如果所选任务不属于新视图，Inspector 仍显示该任务，不自动跳到新视图首项。

## 验收标准

- 点击 Tasks 的任意智能视图或清单，不产生新的 `/tasks?...` 文档/RSC 导航请求。
- `data-planner-workspace="tasks"` 节点在切换前后保持同一 DOM 身份，主容器不卸载。
- Quick Capture 输入和 Inspector 选择在筛选前后保持；只有中央结果子树按视图替换。
- 筛选期间没有页面 View Transition，也没有任务行批量退场/入场；同一视图内的增删改仍有局部反馈。
- 地址栏、前进和后退与当前筛选一致，直接打开深链接结果一致。
- 任务仓库查询与客户端派生对全部九个视图返回相同结果。
- Tasks/Calendar 仍统一使用 `nav-switch`；科目目录/图谱/聚焦不再触发同页服务端导航。
- 桌面、平板、移动端不出现横向溢出，键盘导航、详情 Drawer/Sheet 和 reduced-motion 无回归。
