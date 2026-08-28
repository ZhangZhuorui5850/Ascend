# UI 细节修复 + 账户快速切换 + 设置页分类重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-07-11-ui-polish-account-switch-settings-design.md` 落地：4 处 CSS 修复、默认昵称去 ZGCA、印章/图片双轨头像、多会话免密快速切换、右上角账户菜单、设置页三分类重构。

**Architecture:** 数据层加 0009_user_profile 迁移（users 表头像列）+ 新 repo/profile.ts；会话层在 auth.ts 加纯函数 mergeAccountTokens/listAccountSummaries（vitest 可测），cookie 编排留在 server actions；UI 层新增 UserAvatar/AccountMenu/AvatarEditor/AccountSection/AppearanceSection 组件，layout.tsx 读双 cookie 下发账户列表。

**Tech Stack:** Next 16.2.10 (App Router, Server Actions), better-sqlite3, vitest, 现有朱砂手帐 CSS 体系（globals.css 单文件）。

---

### Task 1: CSS 四处修复（纯样式，无迁移）

**Files:**
- Modify: `src/app/globals.css`（3884 dayStatusBar、2323 removeAttachment、2204 dropZone、2855 侧栏收起态）

- [x] **Step 1: dayStatusBar 内层格重置**——`.dayStatusBar > div`（globals.css:3884）加 `border: 0; border-right: 1px solid var(--line); border-radius: 0; background: transparent;` 消除与 `.dayStats > div` 叠加的双线。760px 断点网格分支保持 border-right/border-bottom 逻辑不变。
- [x] **Step 2: removeAttachment 居中**——`.removeAttachment`（globals.css:2323）加 `padding: 0; line-height: 0;`。
- [x] **Step 3: dropZone 撑满抽屉**——`.dropZone` 加 `flex: 1 1 auto; min-height: 200px; overflow: hidden;`；`.dropZoneInner` 加 `flex: 0 0 auto`；`.attachmentGrid` 加 `flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding-top: 2px;`（容纳 -7px 的 ✕ 角标）。
- [x] **Step 4: 侧栏收起态**——`.sidebar.isCollapsed { padding-inline: 10px; }`，`.sidebar.isCollapsed .brand { justify-content: center; padding-inline: 0; }`，`.sidebar.isCollapsed .sidebarFooter { padding-inline: 0; }`，`.sidebar.isCollapsed nav a` 已居中无需改。
- [x] **Step 5: 目检 + commit**——`npm run dev` 目检今日页/收纳抽屉/收起侧栏后 `git commit -m "fix(ui): day status bar seams, attachment close button, drop zone fill, collapsed sidebar spacing"`。

### Task 2: 迁移 0009_user_profile + 默认昵称去 ZGCA

**Files:**
- Modify: `src/lib/migrations.ts`（0008 之后追加）
- Modify: `src/lib/auth.ts:71,82,106`（ZGCA → 邮箱 local-part）
- Test: `src/lib/migrations.test.ts`、`src/lib/auth.test.ts`

- [x] **Step 1: 写失败测试**——migrations.test.ts 断言 `PRAGMA table_info(users)` 含 avatar_kind/avatar_char/avatar_color/avatar_image/avatar_mime；auth.test.ts 断言 `ensureBootstrapUsers` 创建的普通账号 displayName 为邮箱 @ 前段，且已有 display_name='ZGCA' 的行被迁移改名。
- [x] **Step 2: 实现迁移**：

```ts
{
  version: "0009_user_profile",
  run: (database) => {
    addColumnIfMissing(database, "users", "avatar_kind", "TEXT NOT NULL DEFAULT 'seal'");
    addColumnIfMissing(database, "users", "avatar_char", "TEXT NOT NULL DEFAULT ''");
    addColumnIfMissing(database, "users", "avatar_color", "TEXT NOT NULL DEFAULT 'cinnabar'");
    addColumnIfMissing(database, "users", "avatar_image", "BLOB");
    addColumnIfMissing(database, "users", "avatar_mime", "TEXT NOT NULL DEFAULT ''");
    // 历史引导账号的占位昵称改为邮箱 local-part（品牌已更名，ZGCA 不再作为默认昵称）
    database.exec(`
      UPDATE users SET display_name = substr(email, 1, instr(email, '@') - 1)
      WHERE display_name = 'ZGCA' AND instr(email, '@') > 1
    `);
  },
},
```

