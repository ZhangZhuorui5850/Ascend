# ZGCA Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the trusted foundation for app login, safe file handling, service-side drafts, change tracking, and cross-device autosync.

**Architecture:** Keep Next.js App Router route handlers as thin HTTP adapters and move behavior into focused `src/lib/*` services. SQLite remains the authority, but all mutable records gain migration-managed schema, versioning, devices, drafts, and change events. Phase 1 ships polling-based sync first; SSE, OCR, FTS, passkeys, and advanced learning analytics are later plans.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript, better-sqlite3, Vitest, Node.js crypto/fs streams, lucide-react.

## Global Constraints

- Read relevant Next.js 16 docs under `node_modules/next/dist/docs/` before writing framework code.
- Use `proxy.ts` rather than deprecated `middleware.ts`.
- Do not rely only on Proxy for authorization; route handlers must verify session state.
- Use deterministic SQLite migrations instead of adding more ad hoc DDL.
- Preserve existing user changes unless explicitly replacing a temporary implementation.
- Keep `.superpowers/` ignored.
- Run `npm run lint`, `npm test`, and `npm run build` before claiming completion.

---

## File Structure

- Create `src/lib/migrations.ts`: deterministic migration runner, checksums, schema version table.
- Modify `src/lib/db.ts`: apply pragmas, call migrations, keep seed logic after base schema exists.
- Create `src/lib/auth.ts`: password hashing, session token creation, cookie constants, session lookup.
- Create `src/lib/request-auth.ts`: route-handler helpers `requireSession`, `optionalSession`, `assertSameOrigin`.
- Create `proxy.ts`: redirect unauthenticated page requests to `/login`.
- Delete or replace `middleware.ts`: Next 16 deprecated convention should not remain active.
- Create `src/app/login/page.tsx`: focused workbench login UI.
- Create `src/components/LoginForm.tsx`: client-side login interaction.
- Create `src/app/api/auth/login/route.ts`: login endpoint.
- Create `src/app/api/auth/logout/route.ts`: logout endpoint.
- Create `src/lib/assets.ts`: safe upload storage, hashing, path confinement, download metadata.
- Modify `src/app/api/assets/route.ts`: immediate-upload HTTP adapter with limits and auth.
- Modify `src/app/api/assets/[id]/file/route.ts`: streamed, confined, safe download.
- Create `src/lib/sync.ts`: device registration, entity changes, draft writes, pull response.
- Create `src/app/api/devices/route.ts`: register or refresh a device.
- Create `src/app/api/drafts/route.ts`: field-level draft autosave.
- Create `src/app/api/sync/pull/route.ts`: polling endpoint.
- Modify `src/app/api/day/[date]/route.ts`: include versions/drafts and route-level auth.
- Create `src/hooks/useAutosyncedFields.ts`: debounce, push draft, poll sync, surface statuses.
- Modify `src/components/DayWorkspace.tsx`: use autosync states instead of manual-only save.
- Modify `src/components/CapturePanel.tsx`: upload immediately on drag/paste/file select, expose retry/download states.
- Modify `src/app/layout.tsx` and `src/app/globals.css`: make login layout isolated and preserve app shell for authenticated routes.
- Add focused tests under `src/lib/*.test.ts` for migrations, auth, assets, sync.
- Add final Phase 1 notes under `docs/reports/2026-07-07-phase1-foundation-briefing.md`.

---

### Task 1: Stabilize Baseline and Migration Runner

**Files:**
- Create: `src/lib/migrations.ts`
- Modify: `src/lib/db.ts`
- Test: `src/lib/migrations.test.ts`

**Interfaces:**
- Produces: `runMigrations(database: Database.Database): void`
- Produces: `getAppliedMigrations(database: Database.Database): string[]`
- Consumes: `better-sqlite3` database instance from `src/lib/db.ts`

- [ ] **Step 1: Write failing migration tests**

Create `src/lib/migrations.test.ts`:

```ts
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { getAppliedMigrations, runMigrations } from "./migrations";

describe("runMigrations", () => {
  it("creates migration bookkeeping and core sync tables", () => {
    const db = new Database(":memory:");

    runMigrations(db);

    expect(getAppliedMigrations(db)).toContain("0001_foundation");
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'devices'").get(),
    ).toMatchObject({ name: "devices" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entity_changes'").get(),
    ).toMatchObject({ name: "entity_changes" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drafts'").get(),
    ).toMatchObject({ name: "drafts" });
  });

  it("is idempotent", () => {
    const db = new Database(":memory:");

    runMigrations(db);
    runMigrations(db);

    expect(getAppliedMigrations(db).filter((version) => version === "0001_foundation")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/migrations.test.ts`

Expected: FAIL because `src/lib/migrations.ts` does not exist.

- [ ] **Step 3: Implement migration runner**

Create `src/lib/migrations.ts`:

