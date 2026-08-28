# Notion 式拖拽体验升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把知识点/章节拖拽升级为 Notion 式体验：自定义半透明拖拽卡片、插入位置指示线、跨章节移动知识点、章节拖到任意同级位置或嵌套。

**Architecture:** 原生 HTML5 DnD 自研（零新依赖）。新增纯函数命中计算 + 拖拽卡片工厂（`src/components/dnd.ts`），拖拽状态提升到 SubjectWorkbench 顶层统一管理；repo 层新增 `movePointToPosition` / `moveChapterToPosition` 两个事务函数（无 schema 变更），各配一个 server action，沿用既有写路径（`requireWorkspace` → repo → `revalidatePath` → 客户端 `report()` + `router.refresh()`）。

**Tech Stack:** Next.js 16 App Router、React 19、better-sqlite3、vitest、原生 CSS（token 变量，无 tailwind）。

**Spec:** `docs/superpowers/specs/2026-07-14-notion-style-dnd-design.md`

## 项目背景速览（给零上下文的执行者）

- 测试：`npm test`（vitest，node 环境，测试文件与源码同目录 `*.test.ts`）；`npm run lint`；`npm run build`。三者全绿才算完成。
- repo 层：`src/lib/repo/knowledge.ts`，手写 prepared statements，全部按 `workspace_id` 隔离；错误直接 `throw new Error("中文消息")`，由 action 层兜住。
- 测试库：`createTestDb()`（内存库跑全量建表+迁移）、`createTestWorkspace()`、`seedSubjectWithChapter()`，见 `src/lib/repo/testing.ts`；`legacyScope = { workspaceId: LEGACY_WORKSPACE_ID }`。
- 知识点顺序 = `knowledge_points.sort_order`（章内 1 起连续整数），展示查询按 `sort_order ASC, id ASC`；章节顺序 = `subject_chapters.sort_order`（同 parent 下 1 起），查询按 `sort_order ASC, title ASC`。
- `knowledge_points.submodule` 冗余存储所属章节标题（`createPoint` 写入 `chapter.title`），跨章移动必须同步更新。
- 章节树：`parent_id` 自引用，`MAX_CHAPTER_DEPTH = 8`（含根）；私有帮助函数 `chapterDepth`（自身层级，顶层=1）、`collectChapterSubtree`（含根的子树 id 列表）、`chapterSubtreeHeight`（子树高度，根算 1）都已存在于 `knowledge.ts`。
- UI：`src/components/SubjectWorkbench.tsx`（客户端组件）。现状：知识点拖拽只在 `sortMode === "manual"` 下开启（`draggable` 变量）；章节拖拽经 `tree.dragChapterId` 只支持"拖到标题上变子章节"。样式在 `src/app/globals.css`，颜色一律用 `src/styles/tokens.css` 的变量（`--accent`、`--accent-soft`、`--surface-raised`、`--line-strong`、`--quiet`、`--radius-sm`、`--shadow-lg` 等，多套 `data-skin` 皮肤都会覆写这些 token，禁止写死色值）。

---

### Task 1: 拖拽帮助模块 `src/components/dnd.ts`（命中计算 + 拖拽卡片）

**Files:**
- Create: `src/components/dnd.ts`
- Test: `src/components/dnd.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/components/dnd.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { edgeForOffset } from "./dnd";

describe("edgeForOffset", () => {
  it("half 模式以中线分前后", () => {
    expect(edgeForOffset(9, 40, "half")).toBe("before");
    expect(edgeForOffset(31, 40, "half")).toBe("after");
  });

  it("nest 模式上 1/4 前、下 1/4 后、中间嵌套", () => {
    expect(edgeForOffset(5, 40, "nest")).toBe("before");
    expect(edgeForOffset(20, 40, "nest")).toBe("inside");
    expect(edgeForOffset(38, 40, "nest")).toBe("after");
  });

  it("越界偏移与零高度有稳定兜底", () => {
    expect(edgeForOffset(-5, 40, "half")).toBe("before");
    expect(edgeForOffset(60, 40, "half")).toBe("after");
    expect(edgeForOffset(10, 0, "half")).toBe("after");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/components/dnd.test.ts`
Expected: FAIL（找不到 `./dnd` 模块）

- [ ] **Step 3: 写最小实现**

创建 `src/components/dnd.ts`：

```ts
import type { DragEvent } from "react";

/** 全局唯一的拖拽负载：知识点或章节，由 SubjectWorkbench 顶层 state 持有 */
export type DragPayload =
  | { kind: "point"; id: string; chapterId: string | null; title: string }
  | { kind: "chapter"; id: string; title: string; subtreeIds: string[]; height: number };

export type ChapterDrag = Extract<DragPayload, { kind: "chapter" }>;

export type DropEdge = "before" | "after" | "inside";

/** 光标纵向占比 → 插入位置。half：中线分前后；nest：上 1/4 前、下 1/4 后、中间 inside */
export function edgeForOffset(offsetY: number, height: number, zones: "half" | "nest"): DropEdge {
  if (height <= 0) return "after";
  const ratio = Math.min(Math.max(offsetY / height, 0), 1);
  if (zones === "half") return ratio < 0.5 ? "before" : "after";
  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return "inside";
}

export function edgeFromEvent(event: DragEvent<HTMLElement>, zones: "half" | "nest"): DropEdge {
  const rect = event.currentTarget.getBoundingClientRect();
  return edgeForOffset(event.clientY - rect.top, rect.height, zones);
}

/** dragstart 时生成 Notion 风格拖拽卡片：挂到 body 屏幕外，setDragImage 截图后下一帧移除 */
export function attachDragCard(event: DragEvent<HTMLElement>, title: string, meta?: string) {
  const card = document.createElement("div");
  card.className = "dragCard";
  const label = document.createElement("span");
  label.textContent = title;
  card.appendChild(label);
  if (meta) {
    const metaEl = document.createElement("small");
    metaEl.textContent = meta;
    card.appendChild(metaEl);
  }
  document.body.appendChild(card);
  event.dataTransfer.setDragImage(card, 12, 14);
  window.setTimeout(() => card.remove(), 0);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/components/dnd.test.ts`