- [x] **Step 3: auth.ts 默认昵称**——`emailLocalPart(email)` helper；ensureBootstrapUsers 里 `displayName: emailLocalPart(email) || "学习空间"` 替换 "ZGCA" 两处。
- [x] **Step 4: 跑测试通过后 commit**。

### Task 3: repo/profile.ts（昵称 + 头像读写校验）

**Files:**
- Create: `src/lib/repo/profile.ts`
- Test: `src/lib/repo/profile.test.ts`

- [x] **Step 1: 失败测试**——updateDisplayName 长度 1~30 校验；setSealAvatar 颜色枚举校验、char 取首个字符；setImageAvatar mime 白名单（jpeg/png/webp）+ >2MB 拒绝；getAvatarImage 回图；setSealAvatar 清空图片。
- [x] **Step 2: 实现**——`SEAL_COLORS = ["cinnabar","ink","indigo","bamboo","rattan"] as const`；`AVATAR_IMAGE_MAX_BYTES = 2*1024*1024`；`getUserProfile/updateDisplayName/setSealAvatar/setImageAvatar/getAvatarImage`，全部 `UPDATE users ... , updated_at = CURRENT_TIMESTAMP`。
- [x] **Step 3: 测试通过 + commit**。

### Task 4: 多会话纯函数（auth.ts）

**Files:**
- Modify: `src/lib/auth-constants.ts`（加 `SESSIONS_COOKIE = "zgca_sessions"`、`MAX_DEVICE_ACCOUNTS = 5`）
- Modify: `src/lib/auth.ts`
- Test: `src/lib/auth.test.ts`

- [x] **Step 1: 失败测试**——mergeAccountTokens：新 token 置顶、同 userId 去重保新、过期/无效丢弃、截断 5 个；listAccountSummaries 返回 {userId,email,displayName,role,avatar…} 顺序与 token 列表一致；findTokenForUser 命中/未命中。
- [x] **Step 2: 实现**：

```ts
export function mergeAccountTokens(activeToken: string | undefined, listed: string[], db = getDbHandle()): string[] {
  const merged: string[] = [];
  const seenUsers = new Set<string>();
  for (const token of [activeToken, ...listed]) {
    if (!token) continue;
    const context = getSessionContext(token, db);
    if (!context || seenUsers.has(context.userId)) continue;
    seenUsers.add(context.userId);
    merged.push(token);
    if (merged.length >= MAX_DEVICE_ACCOUNTS) break;
  }
  return merged;
}

export type DeviceAccount = {
  userId: string; email: string; displayName: string; role: UserRole;
  avatarKind: "seal" | "image"; avatarChar: string; avatarColor: string; avatarVersion: string;
};
export function listAccountSummaries(tokens: string[], db = getDbHandle()): DeviceAccount[] { /* 按 token 顺序取 profile */ }
export function findTokenForUser(tokens: string[], userId: string, db = getDbHandle()): string | null { /* … */ }
```

- [x] **Step 3: 测试通过 + commit**。

### Task 5: 头像接口 GET /api/avatar/[userId]

**Files:**
- Create: `src/app/api/avatar/[userId]/route.ts`

- [x] **Step 1: 实现**——`requireAccessContext(request)` 鉴权（任意已登录用户可取，用于账户菜单互显）；无图 404；`etag: "<updated_at hash>"`＋`cache-control: private, max-age=0, must-revalidate`＋If-None-Match 304；参照 assets file route 的 etagMatches。
- [x] **Step 2: build 通过 + commit**（route 无独立 vitest，鉴权逻辑复用已测的 requireAccessContext）。

### Task 6: server actions——登录合并、切换、退出、资料/头像/改密

**Files:**
- Modify: `src/app/actions/auth.ts`
- Create: `src/app/actions/profile.ts`

- [x] **Step 1: auth.ts**——`setSessionCookies(cookieStore, activeToken, tokens, expiresAt)` helper；login 合并列表；`switchAccountAction(userId)`（findTokenForUser → 换 active cookie → redirect 按角色）；logout 弹出下一个有效会话或清空回 /login；`logoutAllAction`（删全部 session 行 + 清 cookie）。sessions cookie 值为 `JSON.stringify(tokens)`，httpOnly/lax/secure 同 active cookie。
- [x] **Step 2: profile.ts actions**——updateProfileAction / saveSealAvatarAction / uploadAvatarImageAction(FormData) / revertSealAvatarAction / changeAccountPasswordAction（changePassword → createSession → setSessionCookies 重建，revalidatePath("/settings")），全部 ActionResult 模式 + requireAccessContext（admin 也能用账户设置的 action，但页面仍限普通用户）。
- [x] **Step 3: commit**。

