# CSS 架构与变更规则

更新日期：2026-07-25

## 当前层次与导入顺序

根布局按以下顺序导入，顺序本身是级联契约：

1. `src/app/globals.css`：tokens 之外的共享原语、应用壳与尚未迁出的历史页面规则；
2. `src/styles/domains/*.css`：边界明确、由单一产品域拥有的样式；
3. `src/styles/summit.css`：视觉皮肤和允许覆盖前两层的呈现规则。

不得通过调整这三层顺序修复单个页面。先确认选择器所有权，再在所属层修改。

## 新增与拆分规则

- 新页面域优先写入命名明确的 `src/styles/domains/<domain>.css`，不要继续扩大 `globals.css`；
- tokens、按钮、表单、card、shell 等跨域原语仍由共享层拥有；
- 域文件只能引用共享 token，不得重新定义 `--motion-*` 等全局契约；
- 有 animation/transition 的域必须提供 `prefers-reduced-motion` 降级；
- 拆分必须保持原始级联顺序，先选择文件尾部连续且无跨域覆盖的规则做等价迁移；
- 删除选择器前，用 `rg` 检查 TSX、脚本和测试中的动态 class，并跑响应式审计。

首个试点是 `assets-mobile.css`：它原本位于 `globals.css` 文件末尾，迁到 globals 之后、summit 之前，级联位置不变。

## 自动审计

`npm run css:audit` 检查：

- 每个已登记 CSS 文件的大括号配对；
- 含 animation 的文件是否存在 reduced-motion 守卫；
- 文件行数、字节数、唯一选择器和跨文件重复选择器基线。

重复选择器当前只报告不阻断，因为 summit 允许有意覆盖共享层。新增重复应在评审中说明所有权，而不是盲目去重。