Expected: PASS（3 个用例）

- [ ] **Step 5: 加拖拽卡片样式**

在 `src/app/globals.css` 中现有 `.pointMoveButtons button:disabled` 规则块之后（约 1806 行附近）插入：

```css
/* ===== Notion 式拖拽 ===== */

/* setDragImage 用的浮动卡片：必须真实渲染（不能 display:none），放到屏幕外 */
.dragCard {
  position: absolute;
  top: 0;
  left: -9999px;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 260px;
  padding: 6px 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow-lg);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.dragCard span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dragCard small {
  color: var(--quiet);
  font-weight: 400;
  white-space: nowrap;
}

/* 拖拽进行中：全局禁选中，避免拖过文字时高亮 */
body[data-dragging] {
  user-select: none;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/dnd.ts src/components/dnd.test.ts src/app/globals.css
git commit -m "feat(dnd): 拖拽命中计算与 Notion 风格拖拽卡片基础模块"
```

---

### Task 2: repo `movePointToPosition`（同章插入 + 跨章迁移）

**Files:**
- Modify: `src/lib/repo/knowledge.ts`（在 `reorderPoints` 之后追加）
- Test: `src/lib/repo/knowledge.test.ts`

**语义约定（后续 UI 依赖）**：`index` 是知识点在目标章节**最终列表**中的 0 起位置（列表不含它自己），越界自动夹取到末尾。同章移动同样适用（先从列表移除自己再 splice）。

- [ ] **Step 1: 写失败测试**

在 `src/lib/repo/knowledge.test.ts` 的 `describe("knowledge repo", ...)` 内追加用例，并把 `movePointToPosition` 加进文件顶部的 `./knowledge` import 列表：

```ts
it("moves a point within its chapter to the given position", () => {
  const db = createTestDb();
  createSubject(db, legacyScope, { code: "M9", name: "测试" });
  const chapter = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
  const a = createPoint(db, legacyScope, { chapterId: chapter.id, title: "A" });
  createPoint(db, legacyScope, { chapterId: chapter.id, title: "B" });
  createPoint(db, legacyScope, { chapterId: chapter.id, title: "C" });

  movePointToPosition(db, legacyScope, { pointId: a.id, targetChapterId: chapter.id, index: 2 });

  const detail = getSubjectDetail(db, legacyScope, "M9");
  expect(detail?.chapters[0].points.map((point) => point.title)).toEqual(["B", "C", "A"]);
});

it("moves a point across chapters, renumbers both and syncs submodule", () => {
  const db = createTestDb();
  createSubject(db, legacyScope, { code: "M9", name: "测试" });
  const first = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
  const second = createChapter(db, legacyScope, { subjectCode: "M9", title: "第二章" });
  const a = createPoint(db, legacyScope, { chapterId: first.id, title: "A" });
  createPoint(db, legacyScope, { chapterId: first.id, title: "B" });
  createPoint(db, legacyScope, { chapterId: second.id, title: "C" });

  movePointToPosition(db, legacyScope, { pointId: a.id, targetChapterId: second.id, index: 0 });

  const detail = getSubjectDetail(db, legacyScope, "M9");
  const chapters = detail?.chapters ?? [];
  expect(chapters.find((c) => c.id === first.id)?.points.map((p) => p.title)).toEqual(["B"]);
  expect(chapters.find((c) => c.id === second.id)?.points.map((p) => p.title)).toEqual(["A", "C"]);
  const moved = db.prepare(
    "SELECT chapter_id, submodule, sort_order FROM knowledge_points WHERE id = ?",
  ).get(a.id);
  expect(moved).toMatchObject({ chapter_id: second.id, submodule: "第二章", sort_order: 1 });
  const left = db.prepare(
    "SELECT sort_order FROM knowledge_points WHERE chapter_id = ?",
  ).get(first.id);
  expect(left).toMatchObject({ sort_order: 1 });
});

it("clamps an out-of-range point index to the end", () => {
  const db = createTestDb();
  createSubject(db, legacyScope, { code: "M9", name: "测试" });
  const chapter = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
  const a = createPoint(db, legacyScope, { chapterId: chapter.id, title: "A" });
  createPoint(db, legacyScope, { chapterId: chapter.id, title: "B" });

  movePointToPosition(db, legacyScope, { pointId: a.id, targetChapterId: chapter.id, index: 99 });

  const detail = getSubjectDetail(db, legacyScope, "M9");
  expect(detail?.chapters[0].points.map((point) => point.title)).toEqual(["B", "A"]);
});

it("rejects cross-subject point moves and missing rows", () => {
  const db = createTestDb();
  createSubject(db, legacyScope, { code: "M9", name: "甲" });
  createSubject(db, legacyScope, { code: "M8", name: "乙" });
  const home = createChapter(db, legacyScope, { subjectCode: "M9", title: "甲一章" });
  const foreign = createChapter(db, legacyScope, { subjectCode: "M8", title: "乙一章" });
  const a = createPoint(db, legacyScope, { chapterId: home.id, title: "A" });

  expect(() =>
    movePointToPosition(db, legacyScope, { pointId: a.id, targetChapterId: foreign.id, index: 0 }),
  ).toThrow("不能移动到其他科目的章节");
  expect(() =>
    movePointToPosition(db, legacyScope, { pointId: "missing", targetChapterId: home.id, index: 0 }),
  ).toThrow("知识点不存在");
  expect(() =>
    movePointToPosition(db, legacyScope, { pointId: a.id, targetChapterId: "missing", index: 0 }),
  ).toThrow("目标章节不存在");
});

it("keeps point moves isolated by workspace", () => {
  const db = createTestDb();
  const alice = createTestWorkspace(db, { userId: "user-a", email: "a@example.com" });
  const bob = createTestWorkspace(db, { userId: "user-b", email: "b@example.com" });
  createSubject(db, alice, { code: "OWN", name: "A 的科目" });
  const chapter = createChapter(db, alice, { subjectCode: "OWN", title: "第一章" });
  const point = createPoint(db, alice, { chapterId: chapter.id, title: "A" });

  expect(() =>
    movePointToPosition(db, bob, { pointId: point.id, targetChapterId: chapter.id, index: 0 }),
  ).toThrow("知识点不存在");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/repo/knowledge.test.ts`
