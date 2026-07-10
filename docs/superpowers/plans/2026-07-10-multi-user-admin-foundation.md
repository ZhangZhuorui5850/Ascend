# Multi-User and Admin Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing single-user ZGCA application into an invite-only multi-user system with isolated workspaces, a separate Admin role, legacy-data preservation, and end-to-end isolation tests.

**Architecture:** Keep one SQLite database and add an explicit `workspace_id` boundary to every business entity. Authentication resolves a server-owned `AccessContext`; repositories require a workspace scope, while Admin-only services may select a target workspace after `requireAdmin` succeeds. Existing data is assigned to the current ordinary user through a legacy workspace before new invitations are enabled.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript 5, better-sqlite3 12, Vitest 4, Playwright 1.61, Node.js 22.

## Global Constraints

- Keep SQLite as the primary database and preserve all existing records and uploaded files.
- Public registration remains disabled; Admin creates a 24-hour, single-use invitation link.
- Roles are exactly `admin` and `user`; statuses are exactly `invited`, `active`, and `suspended`.
- Each ordinary user owns exactly one workspace; Admin does not use a learning workspace for daily work.
- Ordinary users must never select their workspace from client input; it comes from the authenticated server Session.
- Admin cross-workspace mutations must write an audit log without passwords, cookies, or Session tokens.
- Default storage quota is 2GB per workspace and default single-file limit is 20MB.
- Preserve the user's existing uncommitted `docker-compose.yml` change and never stage it in these tasks.
- Use TDD for every behavior change and make one focused commit per task.

---

## Planned File Structure

New focused modules:

- `src/lib/access-context.ts`: role/status/scope types and authorization helpers shared by pages, Actions, and APIs.
- `src/lib/repo/workspaces.ts`: workspace provisioning, legacy ownership, quota usage, and seed cloning.
- `src/lib/repo/admin.ts`: invitations, user lifecycle, Admin summaries, Session revocation, and audit writes.
- `src/app/admin/layout.tsx`: Admin gate and Admin-specific navigation shell.
- `src/app/admin/page.tsx`: system overview.
- `src/app/admin/users/page.tsx`: user list and invitation form.
- `src/app/admin/users/[id]/page.tsx`: user status, sessions, quota, and workspace link.
- `src/app/admin/audit/page.tsx`: audit-log list.
- `src/app/actions/admin.ts`: Admin-only Server Actions.
- `src/app/invite/[token]/page.tsx`: invitation password setup page.
- `src/app/actions/invite.ts`: invitation activation Action.
- `src/components/admin/InviteUserForm.tsx`: invitation form and copy-link result.
- `src/components/admin/UserStatusActions.tsx`: suspend/activate/session reset controls.

Existing modules retain their domain responsibility but receive an explicit `WorkspaceScope` parameter.

---

### Task 1: Identity and Workspace Schema

**Files:**
- Create: `src/lib/access-context.ts`
- Modify: `src/lib/migrations.ts`
- Modify: `src/lib/migrations.test.ts`

**Interfaces:**
- Produces: `UserRole`, `UserStatus`, `WorkspaceScope`, `AccessContext`.
- Produces database tables: `workspaces`, `invitations`, `audit_logs`, `login_attempts`.
- Produces user columns: `role`, `status`, `must_change_password`, `last_login_at`, `password_changed_at`.

- [ ] **Step 1: Write failing migration tests**

Add tests that inspect `PRAGMA table_info(users)` and `sqlite_master` after `runMigrations(db)`:

```ts
it("adds identity and workspace schema", () => {
  const db = createTestDb();
  const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  expect(userColumns.map((column) => column.name)).toEqual(
    expect.arrayContaining(["role", "status", "must_change_password", "last_login_at", "password_changed_at"]),
  );
  for (const table of ["workspaces", "invitations", "audit_logs", "login_attempts"]) {
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)).toBeTruthy();
  }
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/lib/migrations.test.ts`

Expected: FAIL because the new user columns and tables do not exist.

- [ ] **Step 3: Define access types**

Create `src/lib/access-context.ts`:

```ts
export type UserRole = "admin" | "user";
export type UserStatus = "invited" | "active" | "suspended";

export type WorkspaceScope = { workspaceId: string };

export type AccessContext = {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  workspaceId: string | null;
};
```

- [ ] **Step 4: Add migration `0006_identity_workspaces`**

Use `addColumnIfMissing` for the five user columns and create:

```sql
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  storage_quota_bytes INTEGER NOT NULL DEFAULT 2147483648,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT NOT NULL,
  target_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hint TEXT NOT NULL,
  ip_hint TEXT NOT NULL,
  succeeded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Set defaults for existing users to `role='user'`, `status='active'`, and `must_change_password=0`.

- [ ] **Step 5: Run migration tests**

Run: `npm test -- src/lib/migrations.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/access-context.ts src/lib/migrations.ts src/lib/migrations.test.ts
git commit -m "feat: add identity and workspace schema"
```

---

### Task 2: Workspace-Scoped Domain Migration and Legacy Ownership

**Files:**
- Create: `src/lib/repo/workspaces.ts`
- Create: `src/lib/repo/workspaces.test.ts`
- Modify: `src/lib/migrations.ts`
- Modify: `src/lib/migrations.test.ts`
- Modify: `src/lib/repo/testing.ts`
- Modify: `src/lib/db.ts`

**Interfaces:**
- Produces: `LEGACY_WORKSPACE_ID = "workspace:legacy"`.
- Produces: `ensureWorkspaceForUser(db, user): { workspaceId: string }`.
- Produces: `cloneKnowledgeSeedForWorkspace(db, workspaceId)`.
- Produces: `createTestWorkspace(db, overrides?)` for repository tests.

- [ ] **Step 1: Add failing workspace-isolation schema tests**

Test that two workspaces can contain the same date, subject code, folder path, and setting key:

```ts
it("allows formerly global keys in different workspaces", () => {
  const db = createTestDb();
  seedWorkspace(db, "w1", "u1");
  seedWorkspace(db, "w2", "u2");
  db.prepare("INSERT INTO subjects (workspace_id, code, name, description) VALUES (?, 'M1', 'A', '')").run("w1");
  db.prepare("INSERT INTO subjects (workspace_id, code, name, description) VALUES (?, 'M1', 'B', '')").run("w2");
  db.prepare("INSERT INTO daily_entries (workspace_id, date) VALUES (?, '2026-07-10')").run("w1");
  db.prepare("INSERT INTO daily_entries (workspace_id, date) VALUES (?, '2026-07-10')").run("w2");
  expect(db.prepare("SELECT COUNT(*) AS count FROM subjects WHERE code='M1'").get()).toEqual({ count: 2 });
});
```

- [ ] **Step 2: Verify the focused test fails**

Run: `npm test -- src/lib/migrations.test.ts src/lib/repo/workspaces.test.ts`

Expected: FAIL because domain tables do not have workspace keys and global primary keys collide.

- [ ] **Step 3: Implement migration `0007_workspace_scope`**

Within a transaction:

1. Insert `workspace:legacy` with a null owner.
2. Rebuild `subjects`, `daily_entries`, `folders`, `app_settings`, `drafts`, and `tags` so their former global keys are unique with `workspace_id`.
3. Add a non-null `workspace_id` defaulting to `workspace:legacy` to all other business and relationship tables.
4. Recreate indexes with `workspace_id` as the leading key.
5. Keep identity tables (`users`, `sessions`, `invitations`, `audit_logs`, `login_attempts`, `schema_migrations`) global.

Use exact composite keys:

```sql
PRIMARY KEY (workspace_id, code)                -- subjects
PRIMARY KEY (workspace_id, date)                -- daily_entries
PRIMARY KEY (workspace_id, path)                -- folders
PRIMARY KEY (workspace_id, key)                 -- app_settings
UNIQUE (workspace_id, scope_type, scope_id, field) -- drafts
UNIQUE (workspace_id, name)                     -- tags
```

- [ ] **Step 4: Implement workspace provisioning**

`ensureWorkspaceForUser` must claim `workspace:legacy` for the first active ordinary user when it has no owner; later users receive `workspace:<uuid>` and a cloned default knowledge map whose IDs are prefixed by the workspace ID.

```ts
export function ensureWorkspaceForUser(
  db: Database.Database,
  user: { id: string; displayName: string },
): { workspaceId: string };
```

- [ ] **Step 5: Update database initialization order**

`getDb()` must run structural migrations before legacy seed backfill. The fallback knowledge seed is inserted into `workspace:legacy`. Workspace provisioning clones the seed for newly activated users instead of using global rows.

- [ ] **Step 6: Add test helpers**

```ts
export function createTestWorkspace(
  db: Database.Database,
  input: { userId?: string; email?: string; displayName?: string } = {},
): { userId: string; workspaceId: string };
```

The helper inserts an active ordinary user, provisions its workspace, and returns both IDs.

- [ ] **Step 7: Run migration and workspace tests**

Run: `npm test -- src/lib/migrations.test.ts src/lib/repo/workspaces.test.ts`

Expected: PASS, including duplicate legacy keys across workspaces and legacy-row ownership.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db.ts src/lib/migrations.ts src/lib/migrations.test.ts src/lib/repo/testing.ts src/lib/repo/workspaces.ts src/lib/repo/workspaces.test.ts
git commit -m "feat: scope domain schema by workspace"
```