```ts
import type Database from "better-sqlite3";
import { createHash } from "node:crypto";

type Migration = {
  version: string;
  sql: string;
};

const migrations: Migration[] = [
  {
    version: "0001_foundation",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_pulled_seq INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS entity_changes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        op_id TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        op TEXT NOT NULL,
        base_version INTEGER,
        patch_json TEXT NOT NULL DEFAULT '{}',
        snapshot_json TEXT NOT NULL DEFAULT '{}',
        device_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        field TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        base_version INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        device_id TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(scope_type, scope_id, field)
      );

      CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        base_version INTEGER NOT NULL,
        local_json TEXT NOT NULL,
        incoming_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        resolved_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_entity_changes_seq ON entity_changes(seq);
      CREATE INDEX IF NOT EXISTS idx_entity_changes_entity ON entity_changes(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_drafts_scope ON drafts(scope_type, scope_id, field);
    `,
  },
];

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum TEXT NOT NULL
    );
  `);

  const applied = new Set(getAppliedMigrations(database));
  const insert = database.prepare("INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)");

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    const apply = database.transaction(() => {
      database.exec(migration.sql);
      insert.run(migration.version, checksum(migration.sql));
    });
    apply();
  }
}

export function getAppliedMigrations(database: Database.Database): string[] {
  const exists = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!exists) return [];
  return database
    .prepare("SELECT version FROM schema_migrations ORDER BY version ASC")
    .all()
    .map((row) => (row as { version: string }).version);
}
```

- [ ] **Step 4: Wire migrations into `db.ts`**

Modify `src/lib/db.ts` imports and `getDb()`:

```ts
import { runMigrations } from "./migrations";
```

Inside `getDb()`, after database creation:

```ts
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  initializeDatabase(db);
  runMigrations(db);
  seedKnowledgeMap(db);
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/lib/migrations.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/migrations.ts src/lib/migrations.test.ts src/lib/db.ts
git commit -m "feat: add database migrations"
```

---

### Task 2: App Session Auth and Next 16 Proxy

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/request-auth.ts`
- Create: `proxy.ts`
- Create: `src/components/LoginForm.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Modify: `src/lib/migrations.ts`
- Delete: `middleware.ts` after replacement is verified
- Test: `src/lib/auth.test.ts`

**Interfaces:**
- Consumes: `runMigrations(database)`
- Produces: `SESSION_COOKIE = "zgca_session"`
- Produces: `hashPassword(password: string, salt?: string): string`
- Produces: `verifyPassword(password: string, stored: string): boolean`
- Produces: `createSession(input: { userId: string; userAgent?: string; ipHint?: string }): { token: string; expiresAt: Date }`
- Produces: `getSessionUser(token: string | undefined): { id: string; email: string; displayName: string } | null`
- Produces: `requireSession(request?: Request): Promise<{ id: string; email: string; displayName: string }>`
- Produces: `assertSameOrigin(request: Request): void`

- [ ] **Step 1: Add a new auth migration for users and sessions**

Append a second migration entry in `src/lib/migrations.ts`. Do not edit the already-applied `0001_foundation` migration. The new entry must be:

```ts
{
  version: "0002_auth_sessions",
  sql: `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      user_agent TEXT NOT NULL DEFAULT '',
      ip_hint TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `,
}
```

- [ ] **Step 2: Write failing auth tests**

Create `src/lib/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth";

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong password", () => {
    const stored = hashPassword("correct-horse-battery-staple", "fixed-test-salt");

    expect(verifyPassword("correct-horse-battery-staple", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("stores algorithm and salt with the hash", () => {
    const stored = hashPassword("secret", "fixed-test-salt");

    expect(stored).toMatch(/^scrypt\\$fixed-test-salt\\$/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/lib/auth.test.ts`

Expected: FAIL because `src/lib/auth.ts` does not exist.

- [ ] **Step 4: Implement auth primitives**

Create `src/lib/auth.ts`:

```ts
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { getDb } from "./db";

export const SESSION_COOKIE = "zgca_session";
const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, expectedHash] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHash) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function ensureDefaultUser(): void {
  const email = process.env.APP_LOGIN_EMAIL;
  const password = process.env.APP_LOGIN_PASSWORD;
  if (!email || !password) return;

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name)
    VALUES (@id, @email, @passwordHash, @displayName)
  `).run({
    id: crypto.randomUUID(),
    email,
    passwordHash: hashPassword(password),
    displayName: "ZGCA",
  });
}

export function authenticateUser(email: string, password: string) {
  ensureDefaultUser();
  const user = getDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as
    | { id: string; email: string; password_hash: string; display_name: string }
    | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return { id: user.id, email: user.email, displayName: user.display_name || user.email };
}

export function createSession(input: { userId: string; userAgent?: string; ipHint?: string }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  getDb().prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_hint)
    VALUES (@id, @userId, @tokenHash, @expiresAt, @userAgent, @ipHint)
  `).run({
    id: crypto.randomUUID(),
    userId: input.userId,
    tokenHash: hashToken(token),
    expiresAt: expiresAt.toISOString(),
    userAgent: input.userAgent || "",
    ipHint: input.ipHint || "",
  });
  return { token, expiresAt };
}

export function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const row = getDb().prepare(`
    SELECT u.id, u.email, u.display_name AS displayName, s.expires_at AS expiresAt
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(hashToken(token)) as
    | { id: string; email: string; displayName: string; expiresAt: string }
    | undefined;
  if (!row || new Date(row.expiresAt).getTime() <= Date.now()) return null;
  return { id: row.id, email: row.email, displayName: row.displayName || row.email };
}