Expected: FAIL（`movePointToPosition` 未导出）

- [ ] **Step 3: 写实现**

在 `src/lib/repo/knowledge.ts` 的 `reorderPoints` 函数之后追加：

```ts
/** 拖拽移动知识点：插到目标章节最终列表的第 index 位（0 起，越界夹取）；跨章时迁移并重排两章、同步 submodule。 */
export function movePointToPosition(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { pointId: string; targetChapterId: string; index: number },
) {
  const pointId = input.pointId.trim();
  const targetChapterId = input.targetChapterId.trim();
  if (!pointId || !targetChapterId) throw new Error("知识点和目标章节必填");
  const point = db.prepare(
    "SELECT id, chapter_id, subject_code FROM knowledge_points WHERE workspace_id = ? AND id = ?",
  ).get(scope.workspaceId, pointId) as
    | { id: string; chapter_id: string | null; subject_code: string }
    | undefined;
  if (!point) throw new Error("知识点不存在");
  const target = db.prepare(
    "SELECT id, title, subject_code FROM subject_chapters WHERE workspace_id = ? AND id = ?",
  ).get(scope.workspaceId, targetChapterId) as
    | { id: string; title: string; subject_code: string }
    | undefined;
  if (!target) throw new Error("目标章节不存在");
  if (target.subject_code !== point.subject_code) throw new Error("不能移动到其他科目的章节");

  const listOf = db.prepare(
    `SELECT id FROM knowledge_points WHERE workspace_id = ? AND chapter_id = ?
     ORDER BY sort_order ASC, id ASC`,
  );
  const setOrder = db.prepare("UPDATE knowledge_points SET sort_order = ? WHERE workspace_id = ? AND id = ?");
  const move = db.transaction(() => {
    if (point.chapter_id && point.chapter_id !== targetChapterId) {
      const rest = (listOf.all(scope.workspaceId, point.chapter_id) as Array<{ id: string }>)
        .filter((row) => row.id !== pointId);
      rest.forEach((row, order) => setOrder.run(order + 1, scope.workspaceId, row.id));
    }
    db.prepare(
      "UPDATE knowledge_points SET chapter_id = ?, submodule = ? WHERE workspace_id = ? AND id = ?",
    ).run(targetChapterId, target.title, scope.workspaceId, pointId);
    const ids = (listOf.all(scope.workspaceId, targetChapterId) as Array<{ id: string }>)
      .map((row) => row.id)
      .filter((id) => id !== pointId);
    const index = Math.max(0, Math.min(Math.trunc(input.index), ids.length));
    ids.splice(index, 0, pointId);
    ids.forEach((id, order) => setOrder.run(order + 1, scope.workspaceId, id));
  });
  move();
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/repo/knowledge.test.ts`
Expected: PASS（全部用例，含原有用例）

- [ ] **Step 5: Commit**

```bash
git add src/lib/repo/knowledge.ts src/lib/repo/knowledge.test.ts
git commit -m "feat(repo): movePointToPosition——知识点同章插入与跨章迁移"
```

---

### Task 3: repo `moveChapterToPosition`（同级任意位置 + 换父级）

**Files:**
- Modify: `src/lib/repo/knowledge.ts`（在 `reparentChapter` 之后追加）
- Test: `src/lib/repo/knowledge.test.ts`

**语义约定**：`index` 是章节在目标 `parentId`（null = 顶层）**最终同级列表**中的 0 起位置（列表不含它自己），越界夹取。防环与深度校验与 `reparentChapter` 完全一致。

- [ ] **Step 1: 写失败测试**

在 `src/lib/repo/knowledge.test.ts` 追加（import 列表加 `moveChapterToPosition`）：