---

### Task 3: Authentication Context, Roles, Status, and Bootstrap Admin

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/auth.test.ts`
- Modify: `src/lib/request-auth.ts`
- Modify: `src/lib/page-auth.ts`
- Modify: `src/app/actions/auth.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `getSessionContext(token): AccessContext | null`.
- Produces: `requireAccessContext(request?): Promise<AccessContext>`.
- Produces: `requireWorkspace(request?): Promise<AccessContext & { workspaceId: string }>`.
- Produces: `requireAdmin(request?): Promise<AccessContext & { role: "admin" }>`.

- [ ] **Step 1: Write failing authorization tests**

Cover active user success, invited/suspended rejection, Admin without workspace, ordinary user with workspace, bootstrap Admin creation, and Session revocation after suspension.

```ts
expect(getSessionContext(activeUserToken)).toMatchObject({ role: "user", workspaceId });
expect(getSessionContext(suspendedUserToken)).toBeNull();
expect(() => assertAdmin(userContext)).toThrow("Administrator access required");
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- src/lib/auth.test.ts`

Expected: FAIL because role/status/workspace are not returned or enforced.

- [ ] **Step 3: Replace default-user bootstrap**

- Existing `APP_LOGIN_EMAIL` user remains `role='user'` and claims legacy workspace.
- `APP_ADMIN_EMAIL` and `APP_ADMIN_PASSWORD` create one separate Admin with `must_change_password=1`.
- Throw a startup error if Admin and ordinary-user emails are equal.
- Never update an existing password from environment variables after creation.

- [ ] **Step 4: Return and require AccessContext**

Join `sessions`, `users`, and `workspaces` in `getSessionContext`. `requireWorkspace` rejects Admin without a selected target. `requireAdmin` rejects non-admin users with status 403.

- [ ] **Step 5: Add persistent login throttling**

Reject login for 15 minutes when the same normalized email and IP has five failed attempts in the prior 15 minutes. A successful login records success and permits the request. Return a generic credential error to avoid account enumeration.

- [ ] **Step 6: Update environment example**

Add:

```dotenv
APP_ADMIN_EMAIL=admin@example.com
APP_ADMIN_PASSWORD=replace-with-a-strong-bootstrap-password
```

- [ ] **Step 7: Run auth tests**

Run: `npm test -- src/lib/auth.test.ts src/proxy.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add .env.example src/lib/auth.ts src/lib/auth.test.ts src/lib/request-auth.ts src/lib/page-auth.ts src/app/actions/auth.ts
git commit -m "feat: enforce roles and workspace sessions"
```

---

### Task 4: Scope Planner, Daily Entries, Settings, and Statistics

**Files:**
- Modify: `src/lib/repo/planner.ts`
- Modify: `src/lib/repo/planner.test.ts`
- Modify: `src/lib/repo/days.ts`
- Modify: `src/lib/repo/settings.ts`
- Modify: `src/lib/repo/stats.ts`
- Modify: `src/lib/repo/stats.test.ts`
- Modify: `src/lib/calendar-summary.ts`
- Modify: `src/lib/calendar-summary.test.ts`
- Modify: `src/app/actions/planner.ts`
- Modify: `src/app/actions/day.ts`
- Modify: `src/app/actions/settings.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/day/[date]/page.tsx`
- Modify: `src/app/calendar/page.tsx`
- Modify: `src/app/analytics/page.tsx`
- Modify: `src/app/settings/page.tsx`

**Interfaces:**
- Every repository function receives `scope: WorkspaceScope` immediately after `db`.
- Actions call `const access = await requireWorkspace()` and pass `{ workspaceId: access.workspaceId }`.

- [ ] **Step 1: Add two-workspace failing tests**