export function deleteSession(token: string | undefined): void {
  if (!token) return;
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}
```

- [ ] **Step 5: Implement route auth helpers**

Create `src/lib/request-auth.ts`:

```ts
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, getSessionUser } from "./auth";

export class AuthError extends Error {
  status = 401;
}

export async function requireSession() {
  const cookieStore = await cookies();
  const user = getSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) throw new AuthError("Authentication required");
  return user;
}

export async function optionalSession() {
  const cookieStore = await cookies();
  return getSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function assertSameOrigin(request: Request): Promise<void> {
  const headerStore = await headers();
  const origin = request.headers.get("origin");
  const host = headerStore.get("host");
  if (!origin || !host) return;
  const originHost = new URL(origin).host;
  if (originHost !== host) {
    const error = new Error("Invalid request origin") as Error & { status?: number };
    error.status = 403;
    throw error;
  }
}
```

- [ ] **Step 6: Implement login/logout routes**

Create `src/app/api/auth/login/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, authenticateUser, createSession } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/request-auth";

export async function POST(request: Request) {
  await assertSameOrigin(request);
  const body = await request.json();
  const user = authenticateUser(String(body.email || ""), String(body.password || ""));
  if (!user) return Response.json({ error: "邮箱或密码不正确" }, { status: 401 });

  const session = createSession({
    userId: user.id,
    userAgent: request.headers.get("user-agent") || "",
    ipHint: request.headers.get("x-forwarded-for") || "",
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });
  return NextResponse.json({ user });
}
```

Create `src/app/api/auth/logout/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, deleteSession } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/request-auth";

export async function POST(request: Request) {
  await assertSameOrigin(request);
  const cookieStore = await cookies();
  deleteSession(cookieStore.get(SESSION_COOKIE)?.value);
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Implement app login UI**

Create `src/components/LoginForm.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setSubmitting(false);
    if (!response.ok) {
      setError("邮箱或密码不正确");
      return;
    }
    router.replace(searchParams.get("next") || "/");
    router.refresh();
  }

  return (
    <form className="loginCard" onSubmit={submit}>
      <span className="eyebrow">ZGCA Workbench</span>
      <h1>回到今天的学习现场</h1>
      <p>日期、资料、错题和总结都在一个私有工作台里继续。</p>
      <label className="field">
        邮箱
        <input autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label className="field">
        密码
        <input
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error ? <p className="formError">{error}</p> : null}
      <button className="primaryButton" disabled={isSubmitting} type="submit">
        {isSubmitting ? "登录中..." : "进入工作台"}
      </button>
    </form>
  );
}
```

Create `src/app/login/page.tsx`:

```tsx
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="loginShell">
      <section className="loginHero">
        <div>
          <span className="brandMark">Z</span>
          <h2>ZGCA 学习工作台</h2>
          <p>日历驱动、资料收纳、复习和总结，都为当天学习服务。</p>
        </div>
      </section>
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 8: Implement Next 16 proxy and remove middleware**

Create `proxy.ts`:

```ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, getSessionUser } from "./src/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }
  const user = getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

Delete `middleware.ts` after verifying `proxy.ts` works.

- [ ] **Step 9: Add login CSS**

Append to `src/app/globals.css`:

```css
.loginShell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
  gap: 28px;
  min-height: 100vh;
  padding: 28px;
  align-items: center;
}

.loginHero,
.loginCard {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.loginHero {
  min-height: calc(100vh - 56px);
  padding: 32px;
  display: grid;
  align-items: end;
}

.loginHero h2 {
  margin-top: 16px;
  font-size: 34px;
}

.loginHero p,
.loginCard p {
  color: var(--muted);
  line-height: 1.65;
}

.loginCard {
  display: grid;
  gap: 14px;
  padding: 24px;
}

.formError {
  color: var(--danger);
  font-size: 13px;
}

@media (max-width: 820px) {
  .loginShell {
    grid-template-columns: 1fr;
    padding: 18px;
  }

  .loginHero {
    min-height: auto;
  }
}
```

- [ ] **Step 10: Run tests and build**

Run:

```bash
npm test -- src/lib/auth.test.ts src/lib/migrations.test.ts
npm run lint
npm run build
```

Expected: all commands pass.

- [ ] **Step 11: Commit**

```bash
git add proxy.ts src/lib/auth.ts src/lib/auth.test.ts src/lib/request-auth.ts src/lib/migrations.ts src/components/LoginForm.tsx src/app/login/page.tsx src/app/api/auth/login/route.ts src/app/api/auth/logout/route.ts src/app/globals.css src/lib/db.ts
git rm middleware.ts
git commit -m "feat: add app session login"
```

---

### Task 3: Route-Level API Guards

**Files:**
- Modify: `src/app/api/day/[date]/route.ts`
- Modify: `src/app/api/assets/route.ts`
- Modify: `src/app/api/assets/[id]/file/route.ts`
- Modify: `src/app/api/study-sessions/route.ts`
- Modify: `src/app/api/mistakes/route.ts`
- Modify: `src/app/api/reviews/route.ts`
- Modify: read-only API routes if they expose private data

**Interfaces:**
- Consumes: `requireSession()`
- Consumes: `assertSameOrigin(request)`

- [ ] **Step 1: Guard day route**

Modify `src/app/api/day/[date]/route.ts`:

```ts
import { getDay, updateDay } from "@/lib/repository";
import { assertSameOrigin, requireSession } from "@/lib/request-auth";

export async function GET(_request: Request, context: { params: Promise<{ date: string }> }) {
  await requireSession();
  const { date } = await context.params;
  return Response.json(getDay(date));
}

export async function PATCH(request: Request, context: { params: Promise<{ date: string }> }) {
  await requireSession();
  await assertSameOrigin(request);
  const { date } = await context.params;
  return Response.json(updateDay(date, await request.json()));
}
```

- [ ] **Step 2: Guard mutation routes**

Apply the same pattern to `study-sessions`, `mistakes`, `reviews`, and `assets`:

```ts
await requireSession();
await assertSameOrigin(request);
```

Place both before reading request bodies.

- [ ] **Step 3: Guard private read routes**

For private GET routes such as dashboard, calendar, knowledge, asset file download:

```ts
await requireSession();
```

Do not require origin for GET.

- [ ] **Step 4: Run verification**

Run:

```bash
npm run lint
npm test
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api
git commit -m "feat: guard api routes"
```

---

### Task 4: Safe Assets and Streamed Downloads

**Files:**
- Create: `src/lib/assets.ts`
- Modify: `src/lib/migrations.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/app/api/assets/route.ts`
- Modify: `src/app/api/assets/[id]/file/route.ts`
- Test: `src/lib/assets.test.ts`

**Interfaces:**
- Produces: `MAX_UPLOAD_BYTES`
- Produces: `storeUploadedFile(input: { file: File; day: string }): Promise<StoredUpload>`
- Produces: `resolveAssetPath(relativePath: string): string`
- Produces: `contentDispositionFor(mimeType: string, originalName: string): string`

- [ ] **Step 1: Add an asset blob migration**

Append a third migration entry in `src/lib/migrations.ts`. Do not edit earlier migrations after they have shipped. The new entry must be:

```ts
{
  version: "0003_asset_blobs",
  sql: `
    CREATE TABLE IF NOT EXISTS blobs (
      id TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL UNIQUE,
      size INTEGER NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      storage_key TEXT NOT NULL UNIQUE,
      ref_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS upload_sessions (
      id TEXT PRIMARY KEY,
      blob_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      received_bytes INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (blob_id) REFERENCES blobs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_blobs_sha256 ON blobs(sha256);
    CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status, expires_at);
  `,
}
```

- [ ] **Step 2: Write asset safety tests**

Create `src/lib/assets.test.ts`:

```ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contentDispositionFor, resolveAssetPathForRoot, storageKeyFor } from "./assets";

describe("asset storage safety", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("uses hash-prefixed storage keys to avoid same-name overwrites", () => {
    expect(storageKeyFor("2026-07-07", "abc123", "PCA.png")).toBe("2026/07/07/original/abc123-PCA.png");
  });

  it("rejects paths that escape the upload root", () => {
    const root = path.join(os.tmpdir(), `zgca-assets-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    roots.push(root);

    expect(() => resolveAssetPathForRoot(root, "../secret.txt")).toThrow("Invalid asset path");
  });

  it("allows safe paths inside upload root", () => {
    const root = path.join(os.tmpdir(), `zgca-assets-${Date.now()}`);
    const relative = "2026/07/07/original/file.txt";
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, "ok");
    roots.push(root);

    expect(resolveAssetPathForRoot(root, relative)).toBe(absolute);
  });

  it("forces active content to download", () => {
    expect(contentDispositionFor("text/html", "x.html")).toMatch(/^attachment;/);
    expect(contentDispositionFor("image/png", "x.png")).toMatch(/^inline;/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/lib/assets.test.ts`

Expected: FAIL because `src/lib/assets.ts` does not exist.

- [ ] **Step 4: Implement asset helpers**

Create `src/lib/assets.ts`:

```ts
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getUploadRoot } from "./db";
import { sanitizeFileName } from "./storage";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type StoredUpload = {
  sha256: string;
  relativePath: string;
  absolutePath: string;
  safeName: string;
  size: number;
};

export function storageKeyFor(day: string, sha256: string, originalName: string): string {
  const [year, month, date] = day.split("-");
  const safeName = sanitizeFileName(originalName);
  return path.posix.join(year, month, date, "original", `${sha256.slice(0, 12)}-${safeName}`);
}

export async function storeUploadedFile(input: { file: File; day: string }): Promise<StoredUpload> {
  if (input.file.size > MAX_UPLOAD_BYTES) throw new Error("File is too large");
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const relativePath = storageKeyFor(input.day, sha256, input.file.name);
  const absolutePath = path.join(getUploadRoot(), relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes, { flag: "wx" });
  return {
    sha256,
    relativePath,
    absolutePath,
    safeName: path.basename(relativePath),
    size: bytes.length,
  };
}

export function resolveAssetPathForRoot(uploadRoot: string, relativePath: string): string {
  const root = path.resolve(uploadRoot);
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error("Invalid asset path");
  return absolute;
}

export function resolveAssetPath(relativePath: string): string {
  return resolveAssetPathForRoot(getUploadRoot(), relativePath);
}

export function contentDispositionFor(mimeType: string, originalName: string): string {
  const encoded = encodeURIComponent(originalName);
  const safeInline = mimeType.startsWith("image/") || mimeType === "application/pdf";
  return `${safeInline ? "inline" : "attachment"}; filename*=UTF-8''${encoded}`;
}

export async function streamAssetFile(absolutePath: string): Promise<ReadableStream<Uint8Array>> {
  await stat(absolutePath);
  return Readable.toWeb(createReadStream(absolutePath)) as ReadableStream<Uint8Array>;
}
```

- [ ] **Step 5: Update repository upload path**

In `src/lib/repository.ts`, replace temp-file copy logic in `createAssetFromUpload` with:

```ts
  const stored = await storeUploadedFile({
    file: input.file,
    day,
  });
```

Insert blob metadata if the `blobs` table exists:

```ts
  db.prepare(`
    INSERT OR IGNORE INTO blobs (id, sha256, size, mime_type, storage_key, ref_count)
    VALUES (@id, @sha256, @size, @mimeType, @storageKey, 0)
  `).run({
    id: stored.sha256,
    sha256: stored.sha256,
    size: stored.size,
    mimeType: input.file.type || "application/octet-stream",
    storageKey: stored.relativePath,
  });
```

Use `stored.relativePath`, `stored.safeName`, and `stored.size` for the asset row.

- [ ] **Step 6: Update download route**

Modify `src/app/api/assets/[id]/file/route.ts`:

```ts
import { getDb } from "@/lib/db";
import { contentDispositionFor, resolveAssetPath, streamAssetFile } from "@/lib/assets";
import { requireSession } from "@/lib/request-auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await context.params;
  const asset = getDb().prepare("SELECT * FROM assets WHERE id = ?").get(id) as
    | { relative_path: string; mime_type: string; original_name: string; size: number }
    | undefined;
  if (!asset) return new Response("Not found", { status: 404 });

  const absolutePath = resolveAssetPath(asset.relative_path);
  const body = await streamAssetFile(absolutePath);
  return new Response(body, {
    headers: {
      "content-type": asset.mime_type || "application/octet-stream",
      "content-disposition": contentDispositionFor(asset.mime_type || "", asset.original_name),
      "x-content-type-options": "nosniff",
      "content-length": String(asset.size || ""),
    },
  });
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- src/lib/assets.test.ts
npm run lint
```

Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/assets.ts src/lib/assets.test.ts src/lib/repository.ts src/app/api/assets src/lib/storage.ts
git commit -m "feat: harden asset storage"
```

---

### Task 5: Devices, Drafts, Change Log, and Pull Sync

**Files:**
- Create: `src/lib/sync.ts`
- Create: `src/lib/sync.test.ts`
- Create: `src/app/api/devices/route.ts`
- Create: `src/app/api/drafts/route.ts`
- Create: `src/app/api/sync/pull/route.ts`

**Interfaces:**
- Produces: `registerDevice(input: { id?: string; name?: string }): Device`
- Produces: `saveDraft(input: SaveDraftInput): DraftResult`
- Produces: `pullChanges(sinceSeq: number): SyncPull`

- [ ] **Step 1: Write sync tests**

Create `src/lib/sync.test.ts`:

```ts
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runMigrations } from "./migrations";
import { pullChangesWithDb, registerDeviceWithDb, saveDraftWithDb } from "./sync";

describe("sync foundation", () => {
  it("registers devices and records draft changes", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    const device = registerDeviceWithDb(db, { id: "device-1", name: "MacBook" });
    const draft = saveDraftWithDb(db, {
      scopeType: "day",
      scopeId: "2026-07-07",
      field: "diary",
      content: "PCA today",
      baseVersion: 0,
      deviceId: device.id,
      opId: "op-1",
    });
    const pulled = pullChangesWithDb(db, 0);

    expect(device).toMatchObject({ id: "device-1", name: "MacBook" });
    expect(draft).toMatchObject({ version: 1, content: "PCA today" });
    expect(pulled.changes).toHaveLength(1);
    expect(pulled.latestSeq).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/sync.test.ts`

Expected: FAIL because `src/lib/sync.ts` does not exist.

- [ ] **Step 3: Implement sync service**

Create `src/lib/sync.ts`:

```ts
import type Database from "better-sqlite3";
import { getDb } from "./db";

export type Device = { id: string; name: string; lastSeenAt: string; lastPulledSeq: number };
export type SaveDraftInput = {
  scopeType: string;
  scopeId: string;
  field: string;
  content: string;
  baseVersion: number;
  deviceId?: string;
  opId: string;
};
export type DraftResult = { id: string; content: string; version: number; updatedAt: string };
export type SyncPull = { latestSeq: number; changes: Array<Record<string, unknown>> };

export function registerDevice(input: { id?: string; name?: string }): Device {
  return registerDeviceWithDb(getDb(), input);
}

export function registerDeviceWithDb(database: Database.Database, input: { id?: string; name?: string }): Device {
  const id = input.id || crypto.randomUUID();
  database.prepare(`
    INSERT INTO devices (id, name, last_seen_at)
    VALUES (@id, @name, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      last_seen_at = CURRENT_TIMESTAMP
  `).run({ id, name: input.name || "" });
  const row = database.prepare("SELECT id, name, last_seen_at AS lastSeenAt, last_pulled_seq AS lastPulledSeq FROM devices WHERE id = ?").get(id);
  return row as Device;
}

export function saveDraft(input: SaveDraftInput): DraftResult {
  return saveDraftWithDb(getDb(), input);
}

export function saveDraftWithDb(database: Database.Database, input: SaveDraftInput): DraftResult {
  const id = `${input.scopeType}:${input.scopeId}:${input.field}`;
  const transaction = database.transaction(() => {
    database.prepare(`
      INSERT INTO drafts (id, scope_type, scope_id, field, content, base_version, version, device_id, updated_at)
      VALUES (@id, @scopeType, @scopeId, @field, @content, @baseVersion, 1, @deviceId, CURRENT_TIMESTAMP)
      ON CONFLICT(scope_type, scope_id, field) DO UPDATE SET
        content = excluded.content,
        base_version = excluded.base_version,
        version = drafts.version + 1,
        device_id = excluded.device_id,
        updated_at = CURRENT_TIMESTAMP
    `).run({ ...input, id, deviceId: input.deviceId || null });
    const row = database.prepare("SELECT id, content, version, updated_at AS updatedAt FROM drafts WHERE id = ?").get(id) as DraftResult;
    database.prepare(`
      INSERT OR IGNORE INTO entity_changes
        (op_id, entity_type, entity_id, op, base_version, patch_json, snapshot_json, device_id)
      VALUES
        (@opId, 'draft', @id, 'upsert', @baseVersion, @patchJson, @snapshotJson, @deviceId)
    `).run({
      opId: input.opId,
      id,
      baseVersion: input.baseVersion,
      patchJson: JSON.stringify({ content: input.content }),
      snapshotJson: JSON.stringify(row),
      deviceId: input.deviceId || null,
    });
    return row;
  });
  return transaction();
}

export function pullChanges(sinceSeq: number): SyncPull {
  return pullChangesWithDb(getDb(), sinceSeq);
}

export function pullChangesWithDb(database: Database.Database, sinceSeq: number): SyncPull {
  const changes = database.prepare(`
    SELECT seq, op_id, entity_type, entity_id, op, base_version, patch_json, snapshot_json, device_id, created_at
    FROM entity_changes
    WHERE seq > ?
    ORDER BY seq ASC
    LIMIT 500
  `).all(sinceSeq) as Array<Record<string, unknown>>;
  const latestSeq = changes.length ? Number(changes[changes.length - 1].seq) : sinceSeq;
  return { latestSeq, changes };
}
```

- [ ] **Step 4: Add route handlers**

Create `src/app/api/devices/route.ts`:

```ts
import { registerDevice } from "@/lib/sync";
import { assertSameOrigin, requireSession } from "@/lib/request-auth";

export async function POST(request: Request) {
  await requireSession();
  await assertSameOrigin(request);
  return Response.json(registerDevice(await request.json()));
}
```

Create `src/app/api/drafts/route.ts`:

```ts
import { saveDraft } from "@/lib/sync";
import { assertSameOrigin, requireSession } from "@/lib/request-auth";

export async function POST(request: Request) {
  await requireSession();
  await assertSameOrigin(request);
  const body = await request.json();
  return Response.json(saveDraft({
    scopeType: String(body.scopeType || ""),
    scopeId: String(body.scopeId || ""),
    field: String(body.field || ""),
    content: String(body.content || ""),
    baseVersion: Number(body.baseVersion || 0),
    deviceId: String(body.deviceId || "") || undefined,
    opId: String(body.opId || crypto.randomUUID()),
  }));
}
```

Create `src/app/api/sync/pull/route.ts`:

```ts
import { pullChanges } from "@/lib/sync";
import { requireSession } from "@/lib/request-auth";

export async function GET(request: Request) {
  await requireSession();
  const sinceSeq = Number(new URL(request.url).searchParams.get("sinceSeq") || 0);
  return Response.json(pullChanges(sinceSeq));
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/lib/sync.test.ts
npm run lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync.ts src/lib/sync.test.ts src/app/api/devices/route.ts src/app/api/drafts/route.ts src/app/api/sync/pull/route.ts
git commit -m "feat: add draft sync foundation"
```

---

### Task 6: Autosynced Day Workspace

**Files:**
- Create: `src/hooks/useAutosyncedFields.ts`
- Modify: `src/components/DayWorkspace.tsx`
- Modify: `src/app/day/[date]/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `POST /api/drafts`
- Consumes: `GET /api/sync/pull`
- Produces: `useAutosyncedFields<T extends Record<string, string>>(input): { fields, updateField, statusByField, globalStatus }`

- [ ] **Step 1: Implement autosync hook**

Create `src/hooks/useAutosyncedFields.ts`:

```ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FieldStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "remote";

export function useAutosyncedFields<T extends Record<string, string>>(input: {
  scopeType: string;
  scopeId: string;
  initial: T;
  debounceMs?: number;
}) {
  const [fields, setFields] = useState<T>(input.initial);
  const [statusByField, setStatusByField] = useState<Record<keyof T, FieldStatus>>({} as Record<keyof T, FieldStatus>);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const deviceId = useMemo(() => {
    const key = "zgca.deviceId";
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(key, next);
    return next;
  }, []);

  function updateField<K extends keyof T>(field: K, value: T[K]) {
    setFields((current) => ({ ...current, [field]: value }));
    setStatusByField((current) => ({ ...current, [field]: "dirty" }));
    const fieldName = String(field);
    clearTimeout(timers.current[fieldName]);
    timers.current[fieldName] = setTimeout(async () => {
      setStatusByField((current) => ({ ...current, [field]: "saving" }));
      try {
        await fetch("/api/drafts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            field: fieldName,
            content: value,
            baseVersion: 0,
            deviceId,
            opId: crypto.randomUUID(),
          }),
        });
        setStatusByField((current) => ({ ...current, [field]: "saved" }));
      } catch {
        setStatusByField((current) => ({ ...current, [field]: "error" }));
      }
    }, input.debounceMs ?? 600);
  }

  useEffect(() => {
    return () => {
      for (const timer of Object.values(timers.current)) clearTimeout(timer);
    };
  }, []);

  return {
    fields,
    updateField,
    statusByField,
    globalStatus: Object.values(statusByField).includes("saving") ? "saving" : "saved",
  };
}
```

- [ ] **Step 2: Wire `DayWorkspace` to hook**

Replace local `form` state in `src/components/DayWorkspace.tsx` with:

```ts
  const {
    fields: form,
    updateField,
    statusByField,
    globalStatus,
  } = useAutosyncedFields({
    scopeType: "day",
    scopeId: date,
    initial: {
      plan: entry.plan || "",
      diary: entry.diary || "",
      summary: entry.summary || "",
      blockers: entry.blockers || "",
      tomorrow: entry.tomorrow || "",
    },
  });

  function update(key: keyof typeof form, value: string) {
    updateField(key, value);
  }