### Task 7: UserAvatar + AccountMenu + 壳层接线

**Files:**
- Create: `src/components/UserAvatar.tsx`（印章 div / img 双轨，size prop）
- Create: `src/components/AccountMenu.tsx`（头像按钮+下拉：当前账户、其他账户点击切换、添加账号→/login、设置、退出当前、退出全部）
- Modify: `src/components/TopBar.tsx`（topbarAvatar span → AccountMenu）
- Modify: `src/components/Sidebar.tsx`（footer 加 UserAvatar）
- Modify: `src/components/AppShell.tsx`、`src/app/layout.tsx`（读 SESSIONS_COOKIE → mergeAccountTokens → listAccountSummaries，下发 currentUser profile + accounts）
- Modify: `src/app/globals.css`（.userAvatar、.seal-* 五色 token、.accountMenu 下拉、亮暗双主题）

- [x] **Step 1: UserAvatar**——`{kind==='image' ? <img src={`/api/avatar/${userId}?v=${avatarVersion}`}/> : <span className={`userAvatar seal-${color}`}>{char || displayName[0]}</span>}`。
- [x] **Step 2: AccountMenu**（client）——useState 开合 + 点击外部关闭 + Escape；切换用 useTransition 调 switchAccountAction；退出/退出全部沿用 form action。
- [x] **Step 3: layout.tsx**——login 页外壳不变；`const tokens = mergeAccountTokens(active, parseSessionsCookie(...)); const accounts = listAccountSummaries(tokens);`（只读不写 cookie，RSC 里不能写）。
- [x] **Step 4: CSS**——五色印章 token（朱砂 #b13a20 系已有 --accent；墨黑/黛蓝/竹青/藤黄新增变量，dark 主题各给一版）；accountMenu 绝对定位下拉卡片。
- [x] **Step 5: 目检 + commit**。

### Task 8: 设置页三分类重构

**Files:**
- Create: `src/components/AvatarEditor.tsx`（印章色板 + 印章字输入 + 上传图片 ≤2MB + 恢复印章）
- Create: `src/components/AccountSection.tsx`（头像编辑、昵称、邮箱只读、修改密码卡、DeviceSessions 移入）
- Create: `src/components/AppearanceSection.tsx`（主题三选，与 ThemeSwitcher 共用 zgca-theme + data-theme 逻辑）
- Modify: `src/app/settings/page.tsx`（锚点 tab：#account/#study/#appearance，三段分区）
- Modify: `src/app/globals.css`（settingsTabs、sealPalette、avatarEditor 样式）

- [x] **Step 1: 组件实现**（页面仍 requirePageWorkspace 限普通用户）。
- [x] **Step 2: page.tsx 重组**——顶部 `<nav className="settingsTabs">` 锚点；账户段传 profile；学习段复用 SettingsForm；外观段 AppearanceSection。
- [x] **Step 3: 目检三段 + 改密流程 + commit**。

### Task 9: 全量验证

- [x] **Step 1:** `npm run test`（vitest 全绿）。
- [x] **Step 2:** `npm run lint && npm run build`。
- [x] **Step 3:** Playwright 截图目检：今日页统计条、收纳抽屉（队列有文件时 ✕ 居中、dropZone 撑满）、收起侧栏、账户菜单开合、设置页三段，亮/暗 + 390px。
- [x] **Step 4:** 修复发现的问题后 commit。

### Task 10: 推送合并

- [x] **Step 1:** `git push origin main`（工作在 main 上直接推；用户明确要求合并到 main）。

## Self-Review

- Spec A→Task 1，B→Task 2，C→Task 2/3/5/7/8，D→Task 4/6，E→Task 7，F→Task 8，测试→各 task + Task 9。无缺口。
- 类型一致性：DeviceAccount 在 Task 4 定义、Task 6/7 消费；SEAL_COLORS 在 Task 3 定义、Task 7/8 消费。
- 边界确认：RSC（layout）只读 cookie 不写；cookie 清理只发生在 login/switch/logout action 里。