For each domain, create identical dates/titles in two workspaces and assert list/update/delete only affects the requested scope.

```ts
const a = createTestWorkspace(db);
const b = createTestWorkspace(db);
addTask(db, a, { day: "2026-07-10", title: "A" });
addTask(db, b, { day: "2026-07-10", title: "B" });
expect(listTasks(db, a, "2026-07-10").map((task) => task.title)).toEqual(["A"]);
```

- [ ] **Step 2: Verify focused tests fail**

Run: `npm test -- src/lib/repo/planner.test.ts src/lib/repo/stats.test.ts src/lib/calendar-summary.test.ts`

Expected: FAIL because repositories do not accept or apply workspace scope.

- [ ] **Step 3: Scope all SQL**

Add `workspace_id = @workspaceId` to reads, writes, updates, deletes, aggregates, joins, subqueries, carry-over logic, streak calculations, settings keys, and calendar summaries. Insert statements always write the scope workspace ID.

- [ ] **Step 4: Thread scope through pages and Actions**

Replace `await requireSession()` with `const access = await requireWorkspace()` and pass the scope into every repository call. Page loads do the same before accessing data.

- [ ] **Step 5: Run focused tests and build**

Run: `npm test -- src/lib/repo/planner.test.ts src/lib/repo/stats.test.ts src/lib/calendar-summary.test.ts`

Run: `npm run build`

Expected: all focused tests PASS and production build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/repo/planner.ts src/lib/repo/planner.test.ts src/lib/repo/days.ts src/lib/repo/settings.ts src/lib/repo/stats.ts src/lib/repo/stats.test.ts src/lib/calendar-summary.ts src/lib/calendar-summary.test.ts src/app/actions/planner.ts src/app/actions/day.ts src/app/actions/settings.ts src/app/page.tsx src/app/day src/app/calendar src/app/analytics src/app/settings
git commit -m "feat: isolate planning and statistics by workspace"
```

---

### Task 5: Scope Knowledge, Reviews, and Capture Hierarchy

**Files:**
- Modify: `src/lib/repo/knowledge.ts`
- Modify: `src/lib/repo/knowledge.test.ts`
- Modify: `src/lib/repo/reviews.ts`
- Modify: `src/lib/repo/reviews.test.ts`
- Modify: `src/lib/review-schedule.ts`
- Modify: `src/lib/knowledge-map.ts`
- Modify: `src/app/actions/knowledge.ts`
- Modify: `src/app/subjects/page.tsx`
- Modify: `src/app/subjects/[code]/page.tsx`
- Modify: `src/app/mistakes/page.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Knowledge and review repository functions receive `WorkspaceScope` after `db`.
- `getCaptureHierarchy(db, scope)` returns only target-workspace subjects.

- [ ] **Step 1: Add failing isolation tests**

Create the same subject code and semantically identical point titles in two workspaces. Verify subject lists, detail fetches, review scoring, mistake reattempts, deletion, and capture hierarchy cannot cross scope.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/lib/repo/knowledge.test.ts src/lib/repo/reviews.test.ts`

Expected: FAIL until scope is part of repository signatures and SQL.

- [ ] **Step 3: Scope knowledge and review SQL**

Every join between subjects, chapters, points, mistakes, reviews, assets, and sessions must match both entity keys and `workspace_id`. New generated IDs include a workspace-safe UUID or prefix so global ID columns do not collide.

- [ ] **Step 4: Thread scope through pages, Actions, and root layout**

The root layout resolves a workspace only for an active ordinary user. Admin pages do not receive the ordinary capture panel unless explicitly viewing a target workspace.

- [ ] **Step 5: Run focused tests and build**

Run: `npm test -- src/lib/repo/knowledge.test.ts src/lib/repo/reviews.test.ts src/lib/review-schedule.test.ts`

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/repo/knowledge.ts src/lib/repo/knowledge.test.ts src/lib/repo/reviews.ts src/lib/repo/reviews.test.ts src/lib/review-schedule.ts src/lib/knowledge-map.ts src/app/actions/knowledge.ts src/app/subjects src/app/mistakes src/app/layout.tsx
git commit -m "feat: isolate knowledge and reviews by workspace"
```

---

### Task 6: Scope Files, Folders, Uploads, and Downloads