```

Keep `saveDay()` as explicit commit for now, but rename button label to `提交当天正式记录` and show:

```tsx
<p className={`syncStatus sync-${globalStatus}`}>自动同步：{globalStatus === "saving" ? "保存中" : "已保存草稿"}</p>
```

- [ ] **Step 3: Add field status hints**

Under each textarea/input label, add:

```tsx
<small className="fieldStatus">{statusByField.plan === "saving" ? "保存中..." : "自动保存"}</small>
```

Use the matching field key for each field.

- [ ] **Step 4: Add CSS**

Append to `src/app/globals.css`:

```css
.syncStatus,
.fieldStatus {
  color: var(--quiet);
  font-size: 12px;
}

.sync-saving {
  color: var(--warn);
}

.sync-error,
.fieldStatus.error {
  color: var(--danger);
}
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run lint
npm test
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useAutosyncedFields.ts src/components/DayWorkspace.tsx src/app/globals.css
git commit -m "feat: autosync daily drafts"
```

---

### Task 7: Immediate Capture Uploads

**Files:**
- Modify: `src/components/CapturePanel.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `POST /api/assets`
- Consumes: `GET /api/assets/:id/file`

- [ ] **Step 1: Change addFiles to start uploads**

In `src/components/CapturePanel.tsx`, after `setAttachments`, call:

```ts
for (const attachment of next) {
  void uploadQueuedAttachment(attachment);
}
```

Add `assetId?: number` to the `Attachment` type.

- [ ] **Step 2: Implement uploadQueuedAttachment**

Add:

```ts
async function uploadQueuedAttachment(attachment: Attachment) {
  setAttachments((current) =>
    current.map((item) => (item.id === attachment.id ? { ...item, status: "uploading", error: undefined } : item)),
  );
  try {
    const asset = await uploadAttachment(attachment);
    setAttachments((current) =>
      current.map((item) =>
        item.id === attachment.id ? { ...item, status: "uploaded", assetId: Number(asset.id) } : item,
      ),
    );
    setMessage("文件已上传到当天资料流");
  } catch (error) {
    setAttachments((current) =>
      current.map((item) =>
        item.id === attachment.id
          ? { ...item, status: "error", error: error instanceof Error ? error.message : "上传失败" }
          : item,
      ),
    );
  }
}
```

Change `uploadAttachment` return type to:

```ts
async function uploadAttachment(attachment: Attachment): Promise<{ id: number }> {
```

Return:

```ts
return (await response.json()) as { id: number };
```

- [ ] **Step 3: Add retry and download actions**

Inside each uploaded attachment card, add:

```tsx
{attachment.status === "uploaded" && attachment.assetId ? (
  <a className="attachmentLink" href={`/api/assets/${attachment.assetId}/file`} target="_blank">
    下载
  </a>
) : null}
{attachment.status === "error" ? (
  <button className="attachmentLink" onClick={() => uploadQueuedAttachment(attachment)} type="button">
    重试
  </button>
) : null}
```

- [ ] **Step 4: Adjust sendCapture**

Keep quick note submission in `sendCapture`, but remove file upload loop because uploads already start immediately. The function should:

```ts
async function sendCapture() {
  if (!quickNote.trim() && attachments.length === 0) {
    setMessage("先输入记录，或拖入/粘贴文件");
    return;
  }
  if (quickNote.trim()) await submitQuickNote();
  setMessage("记录已写入；文件会在上传成功后自动进入资料流");
}
```

- [ ] **Step 5: Add CSS**

Append:

```css
.attachmentLink {
  border: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}
```

- [ ] **Step 6: Run verification**