```ts
it("reorders a chapter among top-level siblings", () => {
  const db = createTestDb();
  createSubject(db, legacyScope, { code: "M9", name: "测试" });
  createChapter(db, legacyScope, { subjectCode: "M9", title: "A" });
  createChapter(db, legacyScope, { subjectCode: "M9", title: "B" });
  const c = createChapter(db, legacyScope, { subjectCode: "M9", title: "C" });

  moveChapterToPosition(db, legacyScope, { id: c.id, parentId: null, index: 0 });

  const detail = getSubjectDetail(db, legacyScope, "M9");
  expect(detail?.chapters.map((chapter) => chapter.title)).toEqual(["C", "A", "B"]);
});

it("moves a chapter under a new parent at the given position", () => {
  const db = createTestDb();
  createSubject(db, legacyScope, { code: "M9", name: "测试" });
  const parent = createChapter(db, legacyScope, { subjectCode: "M9", title: "父" });
  createChapter(db, legacyScope, { subjectCode: "M9", title: "老大", parentId: parent.id });
  const joiner = createChapter(db, legacyScope, { subjectCode: "M9", title: "插队" });

  moveChapterToPosition(db, legacyScope, { id: joiner.id, parentId: parent.id, index: 0 });

  const detail = getSubjectDetail(db, legacyScope, "M9");
  const tree = detail?.chapters.find((chapter) => chapter.id === parent.id);
  expect(tree?.children.map((child) => child.title)).toEqual(["插队", "老大"]);
});

it("moves a nested chapter back to top level", () => {
  const db = createTestDb();
  createSubject(db, legacyScope, { code: "M9", name: "测试" });
  const parent = createChapter(db, legacyScope, { subjectCode: "M9", title: "父" });
  const child = createChapter(db, legacyScope, { subjectCode: "M9", title: "子", parentId: parent.id });

  moveChapterToPosition(db, legacyScope, { id: child.id, parentId: null, index: 0 });

  const detail = getSubjectDetail(db, legacyScope, "M9");
  expect(detail?.chapters.map((chapter) => chapter.title)).toEqual(["子", "父"]);
  expect(detail?.chapters.find((chapter) => chapter.id === parent.id)?.children).toEqual([]);
});

it("rejects moving a chapter into its own subtree", () => {
  const db = createTestDb();
  createSubject(db, legacyScope, { code: "M9", name: "测试" });
  const root = createChapter(db, legacyScope, { subjectCode: "M9", title: "根" });
  const leaf = createChapter(db, legacyScope, { subjectCode: "M9", title: "叶", parentId: root.id });

  expect(() =>
    moveChapterToPosition(db, legacyScope, { id: root.id, parentId: leaf.id, index: 0 }),
  ).toThrow("不能移动到自己的子章节里");
});

it("rejects chapter moves beyond the max depth", () => {
  const db = createTestDb();
  createSubject(db, legacyScope, { code: "M9", name: "测试" });
  let parentId: string | null = null;
  let deepest = "";
  for (let level = 1; level <= 8; level += 1) {
    const created = createChapter(db, legacyScope, { subjectCode: "M9", title: `层${level}`, parentId });
    parentId = created.id;
    deepest = created.id;
  }
  const extra = createChapter(db, legacyScope, { subjectCode: "M9", title: "顶层" });

  expect(() =>
    moveChapterToPosition(db, legacyScope, { id: extra.id, parentId: deepest, index: 0 }),
  ).toThrow(/层级/);
});

it("keeps chapter moves isolated by workspace", () => {
  const db = createTestDb();
  const alice = createTestWorkspace(db, { userId: "user-a2", email: "a2@example.com" });
  const bob = createTestWorkspace(db, { userId: "user-b2", email: "b2@example.com" });
  createSubject(db, alice, { code: "OWN", name: "A 的科目" });
  const chapter = createChapter(db, alice, { subjectCode: "OWN", title: "第一章" });

  expect(() =>
    moveChapterToPosition(db, bob, { id: chapter.id, parentId: null, index: 0 }),
  ).toThrow("章节不存在");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/repo/knowledge.test.ts`
Expected: FAIL（`moveChapterToPosition` 未导出）

- [ ] **Step 3: 写实现**

在 `src/lib/repo/knowledge.ts` 的 `reparentChapter` 之后追加（复用同文件私有的 `collectChapterSubtree` / `chapterDepth` / `chapterSubtreeHeight`）：

```ts
/** 拖拽移动章节：挂到 parentId（null = 顶层）同级第 index 位（0 起，越界夹取）；防环、防超深。 */
export function moveChapterToPosition(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; parentId: string | null; index: number },
) {
  const chapterId = input.id.trim();
  if (!chapterId) throw new Error("章节必填");
  const chapter = db.prepare(
    "SELECT id, subject_code, parent_id FROM subject_chapters WHERE workspace_id = ? AND id = ?",
  ).get(scope.workspaceId, chapterId) as
    | { id: string; subject_code: string; parent_id: string | null }
    | undefined;
  if (!chapter) throw new Error("章节不存在");
  const parentId = input.parentId?.trim() || null;

  if (parentId) {
    if (parentId === chapterId) throw new Error("不能移动到自身");
    const parent = db.prepare(
      "SELECT id, subject_code FROM subject_chapters WHERE workspace_id = ? AND id = ?",
    ).get(scope.workspaceId, parentId) as { id: string; subject_code: string } | undefined;
    if (!parent || parent.subject_code !== chapter.subject_code) throw new Error("目标章节不存在");
    if (collectChapterSubtree(db, scope, chapterId).includes(parentId)) {
      throw new Error("不能移动到自己的子章节里");
    }
    const depth = chapterDepth(db, scope, parentId) + chapterSubtreeHeight(db, scope, chapterId);
    if (depth > MAX_CHAPTER_DEPTH) throw new Error(`章节层级最多 ${MAX_CHAPTER_DEPTH} 层`);
  }

  const siblings = (db.prepare(
    `SELECT id FROM subject_chapters WHERE workspace_id = ? AND subject_code = ? AND parent_id IS ?
     ORDER BY sort_order ASC, title ASC`,
  ).all(scope.workspaceId, chapter.subject_code, parentId) as Array<{ id: string }>)
    .map((row) => row.id)
    .filter((id) => id !== chapterId);
  const index = Math.max(0, Math.min(Math.trunc(input.index), siblings.length));
  siblings.splice(index, 0, chapterId);
  const setOrder = db.prepare("UPDATE subject_chapters SET sort_order = ? WHERE workspace_id = ? AND id = ?");
  const move = db.transaction(() => {
    db.prepare(
      "UPDATE subject_chapters SET parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ?",
    ).run(parentId, scope.workspaceId, chapterId);
    siblings.forEach((id, order) => setOrder.run(order + 1, scope.workspaceId, id));
  });
  move();
}
```