**Files:**
- Modify: `src/lib/repo/library.ts`
- Modify: `src/lib/repo/library.test.ts`
- Modify: `src/lib/assets.ts`
- Modify: `src/lib/assets.test.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/lib/storage.test.ts`
- Modify: `src/app/actions/library.ts`
- Modify: `src/app/api/assets/route.ts`
- Modify: `src/app/api/assets/[id]/file/route.ts`
- Modify: `src/app/assets/page.tsx`
- Modify: `src/components/CapturePanel.tsx`

**Interfaces:**
- `createAssetFromUpload(db, scope, input)` enforces quota and 20MB file limit.
- `resolveWorkspaceAssetPath(workspaceId, relativePath)` never resolves outside `uploads/<workspaceId>`.

- [ ] **Step 1: Add failing security tests**

Cover:

- listing and searching only the current workspace;
- folder rename/move/delete isolation;
- asset move/rename/delete isolation;
- a user receiving 404 for another workspace's asset ID;
- path traversal rejection;
- 20MB upload rejection;
- quota-exceeded rejection.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/lib/repo/library.test.ts src/lib/assets.test.ts src/lib/storage.test.ts`

Expected: FAIL before workspace and quota enforcement.

- [ ] **Step 3: Scope metadata and physical paths**

Use physical paths under `uploads/<workspaceId>/`. All metadata SQL includes workspace scope. Keep content disposition and MIME hardening in the download response.

- [ ] **Step 4: Enforce upload limits before writing**

Reject `file.size > 20 * 1024 * 1024`. Compute used bytes from active assets in the workspace and reject when `used + file.size > storage_quota_bytes`.

- [ ] **Step 5: Protect API routes**

Both upload and download routes call `requireWorkspace(request)`. The file query uses `WHERE id = ? AND workspace_id = ?`; a cross-workspace asset returns 404 rather than 403 to avoid revealing existence.

- [ ] **Step 6: Run focused tests and build**

Run: `npm test -- src/lib/repo/library.test.ts src/lib/assets.test.ts src/lib/storage.test.ts`

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/repo/library.ts src/lib/repo/library.test.ts src/lib/assets.ts src/lib/assets.test.ts src/lib/storage.ts src/lib/storage.test.ts src/app/actions/library.ts src/app/api/assets src/app/assets src/components/CapturePanel.tsx
git commit -m "feat: isolate workspace files and enforce quotas"
```

---

### Task 7: Invitations, User Lifecycle, Audit, and Admin Services

**Files:**
- Create: `src/lib/repo/admin.ts`
- Create: `src/lib/repo/admin.test.ts`
- Create: `src/app/actions/admin.ts`
- Create: `src/app/actions/invite.ts`
- Modify: `src/lib/auth.ts`

**Interfaces:**
- `createInvitation(db, admin, input): { invitationUrlToken: string; userId: string; expiresAt: string }`.
- `activateInvitation(db, token, password): { userId: string; workspaceId: string }`.
- `setUserStatus(db, admin, targetUserId, status)`.
- `revokeUserSessions(db, admin, targetUserId)`.
- `writeAuditLog(db, entry)`.

- [ ] **Step 1: Add failing service tests**

Cover token hashing, 24-hour expiry, one-time use, duplicate email rejection, workspace creation on activation, suspend/reactivate, Session revocation, Admin-only enforcement, and audit summaries without secrets.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/lib/repo/admin.test.ts`

Expected: FAIL because Admin services do not exist.

- [ ] **Step 3: Implement invitation lifecycle**

Generate 32 random bytes as base64url, store SHA-256 only, and return the raw token once. Password activation uses existing scrypt hashing and a minimum of 12 characters.

- [ ] **Step 4: Implement user status and Session operations**

Suspension and password reset delete all target-user Sessions in the same transaction. Reactivation does not restore old Sessions.

- [ ] **Step 5: Implement audit writes**

Use allowlisted summary objects such as `{ fromStatus, toStatus }`, `{ quotaBytes }`, or `{ revokedSessions }`. Never serialize raw form data.

- [ ] **Step 6: Expose guarded Server Actions**

Every Admin Action begins with `const admin = await requireAdmin()` and returns a serializable `ActionResult`. Invitation activation is public only to a valid token route and does not create a Session until password setup succeeds.

- [ ] **Step 7: Run focused tests**

Run: `npm test -- src/lib/repo/admin.test.ts src/lib/auth.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/repo/admin.ts src/lib/repo/admin.test.ts src/lib/auth.ts src/app/actions/admin.ts src/app/actions/invite.ts
git commit -m "feat: add invite-only user administration"
```

---

### Task 8: Functional Admin and Invitation UI

**Files:**
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/users/page.tsx`
- Create: `src/app/admin/users/[id]/page.tsx`
- Create: `src/app/admin/audit/page.tsx`
- Create: `src/app/invite/[token]/page.tsx`
- Create: `src/components/admin/InviteUserForm.tsx`
- Create: `src/components/admin/UserStatusActions.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `proxy.ts`
- Modify: `src/proxy.test.ts`

**Interfaces:**
- Admin pages use `requireAdmin()` at the layout boundary.
- Invite page validates token state server-side and submits only token plus new password.

- [ ] **Step 1: Write a failing public-route test**

Extend `src/proxy.test.ts` to prove `/invite/<token>` remains reachable without a Session while `/admin` still requires a Session cookie. Admin-versus-user enforcement remains covered by `requireAdmin` tests from Task 3; rendered Admin and invitation flows are covered by the Playwright audit in Task 9.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- src/proxy.test.ts src/lib/repo/admin.test.ts`

