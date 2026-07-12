# Relax Password Requirements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow every account to use any non-empty password, including `zhang...`, while retaining current-password, confirmation, session-revocation, and hashing behavior.

**Architecture:** Keep the existing authentication and admin repository functions as the server-side trust boundary, replacing their 12-character checks with explicit non-empty checks. Align all four password-entry UIs with that rule by retaining HTML `required` where forms submit natively and removing length-based hints, attributes, and button conditions.

**Tech Stack:** Next.js 16.2.10 App Router and Server Actions, React 19.2.4, TypeScript, better-sqlite3, Vitest, ESLint.

## Global Constraints

- Any non-empty password is valid; the literal password `zhang...` must work.
- Empty passwords must still be rejected on the server.
- Current-password verification, confirmation matching, different-new-password checks, scrypt hashing, session revocation, and forced-change state transitions remain unchanged.
- Do not change a production password or deploy as part of this implementation.

---

### Task 1: Server-side password policy

**Files:**
- Modify: `src/lib/auth.test.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/repo/admin.test.ts`
- Modify: `src/lib/repo/admin.ts`

**Interfaces:**
- Consumes: `changePassword(userId: string, currentPassword: string, newPassword: string, database?: Database.Database): void`, `activateInvitation(db, token, password)`, and `resetUserPassword(db, admin, targetUserId, temporaryPassword)`.
- Produces: the same public interfaces, now accepting every non-empty password.

- [ ] **Step 1: Write failing authentication tests**

Change the forced-password test to call `changePassword(..., "zhang...", db)` and authenticate with `zhang...`. Add a test that calls `changePassword(..., "", db)` and expects `"新密码不能为空"`.

- [ ] **Step 2: Run the authentication tests and verify RED**

Run: `npm test -- src/lib/auth.test.ts`

Expected: the `zhang...` case fails with the existing 12-character error, proving the old rule is under test.

- [ ] **Step 3: Write failing admin repository tests**

Activate an invitation with `zhang...`, reset a user's temporary password to `zhang...`, verify its hash, and replace the old short-password rejection with explicit empty-password rejection expecting `"密码不能为空"`.

- [ ] **Step 4: Run the repository tests and verify RED**

Run: `npm test -- src/lib/repo/admin.test.ts`

Expected: invitation activation or reset with `zhang...` fails because the existing minimum is 12 characters.

- [ ] **Step 5: Implement the minimal server policy**

In `changePassword`, replace `newPassword.length < 12` with `!newPassword.length` and throw `new Error("新密码不能为空")`. In invitation activation and administrator reset, replace the `MIN_PASSWORD_LENGTH` checks with non-empty checks and the messages `"密码不能为空"` and `"临时密码不能为空"`; remove the now-unused constant.

- [ ] **Step 6: Run both focused suites and verify GREEN**

Run: `npm test -- src/lib/auth.test.ts src/lib/repo/admin.test.ts`

Expected: both files pass, including `zhang...` acceptance and empty-password rejection.

- [ ] **Step 7: Commit the server policy**

```powershell
git add src/lib/auth.ts src/lib/auth.test.ts src/lib/repo/admin.ts src/lib/repo/admin.test.ts
git commit -m "feat(auth): allow non-empty simple passwords"
```

### Task 2: Password form alignment

**Files:**
- Modify: `src/components/ChangePasswordForm.tsx`
- Modify: `src/components/AccountSection.tsx`
- Modify: `src/components/admin/InviteActivationForm.tsx`
- Modify: `src/components/admin/UserStatusActions.tsx`

**Interfaces:**
- Consumes: existing Server Actions and local component state without signature changes.
- Produces: forms that no longer reject `zhang...` in the browser and still reject empty input before submission.

- [ ] **Step 1: Remove browser length constraints**

Remove every password `minLength={12}` attribute and every “至少 12” label or description from the four components. Preserve `required` on native form fields. In `AccountSection`, change the update button condition from `newPassword.length < 12` to `!newPassword`. In `UserStatusActions`, change `temporaryPassword.length < 12` to `!temporaryPassword`.

- [ ] **Step 2: Verify no obsolete UI rule remains**

Run: `rg -n "minLength=\{12\}|至少 12|length < 12" src/components`

Expected: no matches.

- [ ] **Step 3: Run static checks**

Run: `npm run lint`

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 4: Commit the aligned forms**

```powershell
git add src/components/ChangePasswordForm.tsx src/components/AccountSection.tsx src/components/admin/InviteActivationForm.tsx src/components/admin/UserStatusActions.tsx
git commit -m "fix(auth): align password forms with simple policy"
```

### Task 3: Full verification

**Files:**
- Verify only; no planned source edits.

**Interfaces:**
- Consumes: the completed server and UI changes.
- Produces: evidence that the repository remains testable and production-buildable.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all Vitest tests pass.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: Next.js 16.2.10 production build exits successfully.

- [ ] **Step 3: Inspect the final diff**

Run: `git status --short; git log -3 --oneline; git diff HEAD~2 --check`

Expected: no uncommitted implementation files, the two implementation commits are present, and `git diff --check` reports no whitespace errors.