注意：同父级纯排序时深度校验也成立（子树已在该深度，校验必然通过），无需特判。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/repo/knowledge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/repo/knowledge.ts src/lib/repo/knowledge.test.ts
git commit -m "feat(repo): moveChapterToPosition——章节同级任意位置排序与换父级"
```

---

### Task 4: server actions `movePointAction` / `moveChapterToPositionAction`

**Files:**
- Modify: `src/app/actions/knowledge.ts`

action 层无单测（依赖 `requireWorkspace` 请求上下文，仓库惯例如此），靠 Task 7 的 `npm run build` 保证类型正确。

- [ ] **Step 1: 加 import**

`src/app/actions/knowledge.ts` 顶部 `@/lib/repo/knowledge` 的 import 列表中按字母序加入 `moveChapterToPosition` 和 `movePointToPosition`。

- [ ] **Step 2: 追加两个 action**

在 `reorderPointsAction` 之后追加：

```ts
export async function movePointAction(input: {
  pointId: string;
  targetChapterId: string;
  index: number;
  subjectCode: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    movePointToPosition(getDb(), access, {
      pointId: input.pointId,
      targetChapterId: input.targetChapterId,
      index: input.index,
    });
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function moveChapterToPositionAction(input: {
  id: string;
  parentId: string | null;
  index: number;
  subjectCode: string;
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    moveChapterToPosition(getDb(), access, {
      id: input.id,
      parentId: input.parentId,
      index: input.index,
    });
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
```

- [ ] **Step 3: 快速类型检查**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/knowledge.ts
git commit -m "feat(actions): 知识点/章节拖拽移动 server action"
```

---

### Task 5: 知识点拖拽 UI——指示线、跨章节、拖拽卡片

**Files:**
- Modify: `src/components/SubjectWorkbench.tsx`
- Modify: `src/app/globals.css`

本任务把拖拽状态提升到顶层并重做知识点拖拽；章节拖拽在 Task 6 改造（本任务保持 `tree.drag` 兼容旧行为：先把 `dragChapterId` 换成统一 `drag`，章节头暂时保持"拖上去嵌套"逻辑）。

- [ ] **Step 1: 顶层状态与 TreeControls 改造**

`src/components/SubjectWorkbench.tsx`：

1. import 区加入：

```ts
import { attachDragCard, edgeFromEvent, type DragPayload } from "@/components/dnd";
import { movePointAction, moveChapterToPositionAction } from "@/app/actions/knowledge";
```

（`movePointAction`、`moveChapterToPositionAction` 直接并入现有 `@/app/actions/knowledge` import 列表，按字母序。）

2. `TreeControls` 类型改为：

```ts
/** 章节树共享的操作句柄：折叠、拖拽、聚焦 */
type TreeControls = {
  collapsedMap: Record<string, boolean>;
  toggleCollapsed: (id: string, defaultCollapsed: boolean) => void;
  drag: DragPayload | null;
  setDrag: (payload: DragPayload | null) => void;
  nestChapter: (childId: string, parentId: string | null) => Promise<void>;
  moveChapterTo: (id: string, parentId: string | null, index: number) => Promise<void>;
  movePointTo: (pointId: string, targetChapterId: string, index: number) => Promise<void>;
  treeBusy: boolean;
  focusChapter: (id: string | null) => void;
};
```

3. `SubjectWorkbench` 组件内：删掉 `const [dragChapterId, setDragChapterId] = useState<string | null>(null);`，替换为：

```ts
const [drag, setDrag] = useState<DragPayload | null>(null);
useEffect(() => {
  if (drag) document.body.setAttribute("data-dragging", drag.kind);
  else document.body.removeAttribute("data-dragging");
  return () => document.body.removeAttribute("data-dragging");
}, [drag]);
```

4. `nestChapter` 之后新增两个顶层提交函数：

```ts
async function moveChapterTo(id: string, parentId: string | null, index: number) {
  if (treeBusy || id === parentId) return;
  setTreeBusy(true);
  try {
    report(await moveChapterToPositionAction({ id, parentId, index, subjectCode: subject.code }));
  } catch {
    report({ ok: false, error: "网络异常，章节移动未保存" });
  } finally {
    setTreeBusy(false);
  }
}

async function movePointTo(pointId: string, targetChapterId: string, index: number) {
  if (treeBusy) return;
  setTreeBusy(true);
  try {
    report(await movePointAction({ pointId, targetChapterId, index, subjectCode: subject.code }));
  } catch {
    report({ ok: false, error: "网络异常，移动未保存" });
  } finally {
    setTreeBusy(false);
  }
}
```

5. `tree` 对象改为：

```ts
const tree: TreeControls = {
  collapsedMap,
  toggleCollapsed,
  drag,
  setDrag,
  nestChapter,
  moveChapterTo,
  movePointTo,
  treeBusy,
  focusChapter,
};
```

- [ ] **Step 2: 章节头旧引用改到新状态（保持旧行为，Task 6 再重做）**

`ChapterBlock` 内所有 `tree.dragChapterId` / `tree.setDragChapterId` 引用替换：

- 章节头 `onDragOver`：`if (tree.drag?.kind !== "chapter" || tree.drag.id === chapter.id) return;`
- 章节头 `onDrop`：

```tsx
onDrop={(event) => {
  event.preventDefault();
  setDropHover(false);
  const dragged = tree.drag;
  tree.setDrag(null);
  if (dragged?.kind === "chapter" && dragged.id !== chapter.id) void tree.nestChapter(dragged.id, chapter.id);
}}
```

- `chapterGrip` 的 `onDragStart` / `onDragEnd`：

```tsx
onDragEnd={() => tree.setDrag(null)}
onDragStart={(event) => {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", chapter.title);
  tree.setDrag({ kind: "chapter", id: chapter.id, title: chapter.title, subtreeIds: [], height: 1 });
}}
```

（`subtreeIds`/`height` 此处先占位，Task 6 填真值。`setData` 是 Firefox 发起拖拽的必要条件，现状缺失，顺手补上。）

- [ ] **Step 3: 重做知识点行拖拽**

`ChapterBlock` 内：

1. 删掉 `const [dragId, setDragId] = useState...`、`const [overId, setOverId] = useState...`，替换为：

```ts
const [pointDrop, setPointDrop] = useState<{ id: string; edge: "before" | "after" } | null>(null);
const [headDrop, setHeadDrop] = useState(false);
const [zoneDrop, setZoneDrop] = useState(false);
```

2. 删掉 `dropOn` 函数（`applyOrder` 保留——上移/下移按钮和键盘仍走 `reorderPointsAction`）。

3. 知识点行的外层 div 整体替换为（注意 `dragOver` 类名换成 `dropBefore`/`dropAfter`）：

```tsx
<div
  className={
    pointDrop?.id === point.id
      ? `pointDragWrap ${pointDrop.edge === "before" ? "dropBefore" : "dropAfter"}`
      : "pointDragWrap"
  }
  key={point.id}
  onDragLeave={
    draggable
      ? () => setPointDrop((current) => (current?.id === point.id ? null : current))
      : undefined
  }
  onDragOver={
    draggable
      ? (event) => {
          if (tree.drag?.kind !== "point" || tree.drag.id === point.id) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const edge = edgeFromEvent(event, "half");
          setPointDrop((current) =>
            current?.id === point.id && current.edge === edge ? current : { id: point.id, edge },
          );
        }
      : undefined
  }
  onDrop={
    draggable
      ? (event) => {
          event.preventDefault();
          const dragged = tree.drag;
          const edge = edgeFromEvent(event, "half");
          setPointDrop(null);
          tree.setDrag(null);
          if (dragged?.kind !== "point" || dragged.id === point.id) return;
          const ids = sortedPoints.map((item) => item.id).filter((id) => id !== dragged.id);
          const position = ids.indexOf(point.id) + (edge === "after" ? 1 : 0);
          void tree.movePointTo(dragged.id, chapter.id, position);
        }
      : undefined
  }
>
```

4. 拖拽手柄 `pointDragHandle` 的拖拽事件替换为（键盘 onKeyDown 分支保持不动）：

```tsx
draggable={!reordering && !tree.treeBusy}
onDragEnd={() => {
  tree.setDrag(null);
  setPointDrop(null);
}}
onDragStart={(event) => {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", point.title);
  attachDragCard(event, point.title);
  tree.setDrag({ kind: "point", id: point.id, chapterId: chapter.id, title: point.title });
}}
```

（原先挂在外层 div 上的 `onDragEnd` 删除——dragend 在拖拽源元素上触发，挂手柄上即可。）

5. 章节头接收知识点投放（追加到本章末尾）。章节头 div 的三个拖拽 handler 扩展为同时处理两种负载（本步先加 point 分支，chapter 分支沿用 Step 2 的旧逻辑）：

```tsx
onDragOver={(event) => {
  if (tree.drag?.kind === "point") {
    if (tree.drag.chapterId === chapter.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setHeadDrop(true);
    return;
  }
  if (tree.drag?.kind !== "chapter" || tree.drag.id === chapter.id) return;
  event.preventDefault();
  setDropHover(true);
}}
onDragLeave={() => {
  setHeadDrop(false);
  setDropHover(false);
}}
onDrop={(event) => {
  event.preventDefault();
  setHeadDrop(false);
  setDropHover(false);
  const dragged = tree.drag;
  tree.setDrag(null);
  if (dragged?.kind === "point" && dragged.chapterId !== chapter.id) {
    void tree.movePointTo(dragged.id, chapter.id, chapter.points.length);
    return;
  }
  if (dragged?.kind === "chapter" && dragged.id !== chapter.id) void tree.nestChapter(dragged.id, chapter.id);
}}
```

章节头 className 改为：

```tsx
className={`chapterHead${headDrop ? " dropInside" : ""}${dropHover ? " chapterDropTarget" : ""}`}
```

6. 空章节投放区：`pointList` 里的空态段落替换为：

```tsx
{!sortedPoints.length ? (
  tree.drag?.kind === "point" ? (
    <div
      className={zoneDrop ? "pointDropZone dropInside" : "pointDropZone"}
      onDragLeave={() => setZoneDrop(false)}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setZoneDrop(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setZoneDrop(false);
        const dragged = tree.drag;
        tree.setDrag(null);
        if (dragged?.kind === "point") void tree.movePointTo(dragged.id, chapter.id, 0);
      }}
    >
      拖到这里，移入本章
    </div>
  ) : (
    <p className="empty inset">本章还没有知识点。</p>
  )
) : null}
```

- [ ] **Step 4: 指示线与投放区样式**

`src/app/globals.css`：

1. `.pointDragWrap` 规则加一行 `position: relative;`。
2. 删除 `.pointDragWrap.dragOver { ... }` 规则。
3. 在 Task 1 添加的 `body[data-dragging]` 规则之后追加：

```css
/* 插入指示线：::before/::after 一条 2px 圆角线 + 另一侧伪元素做左端小圆点 */
.pointDragWrap.dropBefore::before,
.pointDragWrap.dropAfter::after,
.chapterHead.dropBefore::before,
.chapterHead.dropAfter::after {
  content: "";
  position: absolute;
  left: 8px;
  right: 0;
  height: 2px;
  border-radius: 999px;
  background: var(--accent);
  pointer-events: none;
  z-index: 1;
}

.pointDragWrap.dropBefore::before,
.chapterHead.dropBefore::before {
  top: -1px;
}

.pointDragWrap.dropAfter::after,
.chapterHead.dropAfter::after {
  bottom: -1px;
}

.pointDragWrap.dropBefore::after,
.pointDragWrap.dropAfter::before,
.chapterHead.dropBefore::after,
.chapterHead.dropAfter::before {
  content: "";
  position: absolute;
  left: 0;
  width: 8px;
  height: 8px;
  border: 2px solid var(--accent);
  border-radius: 50%;
  background: var(--surface-raised);
  pointer-events: none;
  z-index: 1;
}

.pointDragWrap.dropBefore::after,
.chapterHead.dropBefore::after {
  top: -4px;
}

.pointDragWrap.dropAfter::before,
.chapterHead.dropAfter::before {
  bottom: -4px;
}

/* 移入目标整块高亮（知识点拖到章节头 / 章节嵌套） */
.chapterHead.dropInside {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
}

/* 空章节投放区 */
.pointDropZone {
  display: grid;
  place-items: center;
  margin: 2px 0 4px;
  padding: 10px;
  border: 1.5px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--quiet);
  font-size: 12px;
}

.pointDropZone.dropInside {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
```

4. `.chapterHead` 规则加一行 `position: relative;`。

- [ ] **Step 5: 验证**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: 全绿

手动验证（`npm run dev` 后打开任一科目页，切到"手动"排序）：

1. 拖知识点手柄：光标旁出现半透明标题卡片（不再是整行截图）。
2. 在行上半/下半移动：指示线在行上方/下方切换，左端有小圆点。
3. 拖到另一章节的行间：指示线出现，松手后知识点移入该章对应位置。
4. 拖到另一章节标题上：标题整块高亮，松手后追加到该章末尾。
5. 拖到空章节："拖到这里，移入本章"虚线区出现并高亮。
6. 松手或按 Esc：指示线与卡片消失，无残留高亮。

- [ ] **Step 6: Commit**

```bash
git add src/components/SubjectWorkbench.tsx src/app/globals.css
git commit -m "feat(dnd): 知识点拖拽指示线、跨章节移动与拖拽卡片"
```

---

### Task 6: 章节拖拽 UI——同级排序 + 嵌套三态

**Files:**
- Modify: `src/components/SubjectWorkbench.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: 子树帮助函数与 siblingIds prop**

`src/components/SubjectWorkbench.tsx`：

1. 在 `countChaptersDeep` 之后加两个模块级帮助函数：

```ts
/** 整棵子树（含根）的 id 列表，用于拖拽时禁止投放到自己内部 */
function subtreeIdsOf(chapter: ChapterWithPoints): string[] {
  return [chapter.id, ...chapter.children.flatMap(subtreeIdsOf)];
}

/** 子树高度（根算 1），用于客户端预判层级上限 */
function subtreeHeightOf(chapter: ChapterWithPoints): number {
  return 1 + chapter.children.reduce((max, child) => Math.max(max, subtreeHeightOf(child)), 0);
}
```

2. `ChapterBlock` 的 props 增加 `siblingIds: string[]`（当前层级按序的全部章节 id，含自己）。三处调用点补传：
   - 聚焦视图单章：`siblingIds={[focusTarget.id]}`
   - 顶层列表：`siblingIds={chapters.map((item) => item.id)}`
   - 子章节递归（文件尾部 `chapter.children.map` 处）：`siblingIds={chapter.children.map((item) => item.id)}`

- [ ] **Step 2: 章节头三态命中**

`ChapterBlock` 内：

1. 删掉 `const [dropHover, setDropHover] = useState(false);`，替换为：

```ts
const [chapterDrop, setChapterDrop] = useState<DropEdge | null>(null);
```

import 区把 `DropEdge`、`ChapterDrag` 类型并入 `@/components/dnd` 的 import：

```ts
import { attachDragCard, edgeFromEvent, type ChapterDrag, type DragPayload, type DropEdge } from "@/components/dnd";
```

2. `ChapterBlock` 内加命中判定函数（放在 `applyOrder` 之前）：

```ts
/** 章节拖拽命中：null = 非法目标（自己/自己的子树/超深） */
function chapterEdgeFor(event: ReactDragEvent<HTMLDivElement>, dragged: ChapterDrag): DropEdge | null {
  if (dragged.id === chapter.id || dragged.subtreeIds.includes(chapter.id)) return null;
  const fitsInside = depth + dragged.height <= MAX_CHAPTER_DEPTH;
  const fitsBeside = depth - 1 + dragged.height <= MAX_CHAPTER_DEPTH;
  let edge = edgeFromEvent(event, fitsInside ? "nest" : "half");
  if (edge !== "inside" && !fitsBeside) edge = fitsInside ? "inside" : null;
  return edge;
}
```

文件顶部 react import 加 `type DragEvent as ReactDragEvent`（即 `import { useEffect, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent } from "react";`）。

3. 章节头三个 handler 的 chapter 分支替换为三态版（point 分支保持 Task 5 形态）：

```tsx
onDragOver={(event) => {
  if (tree.drag?.kind === "point") {
    if (tree.drag.chapterId === chapter.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setHeadDrop(true);
    return;
  }
  if (tree.drag?.kind !== "chapter") return;
  const edge = chapterEdgeFor(event, tree.drag);
  if (!edge) {
    setChapterDrop(null);
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  setChapterDrop((current) => (current === edge ? current : edge));
}}
onDragLeave={() => {
  setHeadDrop(false);
  setChapterDrop(null);
}}
onDrop={(event) => {
  event.preventDefault();
  const dragged = tree.drag;
  setHeadDrop(false);
  setChapterDrop(null);
  tree.setDrag(null);
  if (dragged?.kind === "point") {
    if (dragged.chapterId !== chapter.id) void tree.movePointTo(dragged.id, chapter.id, chapter.points.length);
    return;
  }
  if (dragged?.kind !== "chapter") return;
  const edge = chapterEdgeFor(event, dragged);
  if (!edge) return;
  if (edge === "inside") {
    void tree.moveChapterTo(dragged.id, chapter.id, chapter.children.length);
    return;
  }
  const ids = siblingIds.filter((id) => id !== dragged.id);
  const position = ids.indexOf(chapter.id) + (edge === "after" ? 1 : 0);
  void tree.moveChapterTo(dragged.id, chapter.parent_id, position);
}}
```

4. 章节头 className 改为：

```tsx
className={`chapterHead${
  headDrop || chapterDrop === "inside" ? " dropInside" : ""
}${chapterDrop === "before" ? " dropBefore" : ""}${chapterDrop === "after" ? " dropAfter" : ""}`}
```

5. `chapterGrip` 的 `onDragStart` 填真实负载并加拖拽卡片：

```tsx
onDragStart={(event) => {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", chapter.title);
  attachDragCard(event, chapter.title, `${deepPoints} 个知识点`);
  tree.setDrag({
    kind: "chapter",
    id: chapter.id,
    title: chapter.title,
    subtreeIds: subtreeIdsOf(chapter),
    height: subtreeHeightOf(chapter),
  });
}}
```

`aria-label` 同步更新为 `拖拽"${chapter.title}"调整顺序，拖到其他章节标题中部可变为其子章节`。

- [ ] **Step 3: 清理旧样式引用**

`src/app/globals.css` 删除 `.chapterHead.chapterDropTarget { ... }` 规则（已被 `dropInside`/`dropBefore`/`dropAfter` 取代）。确认组件中已无 `chapterDropTarget`、`dragOver` 字符串引用：

Run: `grep -rn "chapterDropTarget\|dragOver\b" src/ --include="*.tsx" --include="*.css"`
Expected: 无输出（React 的 `onDragOver` 属性名不算，grep 词边界已排除）

- [ ] **Step 4: 验证**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: 全绿

手动验证（`npm run dev`）：

1. 拖章节手柄：卡片显示"标题 + N 个知识点"。
2. 悬停另一章节头上/下边缘：出现同级插入指示线；中部：整块高亮（嵌套）。
3. 松手：同级排序 / 嵌套按预期生效，含跨父级移动。
4. 拖到自己的子章节头上：无任何指示线，松手无效果。
5. 8 层深的链上，拖 2 层高的子树到第 7 层章节头中部：不出现嵌套高亮（只给前/后指示线）。
6. 上移/下移/提升一层按钮行为不变。

- [ ] **Step 5: Commit**

```bash
git add src/components/SubjectWorkbench.tsx src/app/globals.css
git commit -m "feat(dnd): 章节拖拽三态——同级任意位置排序与嵌套高亮"
```

---

### Task 7: 全量验证与收尾

**Files:**
- Modify: 无预期改动（有问题就地修）

- [ ] **Step 1: 全量检查**

Run: `npm test && npm run lint && npm run build`
Expected: 三者全绿。任何失败就地修复后重跑。

- [ ] **Step 2: 死代码扫描**

Run: `grep -rn "dragChapterId\|setDragId\|overId\|dropOn\|dropHover" src/`
Expected: 无输出（Task 5/6 已全部移除；有残留则删除后重跑 Step 1）

- [ ] **Step 3: 手动回归清单**

`npm run dev` 后过一遍：

1. 手动排序模式下知识点章内拖拽排序（含首、尾位置）。
2. 知识点跨章节拖拽（行间指示线、章节头高亮、空章节投放区三条路径）。
3. 非手动排序模式：知识点手柄消失/不可拖（现状行为），章节拖拽仍可用。
4. 章节同级排序、跨父级移动、嵌套、非法目标（自己子树、超深）。
5. 键盘：手柄聚焦后方向键上下移动知识点仍工作。
6. 移动端仿真（`@media (hover: none)`）：上移/下移按钮仍在。
7. 切换 `data-skin` 皮肤，指示线/卡片/高亮颜色随 token 变化。

- [ ] **Step 4: Commit（如有修复）**

```bash
git add -A src/
git commit -m "fix(dnd): 拖拽体验收尾修复"
```

---

## Self-Review 记录

- **Spec 覆盖**：拖拽卡片（Task 1/5/6）、指示线（Task 5/6）、章节头三态（Task 6）、空章节投放区（Task 5）、非法目标禁用（Task 6 `chapterEdgeFor` 返回 null → 无 preventDefault → 浏览器显示 not-allowed）、`body[data-dragging]`（Task 1/5）、跨章移动（Task 2/5）、章节任意位置（Task 3/6）、手动模式门控与移动端按钮兜底（沿用现状，Task 7 回归）、token 颜色（Task 1/5 CSS）。✓
- **占位符**：无 TBD/TODO；Task 5 Step 2 的 `subtreeIds: []` 占位在 Task 6 Step 2.5 填真值，属计划内的过渡态且当步可编译。✓
- **类型一致性**：`DragPayload`/`ChapterDrag`/`DropEdge` 定义于 Task 1，Task 5/6 引用同名；`movePointToPosition`/`moveChapterToPosition` repo 签名与 Task 4 action、Task 5 `tree.movePointTo`/`moveChapterTo` 调用一致（index 均为"最终列表位置"语义，Task 5/6 的 drop handler 都先 filter 掉被拖项再取 index）。✓