Expected: FAIL because `/invite/<token>` is not in the proxy public-path allowlist.

- [ ] **Step 3: Implement the functional UI**

Build accessible forms and tables using existing styles only. Do not perform the full visual redesign in this task; the modern UI plan will replace styling after functionality is verified.

- [ ] **Step 4: Add Admin navigation conditionally**

Pass `role` into `AppShell` and `Sidebar`. Only Admin sees the Admin link. Ordinary navigation continues to use the user's own workspace.

- [ ] **Step 5: Run tests and build**

Run: `npm test`

Run: `npm run build`

Expected: all tests PASS and Admin routes appear in the build route table.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin src/app/invite src/components/admin src/components/Sidebar.tsx proxy.ts src/proxy.test.ts
git commit -m "feat: add admin and invitation interfaces"
```

---

### Task 9: Multi-User End-to-End and Migration Verification

**Files:**
- Create: `scripts/multi-user-audit.mjs`
- Create: `scripts/verify-workspace-migration.mjs`
- Modify: `scripts/smoke.mjs`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- `npm run audit:multi-user` runs the two-user/Admin Playwright audit against `MULTI_USER_AUDIT_URL`.
- `npm run verify:migration` prints JSON counts and exits non-zero on unowned or cross-workspace rows.

- [ ] **Step 1: Add a failing migration verifier**

The script checks every scoped table for null/unknown workspace IDs, verifies one workspace per ordinary user, verifies Admin has no owned workspace, and checks asset files exist under the owning workspace directory.

- [ ] **Step 2: Add the Playwright flow**

The audit must:

1. Sign in as Admin.
2. Create an invitation.
3. Activate a new ordinary user.
4. Create distinct tasks and files for two users.
5. Attempt direct cross-user Action/API/file access and expect rejection or 404.
6. Suspend one user and verify an existing Session becomes invalid.
7. Verify Admin can open both user summaries and audit entries exist.

- [ ] **Step 3: Register scripts**

```json
{
  "scripts": {
    "audit:multi-user": "node scripts/multi-user-audit.mjs",
    "verify:migration": "node scripts/verify-workspace-migration.mjs"
  }
}
```

- [ ] **Step 4: Update operational documentation**

Document bootstrap Admin environment variables, first-login password change, invitation workflow, migration snapshot requirement, verification commands, and rollback to the pre-migration database backup.

- [ ] **Step 5: Run the complete phase gate**

Run:

```bash
npm test
npm run build
npm run verify:migration
```

Start the production build on port 3105 and run:

```bash
npm run smoke
npm run responsive:audit
npm run audit:multi-user
```

Expected: all commands exit 0. The migration verifier reports zero unowned rows and zero missing files.

- [ ] **Step 6: Commit**

```bash
git add scripts/multi-user-audit.mjs scripts/verify-workspace-migration.mjs scripts/smoke.mjs package.json package-lock.json README.md
git commit -m "test: verify multi-user isolation end to end"
```

---

## Phase Completion Review

Before starting the modern-frontend plan:

1. Inspect `git status --short` and confirm only the user's pre-existing `docker-compose.yml` modification remains.
2. Review commits since `a3813ff` for focused scope and passing test evidence.
3. Run the full phase gate from Task 9 again on the final tree.
4. Record migration counts, test totals, build route list, responsive results, and known limitations in the eventual upgrade briefing.