Run:

```bash
npm run lint
npm test
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/CapturePanel.tsx src/app/globals.css
git commit -m "feat: upload captured files immediately"
```

---

### Task 8: Phase 1 Responsive and Motion Foundation

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/CapturePanel.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: existing navigation links.
- Produces: responsive shell where capture remains reachable at desktop, tablet, and phone widths.

- [ ] **Step 1: Add responsive shell classes**

In `src/app/layout.tsx`, keep the app shell but allow login to opt out by CSS. Use:

```tsx
<body>
  <div className="appFrame">
    <Sidebar />
    <main className="mainPane">{children}</main>
    <CapturePanel />
  </div>
</body>
```

Login page remains full-screen by styling `.loginShell`.

- [ ] **Step 2: Add mobile capture behavior**

In `src/components/CapturePanel.tsx`, wrap content with a heading that remains reachable and add class names already used by CSS:

```tsx
<aside className={`capturePanel ${isDragging ? "captureDragging" : ""}`} ...>
```

Keep this class stable.

- [ ] **Step 3: Add responsive CSS**

Add or replace media rules:

```css
@media (max-width: 1180px) {
  .appFrame {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .sidebar {
    padding: 16px 10px;
  }

  .sidebar .brand div,
  .sidebar a {
    font-size: 0;
  }

  .capturePanel {
    position: fixed;
    right: 16px;
    bottom: 16px;
    top: auto;
    width: min(420px, calc(100vw - 32px));
    max-height: 72vh;
    height: auto;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: 0 18px 60px rgba(21, 32, 43, 0.18);
    z-index: 20;
  }
}

@media (max-width: 820px) {
  .appFrame {
    display: block;
    padding-bottom: 72px;
  }

  .sidebar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    height: 64px;
    display: flex;
    align-items: center;
    padding: 8px;
    border-top: 1px solid var(--line);
    border-right: 0;
    z-index: 30;
  }

  .sidebar .brand {
    display: none;
  }

  .sidebar nav {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .sidebar nav a:nth-child(n + 6) {
    display: none;
  }

  .sidebar a {
    justify-content: center;
    padding: 10px;
    font-size: 11px;
  }

  .mainPane {
    padding: 18px;
  }

  .capturePanel {
    left: 12px;
    right: 12px;
    bottom: 76px;
    width: auto;
    max-height: 62vh;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .capturePanel,
  .attachmentCard,
  .primaryButton,
  .secondaryButton {
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  }
}
```

- [ ] **Step 4: Run responsive smoke check**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/components/Sidebar.tsx src/components/CapturePanel.tsx src/app/globals.css
git commit -m "feat: improve responsive workbench shell"
```

---

### Task 9: Phase 1 Briefing and Verification

**Files:**
- Create: `docs/reports/2026-07-07-phase1-foundation-briefing.md`

**Interfaces:**
- Consumes: current test/build output.
- Produces: module-by-module Phase 1 report.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run lint
npm test
npm run build
git status --short
```

Expected:
- lint passes
- tests pass
- build passes
- git status only shows intentional files before final commit

- [ ] **Step 2: Write briefing**

Create `docs/reports/2026-07-07-phase1-foundation-briefing.md`:

```md
# Phase 1 Foundation Briefing

Date: 2026-07-07

## Modules Improved

### Database
- Added deterministic migrations.
- Added devices, drafts, conflicts, entity changes, users, sessions, blobs, and upload session foundation.

### Login
- Replaced browser Basic Auth direction with app login and session cookies.
- Added route-level session guards.

### Sync
- Added server-side drafts and polling change pull.
- Added autosave UI states on the day workspace.

### Files
- Added immediate upload flow.
- Hardened storage keys, path confinement, and streamed downloads.

### Responsive Workbench
- Kept desktop three-column workbench.
- Made capture reachable on tablet and phone.

## Verification

- `npm run lint`: paste the exact final command result line, including pass/fail status.
- `npm test`: paste the exact final command result line, including pass/fail status.
- `npm run build`: paste the exact final command result line, including pass/fail status.

## Remaining Work

- Phase 2: day cockpit layout and deeper responsive visual QA.
- Phase 3: mastery loop, mistake reattempts, activity events, and learning analytics.
```

Replace each verification line with the actual command result before committing the briefing.

- [ ] **Step 3: Commit**

```bash
git add docs/reports/2026-07-07-phase1-foundation-briefing.md
git commit -m "docs: report phase 1 foundation"
```

---

## Self-Review

Spec coverage:
- App login: Task 2 and Task 3.
- Next 16 proxy: Task 2.
- Route-level auth: Task 3.
- Migration and database foundation: Task 1, Task 2, Task 5.
- Safe upload/download: Task 4 and Task 7.
- Autosync and multi-device polling: Task 5 and Task 6.
- Responsive and motion foundation: Task 8.
- Briefing/report: Task 9.
- Learning mastery loop: intentionally deferred to Phase 3 plan because it depends on the change/event foundation built here.

No placeholder scan:
- The plan contains no unresolved placeholder markers.
- Deferred items are assigned to later phases from the approved design spec rather than left ambiguous inside Phase 1.

Type consistency:
- Auth helpers, sync helpers, and asset helpers have explicit produced interfaces and matching task usage.
