# UI 细节修复 + 账户快速切换 + 设置页分类重构（设计）

日期：2026-07-11 · 来源：用户对线上部署的第一轮体验反馈

## 背景与问题

1. **今日页统计条割裂**：`.dayStats > div` 给每格独立边框/圆角/底色，同一元素又叠加 `.dayStatusBar`（外框 + 竖分隔线），两套线错位。
2. **上传卡片 ✕ 不居中**：`.removeAttachment` 未清除浏览器默认按钮内边距。
3. **收纳抽屉拖放区过小**：抽屉整列高度未被 `.dropZone` 利用。
4. **左下角 "ZGCA"**：引导建号硬编码的默认昵称（`ensureBootstrapUsers`），非品牌文案。
5. **侧栏收起态间距欠打磨**。
6. **右上角头像无交互**：需要账户菜单 + 免密快速切换。
7. **设置页单薄**：只有考试倒计时 + 复习上限；缺账户类设置（昵称/头像/改密码），未分类。

## 方案

### A. CSS 修复（纯样式）
- `.dayStatusBar > div` 重置内层边框/圆角/底色，只保留右侧 1px 分隔线；容器保留外框。
- `.removeAttachment` 加 `padding: 0`。
- `.dropZone` 在收纳抽屉里 `flex: 1` 撑满剩余高度（`min-height` 兜底），队列多时区域内滚动。
- 侧栏收起态：brand/底栏水平居中、去水平内边距。

### B. 默认昵称
- 引导普通账号 displayName 从 "ZGCA" 改为邮箱 local-part（`@` 前段）；可在设置里改。

### C. 头像（用户选定：印章式 + 图片上传双轨）
- 迁移 `0009_user_profile`：users 表加 `avatar_kind`（seal|image）、`avatar_char`（默认空=取昵称首字）、`avatar_color`（枚举 token）、`avatar_image BLOB`、`avatar_mime`。
- 印章底色枚举：朱砂/墨黑/黛蓝/竹青/藤黄（CSS token 映射）。
- 图片：≤2MB，jpeg/png/webp，原样存 BLOB；`GET /api/avatar/[userId]` 鉴权后回图，`updated_at` 做 ETag。
- TopBar / 侧栏底部 / 账户菜单统一经 `<UserAvatar>` 组件渲染。

### D. 账户快速切换（多会话并存）
- 新增 httpOnly cookie `zgca_sessions`：本设备已登录会话 token 的 JSON 数组（≤5 个）。
- 活跃会话仍是 `zgca_session`，`requireAccessContext` 等鉴权路径**零改动**。
- 登录成功：旧活跃 token 与列表合并（按 userId 去重、丢弃过期），新 token 设为活跃。
- 切换：server action 校验目标 token 在列表内且有效 → 换 `zgca_session`。
- 退出当前：删当前会话行，从列表弹出下一个有效会话顶上；没有则清两个 cookie 回 /login。
- 另设「退出全部账号」。
- 安全边界：能打开此设备浏览器的人即可切换（用户明确要求免密切换，私人设备场景）。

### E. 右上角账户菜单
- 头像按钮 → 下拉：当前账户（头像/昵称/邮箱）、其他已登录账户（点击切换）、添加账号（→ /login，不清列表）、设置、退出当前 / 退出全部。

### F. 设置页分类重构（保持单页、分类分区 + 顶部锚点 tab）
- **账户**：头像编辑（印章色板 + 印章字 + 上传图片 + 恢复印章）、昵称、邮箱（只读）、修改密码（当前密码 + 新密码，沿用 `changePassword`，改完全端下线并重建当前会话）、设备会话（现有 DeviceSessions）。
- **学习**：考试倒计时编辑器、每日复习上限（现有 SettingsForm 拆入）。
- **外观**：主题 跟随系统/浅色/深色（与顶栏 ThemeSwitcher 共用 `zgca-theme` localStorage）。
- /settings 仍限普通用户（admin 由 `requirePageWorkspace` 重定向，维持现状）。

## 测试
- vitest：多会话合并/切换/退出边界、profile 更新与校验、默认昵称、头像 mime/大小校验。
- build + 全量测试 + Playwright 截图（亮/暗/移动端）目检修复项。

## 不做（本轮）
- Admin 的设置页；头像裁剪 UI（原图直存，前端 object-fit 裁显示）；主题跟随存服务端。
