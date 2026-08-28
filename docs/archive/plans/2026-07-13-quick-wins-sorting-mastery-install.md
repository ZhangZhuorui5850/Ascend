# 批次一（快赢包）实施计划：知识点排序 / 星标与重要性视觉 / 掌握度手动更新 / 安装入口进设置页

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 知识点支持手动拖拽/时间/重要性三种排序视图，真题星实心化、tier 改为着色徽章，掌握度可在行内滑块直接设置，PWA 安装入口移入设置页并移除自动浮层。

**Architecture:** 沿用现有「server action → repo（better-sqlite3 手写 SQL）→ revalidatePath → 客户端 router.refresh()」模式。排序视图为纯客户端状态（localStorage 按科目记忆），仅手动拖拽落库（批量写 `sort_order`）。PWA 安装事件用模块级 store + `useSyncExternalStore` 跨组件共享。

**Tech Stack:** Next.js 16 App Router、React 19、better-sqlite3、vitest、lucide-react、手写 CSS（`globals.css` + token）。无新依赖。

**对应 spec:** `docs/superpowers/specs/2026-07-13-knowledge-ux-batch-design.md` 批次一。

**背景事实（执行者必读）:**
- 测试库 `createTestDb()`（`src/lib/repo/testing.ts:8`）= `initializeDatabase`（`src/lib/db.ts` 建表）+ `runMigrations`（`src/lib/migrations.ts`）。改表结构时两处都要动：`db.ts` 的 CREATE TABLE 服务全新库，migration 服务存量库。
- SQLite 的 `ALTER TABLE ADD COLUMN` 不允许非常量默认值，所以迁移加 `created_at` 只能用常量默认 + UPDATE 回填。
- migrations 带 checksum 校验，**只能追加新迁移，不能改旧迁移**。当前最后一个是 `0009_user_profile`（`migrations.ts:397`）。
- `updatePoint` 现只接受 title/tier/exam（`src/lib/repo/knowledge.ts:496-517`）。
- 状态派生公式在 `src/lib/repo/reviews.ts:288`（`mastery >= 80 ? "已掌握" : mastery > 0 ? "学习中" : "未学"`）。注意 `applyMistakeOutcome`（`reviews.ts:326`）故意用 `"学习中"` 兜底（错题回炉后即使归零也不算未学），**不要**把它改成共享函数。
- 运行命令：`npm test`（vitest run）、`npm run lint`、`npm run build`。

---

### Task 1: 迁移 — `knowledge_points` 增加 `created_at` 并暴露到查询

**Files:**
- Modify: `src/lib/db.ts:55-69`（CREATE TABLE knowledge_points）
- Modify: `src/lib/migrations.ts:396-411`（追加 0010 迁移）
- Modify: `src/lib/repo/knowledge.ts`（POINT_SELECT、PointRow、createPoint）
- Test: `src/lib/repo/knowledge.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/lib/repo/knowledge.test.ts` 的 `describe("knowledge repo", ...)` 内追加：

```ts
  it("stamps created_at on new points and exposes it in detail queries", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const chapter = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    createPoint(db, legacyScope, { chapterId: chapter.id, title: "知识点 A" });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    const point = detail?.chapters[0]?.points[0];
    expect(point?.created_at).toBeTruthy();
    expect(point?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/repo/knowledge.test.ts`
Expected: FAIL（`created_at` 为 undefined——列存在但 POINT_SELECT 未选出，或列不存在）

- [ ] **Step 3: 实现**

3a. `src/lib/db.ts` CREATE TABLE knowledge_points 的 `next_review TEXT` 一行后加列（逗号注意）：

```sql
      next_review TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
```

3b. `src/lib/migrations.ts` 在 `0009_user_profile` 对象之后、数组闭括号 `];` 之前追加：

```ts
  {
    version: "0010_point_created_at",
    run: (database) => {
      if (!tableExists(database, "knowledge_points")) return;
      addColumnIfMissing(database, "knowledge_points", "created_at", "TEXT NOT NULL DEFAULT ''");
      // 存量行的历史创建时间不可考，统一回填为迁移时刻
      database.exec("UPDATE knowledge_points SET created_at = datetime('now') WHERE created_at = ''");
    },
  },
```

3c. `src/lib/repo/knowledge.ts`：
- `PointRow` 类型（`:28-43`）在 `next_review` 后加 `created_at: string;`
- `POINT_SELECT`（`:124-143`）在 `k.next_review,` 后加一行 `k.created_at,`
- `createPoint` 的 INSERT（`:473-479`）显式写入（迁移库上该列默认是 `''`，不能依赖默认值）：列清单加 `created_at`，VALUES 加 `datetime('now')`：

```sql
    INSERT INTO knowledge_points
      (workspace_id, id, subject_code, subject_name, submodule, tier, tier_name, title,
       exam, status, mastery, reviews, chapter_id, sort_order, created_at)
    VALUES
      (@workspaceId, @id, @subjectCode, @subjectName, @submodule, @tier, @tierName,
       @title, @exam, '未学', 0, 0, @chapterId, @sortOrder, datetime('now'))
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/repo/knowledge.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/migrations.ts src/lib/repo/knowledge.ts src/lib/repo/knowledge.test.ts
git commit -m "feat(knowledge): 知识点增加 created_at 列并暴露到查询"
```

---

### Task 2: repo — `updatePoint` 支持手动掌握度 + 共享状态派生函数

**Files:**
- Create: `src/lib/repo/mastery.ts`
- Modify: `src/lib/repo/knowledge.ts:496-517`（updatePoint）
- Modify: `src/lib/repo/reviews.ts:287-299`（applyReviewOutcome 改用共享函数）
- Test: `src/lib/repo/mastery.test.ts`、`src/lib/repo/knowledge.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `src/lib/repo/mastery.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { clampMastery, deriveStatus } from "./mastery";

describe("mastery helpers", () => {
  it("clamps to 0-100 and rounds", () => {
    expect(clampMastery(-5)).toBe(0);
    expect(clampMastery(160)).toBe(100);
    expect(clampMastery(72.6)).toBe(73);
  });

  it("derives status thresholds", () => {
    expect(deriveStatus(0)).toBe("未学");
    expect(deriveStatus(1)).toBe("学习中");
    expect(deriveStatus(79)).toBe("学习中");
    expect(deriveStatus(80)).toBe("已掌握");
  });
});
```

在 `src/lib/repo/knowledge.test.ts` 追加：

```ts
  it("updates mastery manually and derives status", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);

    updatePoint(db, legacyScope, { id: "kp1", mastery: 85 });
    let row = db.prepare("SELECT mastery, status FROM knowledge_points WHERE id = 'kp1'").get();
    expect(row).toMatchObject({ mastery: 85, status: "已掌握" });

    updatePoint(db, legacyScope, { id: "kp1", mastery: 250 });
    row = db.prepare("SELECT mastery, status FROM knowledge_points WHERE id = 'kp1'").get();
    expect(row).toMatchObject({ mastery: 100, status: "已掌握" });

    updatePoint(db, legacyScope, { id: "kp1", mastery: 0 });
    row = db.prepare("SELECT mastery, status FROM knowledge_points WHERE id = 'kp1'").get();
    expect(row).toMatchObject({ mastery: 0, status: "未学" });

    // 不传 mastery 时不得改动
    updatePoint(db, legacyScope, { id: "kp1", title: "矩阵乘法（改名）" });
    row = db.prepare("SELECT mastery, status FROM knowledge_points WHERE id = 'kp1'").get();
    expect(row).toMatchObject({ mastery: 0, status: "未学" });
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/repo/mastery.test.ts src/lib/repo/knowledge.test.ts`
Expected: FAIL（mastery.ts 不存在；updatePoint 不接受 mastery）

- [ ] **Step 3: 实现**

3a. 新建 `src/lib/repo/mastery.ts`：

```ts
export type PointStatus = "未学" | "学习中" | "已掌握";

export function clampMastery(value: number): number {
  if (!Number.isFinite(value)) throw new Error("掌握度必须是数字");
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** 复习打分与手动编辑共用的状态派生；错题回炉（applyMistakeOutcome）故意不走这里。 */
export function deriveStatus(mastery: number): PointStatus {
  return mastery >= 80 ? "已掌握" : mastery > 0 ? "学习中" : "未学";
}
```

3b. `src/lib/repo/knowledge.ts` 的 `updatePoint` 改为：

```ts
import { clampMastery, deriveStatus } from "./mastery";
// ↑ 加到文件顶部 import 区

export function updatePoint(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { id: string; title?: string; tier?: Tier; exam?: boolean; mastery?: number },
) {
  const point = db.prepare("SELECT * FROM knowledge_points WHERE workspace_id = ? AND id = ?").get(
    scope.workspaceId,
    input.id,
  ) as
    | { id: string; title: string; tier: Tier; exam: number; mastery: number; status: string }
    | undefined;
  if (!point) throw new Error("知识点不存在");
  const title = input.title === undefined ? point.title : input.title.trim();
  if (!title) throw new Error("知识点标题必填");
  const tier: Tier = input.tier && ["r", "y", "g"].includes(input.tier) ? input.tier : point.tier;
  const exam = input.exam === undefined ? point.exam : input.exam ? 1 : 0;
  const mastery = input.mastery === undefined ? point.mastery : clampMastery(input.mastery);
  const status = input.mastery === undefined ? point.status : deriveStatus(mastery);
  db.prepare(`
    UPDATE knowledge_points
    SET title = @title, tier = @tier, tier_name = @tierName, exam = @exam,
        mastery = @mastery, status = @status
    WHERE workspace_id = @workspaceId AND id = @id
  `).run({ workspaceId: scope.workspaceId, id: input.id, title, tier, tierName: TIER_NAMES[tier], exam, mastery, status });
}
```

3c. `src/lib/repo/reviews.ts` 的 `applyReviewOutcome` 中：

```ts
import { deriveStatus } from "./mastery";
// ↑ 加到文件顶部 import 区

// 将
//   const status = mastery >= 80 ? "已掌握" : mastery > 0 ? "学习中" : "未学";
// 替换为
  const status = deriveStatus(mastery);
```

`applyMistakeOutcome` 保持原样不动。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/repo/mastery.test.ts src/lib/repo/knowledge.test.ts src/lib/repo/reviews.test.ts`
Expected: PASS（reviews 既有用例不得回归）

- [ ] **Step 5: Commit**

```bash
git add src/lib/repo/mastery.ts src/lib/repo/mastery.test.ts src/lib/repo/knowledge.ts src/lib/repo/knowledge.test.ts src/lib/repo/reviews.ts
git commit -m "feat(knowledge): updatePoint 支持手动掌握度，状态派生抽为共享函数"
```

---

### Task 3: repo + action — 章节内知识点批量重排

**Files:**
- Modify: `src/lib/repo/knowledge.ts`（新增 reorderPoints）
- Modify: `src/app/actions/knowledge.ts`（新增 reorderPointsAction，updatePointAction 透传 mastery）
- Test: `src/lib/repo/knowledge.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/lib/repo/knowledge.test.ts` 追加（import 区补 `reorderPoints`）：

```ts
  it("reorders points within a chapter transactionally", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const chapter = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    const a = createPoint(db, legacyScope, { chapterId: chapter.id, title: "甲" });
    const b = createPoint(db, legacyScope, { chapterId: chapter.id, title: "乙" });
    const c = createPoint(db, legacyScope, { chapterId: chapter.id, title: "丙" });

    reorderPoints(db, legacyScope, { chapterId: chapter.id, orderedIds: [c.id, a.id, b.id] });

    const detail = getSubjectDetail(db, legacyScope, "M9");
    expect(detail?.chapters[0].points.map((point) => point.title)).toEqual(["丙", "甲", "乙"]);
  });

  it("rejects reorder lists that do not match the chapter", () => {
    const db = createTestDb();
    createSubject(db, legacyScope, { code: "M9", name: "测试科目" });
    const chapter = createChapter(db, legacyScope, { subjectCode: "M9", title: "第一章" });
    const a = createPoint(db, legacyScope, { chapterId: chapter.id, title: "甲" });
    createPoint(db, legacyScope, { chapterId: chapter.id, title: "乙" });

    expect(() => reorderPoints(db, legacyScope, { chapterId: chapter.id, orderedIds: [a.id] })).toThrow();
    expect(() => reorderPoints(db, legacyScope, { chapterId: chapter.id, orderedIds: [a.id, "kp-别人的"] })).toThrow();
  });

  it("scopes reorder to the workspace", () => {
    const db = createTestDb();
    const a = createTestWorkspace(db, { userId: "user-a", email: "a2@example.com" });
    createSubject(db, a, { code: "M9", name: "A 的科目" });
    const chapter = createChapter(db, a, { subjectCode: "M9", title: "第一章" });
    const p1 = createPoint(db, a, { chapterId: chapter.id, title: "甲" });
    const p2 = createPoint(db, a, { chapterId: chapter.id, title: "乙" });

    // 用 legacy workspace 的 scope 去重排 A 的章节：应因为集合不匹配而抛错
    expect(() => reorderPoints(db, legacyScope, { chapterId: chapter.id, orderedIds: [p2.id, p1.id] })).toThrow();
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/repo/knowledge.test.ts`
Expected: FAIL（reorderPoints 未导出）

- [ ] **Step 3: 实现 repo 函数**

`src/lib/repo/knowledge.ts` 在 `deletePoint` 之后加：

```ts
/** 手动拖拽后的整章重排：orderedIds 必须与该章节现有知识点集合完全一致。 */
export function reorderPoints(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { chapterId: string; orderedIds: string[] },
) {
  const chapterId = input.chapterId.trim();
  if (!chapterId) throw new Error("章节必填");
  const existing = db.prepare(
    "SELECT id FROM knowledge_points WHERE workspace_id = ? AND chapter_id = ?",
  ).all(scope.workspaceId, chapterId) as Array<{ id: string }>;
  const existingIds = new Set(existing.map((row) => row.id));
  const unique = new Set(input.orderedIds);
  if (
    unique.size !== input.orderedIds.length
    || existingIds.size !== unique.size
    || !input.orderedIds.every((id) => existingIds.has(id))
  ) {
    throw new Error("排序列表与章节内知识点不一致，请刷新后重试");
  }
  const update = db.prepare("UPDATE knowledge_points SET sort_order = ? WHERE workspace_id = ? AND id = ?");
  const reorder = db.transaction(() => {
    input.orderedIds.forEach((id, index) => update.run(index + 1, scope.workspaceId, id));
  });
  reorder();
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/repo/knowledge.test.ts`
Expected: PASS

- [ ] **Step 5: 实现 actions**

`src/app/actions/knowledge.ts`：import 区补 `reorderPoints`；`updatePointAction` 的 input 类型加 `mastery?: number`（函数体不变，直接透传给 `updatePoint`）；文件尾部前追加：

```ts
export async function reorderPointsAction(input: {
  chapterId: string;
  subjectCode: string;
  orderedIds: string[];
}): Promise<ActionResult> {
  try {
    const access = await requireWorkspace();
    reorderPoints(getDb(), access, { chapterId: input.chapterId, orderedIds: input.orderedIds });
    revalidateKnowledge(input.subjectCode);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/repo/knowledge.ts src/lib/repo/knowledge.test.ts src/app/actions/knowledge.ts
git commit -m "feat(knowledge): 章节内知识点批量重排 repo 与 action"
```

---

### Task 4: 排序视图辅助函数（纯函数 + 测试）

**Files:**
- Create: `src/components/point-sort.ts`
- Test: `src/components/point-sort.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `src/components/point-sort.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import type { PointRow } from "@/lib/repo/knowledge";
import { sortPointsForView } from "./point-sort";

function point(partial: Partial<PointRow> & { id: string }): PointRow {
  return {
    chapter_id: "c1",
    subject_code: "M1",
    title: partial.id,
    tier: "g",
    tier_name: "了解",
    status: "未学",
    mastery: 0,
    exam: 0,
    reviews: 0,
    last_review: null,
    next_review: null,
    created_at: "2026-07-01 00:00:00",
    asset_count: 0,
    mistake_count: 0,
    ...partial,
  } as PointRow;
}

describe("sortPointsForView", () => {
  const manual = [
    point({ id: "a", tier: "g", created_at: "2026-07-02 08:00:00" }),
    point({ id: "b", tier: "r", created_at: "2026-07-01 08:00:00" }),
    point({ id: "c", tier: "y", created_at: "2026-07-03 08:00:00" }),
  ];

  it("manual mode keeps server order and returns the same array", () => {
    expect(sortPointsForView(manual, "manual")).toBe(manual);
  });

  it("time mode sorts newest first without mutating input", () => {
    const sorted = sortPointsForView(manual, "time");
    expect(sorted.map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(manual.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("importance mode sorts r > y > g, stable within tier", () => {
    const sorted = sortPointsForView(manual, "importance");
    expect(sorted.map((p) => p.id)).toEqual(["b", "c", "a"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/components/point-sort.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

新建 `src/components/point-sort.ts`：

```ts
import type { PointRow } from "@/lib/repo/knowledge";

export type PointSortMode = "manual" | "time" | "importance";

export const POINT_SORT_MODES: Array<{ value: PointSortMode; label: string }> = [
  { value: "manual", label: "手动" },
  { value: "time", label: "时间" },
  { value: "importance", label: "重要性" },
];

const TIER_RANK: Record<string, number> = { r: 0, y: 1, g: 2 };

/** 展示层排序：manual 直接沿用服务端 sort_order 顺序；其余模式拷贝后稳定排序。 */
export function sortPointsForView(points: PointRow[], mode: PointSortMode): PointRow[] {
  if (mode === "manual") return points;
  const copy = [...points];
  if (mode === "time") {
    copy.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  } else {
    copy.sort((a, b) => (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9));
  }
  return copy;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/components/point-sort.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/point-sort.ts src/components/point-sort.test.ts
git commit -m "feat(knowledge): 知识点排序视图纯函数"
```

---

### Task 5: UI — 排序切换、拖拽重排、星标实心、tier 徽章、掌握度滑块

**Files:**
- Modify: `src/components/SubjectWorkbench.tsx`
- Modify: `src/app/globals.css:1663-1816` 附近

说明：本任务是纯 UI 改造，无单测（项目对复杂交互组件无既有测试模式），验证靠 Task 7 的实际起服操作。

- [ ] **Step 1: SubjectWorkbench 排序模式状态**

`SubjectWorkbench` 组件（`SubjectWorkbench.tsx:36`）：

```tsx
import { useEffect, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { POINT_SORT_MODES, sortPointsForView, type PointSortMode } from "@/components/point-sort";
import { reorderPointsAction /* 加入现有 import 列表 */ } from "@/app/actions/knowledge";
```

组件体内（`const [error, setError] = useState("");` 之后）：

```tsx
  const [sortMode, setSortMode] = useState<PointSortMode>("manual");
  useEffect(() => {
    const saved = localStorage.getItem(`zgca-point-sort:${subject.code}`);
    if (saved === "manual" || saved === "time" || saved === "importance") setSortMode(saved);
  }, [subject.code]);
  function changeSortMode(mode: PointSortMode) {
    setSortMode(mode);
    localStorage.setItem(`zgca-point-sort:${subject.code}`, mode);
  }
```

`splitTitle` 里 `<h2>章节与知识点</h2>` 之后、`subjectAdmin` 之前插入分段控件：

```tsx
        <div aria-label="知识点排序方式" className="sortModeSwitch" role="group">
          {POINT_SORT_MODES.map((option) => (
            <button
              aria-pressed={sortMode === option.value}
              className={sortMode === option.value ? "active" : undefined}
              key={option.value}
              onClick={() => changeSortMode(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
```

`sortMode` 通过 props 传给每个 `ChapterBlock`（新增 prop `sortMode: PointSortMode`），未分章列表直接用 `sortPointsForView(loosePoints, sortMode)` 渲染（未分章不支持拖拽）。

- [ ] **Step 2: ChapterBlock 内接入排序视图与拖拽**

`ChapterBlock` 增加 props `sortMode: PointSortMode`。把原来的

```tsx
      <div className="pointList">
        {chapter.points.map((point) => (
          <PointLine key={point.id} point={point} report={report} subjectCode={subjectCode} today={today} />
        ))}
        {!chapter.points.length ? <p className="empty inset">本章还没有知识点。</p> : null}
      </div>
```

替换为（组件体内新增 drag 状态）：

```tsx
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const sortedPoints = sortPointsForView(chapter.points, sortMode);
  const draggable = sortMode === "manual";

  async function dropOn(targetId: string) {
    const sourceId = dragId;
    setDragId(null);
    setOverId(null);
    if (!sourceId || sourceId === targetId) return;
    const ids = sortedPoints.map((point) => point.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    report(await reorderPointsAction({ chapterId: chapter.id, subjectCode, orderedIds: ids }));
  }
```

```tsx
      <div className="pointList">
        {sortedPoints.map((point) => (
          <div
            className={overId === point.id && dragId && dragId !== point.id ? "pointDragWrap dragOver" : "pointDragWrap"}
            key={point.id}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(event) => {
              if (!dragId) return;
              event.preventDefault();
              setOverId(point.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              void dropOn(point.id);
            }}
          >
            {draggable ? (
              <span
                aria-label={`拖拽调整“${point.title}”的顺序`}
                className="pointDragHandle"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDragId(point.id);
                }}
                role="button"
              >
                <GripVertical size={13} />
              </span>
            ) : null}
            <PointLine point={point} report={report} subjectCode={subjectCode} today={today} />
          </div>
        ))}
        {!chapter.points.length ? <p className="empty inset">本章还没有知识点。</p> : null}
      </div>
```

`reorderPointsAction` 的 import 与 `sortPointsForView` 已在 Step 1 引入。注意 `SubjectWorkbench` 传递 `sortMode={sortMode}`。

- [ ] **Step 3: PointLine 星标实心 + tier 徽章 + 掌握度滑块**

3a. 星标（`SubjectWorkbench.tsx:342`）：`<Star size={13} />` 改为

```tsx
        <Star fill={point.exam ? "currentColor" : "none"} size={13} />
```

3b. tier 徽章：行容器 `<div className={`pointLine tier-${point.tier}`}>` 改为 `<div className="pointLine">`（左色条移除）；`<select className="tierSelect" ...>` 改为带数据属性的徽章样式（保留原生 select 的可访问性，视觉重做）：

```tsx
      <select
        aria-label="层级"
        className="tierSelect"
        data-tier={point.tier}
        onChange={(event) => void updatePointAction({ id: point.id, tier: event.target.value as Tier, subjectCode }).then(report)}
        value={point.tier}
      >
```

3c. 掌握度滑块：将 `masteryCell`（`:344-347`）替换为独立小组件调用 `<MasteryCell point={point} subjectCode={subjectCode} report={report} />`，并在文件底部新增：

```tsx
function MasteryCell({ point, subjectCode, report }: {
  point: PointRow;
  subjectCode: string;
  report: (result: { ok: boolean; error?: string }) => void;
}) {
  const [value, setValue] = useState(point.mastery);
  useEffect(() => setValue(point.mastery), [point.mastery]);

  function commit() {
    if (value !== point.mastery) {
      void updatePointAction({ id: point.id, mastery: value, subjectCode }).then(report);
    }
  }

  return (
    <div className="masteryCell" title={`掌握度 ${value} · 已复习 ${point.reviews} 次 · 拖动可直接设置`}>
      <input
        aria-label={`设置“${point.title}”的掌握度`}
        className="masteryRange"
        max={100}
        min={0}
        onBlur={commit}
        onChange={(event) => setValue(Number(event.target.value))}
        onKeyUp={(event) => {
          if (event.key === "Enter" || event.key.startsWith("Arrow")) commit();
        }}
        onPointerUp={commit}
        step={5}
        style={{ "--mastery-pct": value } as CSSProperties}
        type="range"
        value={value}
      />
      <small>{value}</small>
    </div>
  );
}
```

- [ ] **Step 4: CSS**

`src/app/globals.css`：

4a. `.pointLine`（`:1663`）删除 `border-left: 3px solid transparent;`；整段删除 `.pointLine.tier-r/.tier-y/.tier-g` 三条规则（`:1739-1749`）。

4b. `.tierSelect`（`:1751`）替换为徽章样式：

```css
.tierSelect {
  appearance: none;
  -webkit-appearance: none;
  padding: 3px 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
}

.tierSelect[data-tier="r"] {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.tierSelect[data-tier="y"] {
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 40%, transparent);
  background: color-mix(in srgb, var(--warn) 12%, transparent);
}

.tierSelect[data-tier="g"] {
  color: var(--ok);
  border-color: color-mix(in srgb, var(--ok) 40%, transparent);
  background: color-mix(in srgb, var(--ok) 12%, transparent);
}
```

4c. `.masteryTrack` 两条规则（`:1803-1816`）替换为滑块样式（保持 130px 列宽下的观感）：

```css
.masteryRange {
  appearance: none;
  -webkit-appearance: none;
  flex: 1;
  min-width: 0;
  height: 5px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--accent) calc(var(--mastery-pct, 0) * 1%),
    var(--line) calc(var(--mastery-pct, 0) * 1%)
  );
  cursor: pointer;
}

.masteryRange::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--line);
}

.masteryRange::-moz-range-thumb {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--line);
}
```

4d. 新增拖拽与排序控件样式（放在 `.pointList` 规则后）：

```css
.pointDragWrap {
  display: flex;
  align-items: stretch;
  gap: 2px;
  border-radius: var(--radius-sm);
}

.pointDragWrap > .pointItem {
  flex: 1;
  min-width: 0;
}

.pointDragWrap.dragOver {
  box-shadow: inset 0 2px 0 var(--accent);
}

.pointDragHandle {
  display: grid;
  place-items: center;
  padding: 0 2px;
  color: var(--quiet);
  cursor: grab;
}

.pointDragHandle:active {
  cursor: grabbing;
}

.sortModeSwitch {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 999px;
  overflow: hidden;
}

.sortModeSwitch button {
  padding: 4px 12px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}

.sortModeSwitch button.active {
  background: var(--accent);
  color: var(--card, #fff);
}
```

注意：`PointLine` 外层原来直接是 `.pointItem`，现在包在 `.pointDragWrap` 里，检查 `.pointItem` 无宽度假设（现状只有 border-radius，安全）。`--card` 若 tokens 中不存在则改用 `var(--surface)`（执行时查 `src/styles/tokens.css` 确认变量名）。

- [ ] **Step 5: 编译与手工冒烟**

Run: `npm run lint && npm run build`
Expected: 双双通过。TypeScript 对 `React.CSSProperties` 自定义属性的强转已用 `as`，不应报错。

- [ ] **Step 6: Commit**

```bash
git add src/components/SubjectWorkbench.tsx src/app/globals.css
git commit -m "feat(knowledge): 排序切换与拖拽、星标实心、tier 徽章、掌握度滑块"
```

---

### Task 6: PWA 安装入口进设置页

**Files:**
- Create: `src/lib/pwa-install.ts`
- Create: `src/components/InstallAppSection.tsx`
- Modify: `src/components/PwaLifecycle.tsx`（移除安装浮层，保留 SW 注册/更新提示/视口同步）
- Modify: `src/app/settings/page.tsx`（新增「应用」分组）
- Modify: `src/app/globals.css`（安装分组小样式）

- [ ] **Step 1: 安装事件 store**

新建 `src/lib/pwa-install.ts`：

```ts
// beforeinstallprompt 只发一次且早于组件挂载，用模块级 store 捕获，
// 供 PwaLifecycle（根布局，保证早期加载）与设置页共享。
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState = {
  canPrompt: boolean;
  installed: boolean;
  ios: boolean;
  supported: boolean;
};

const SERVER_STATE: InstallState = { canPrompt: false, installed: false, ios: false, supported: false };

let promptEvent: InstallPromptEvent | null = null;
let snapshot: InstallState = SERVER_STATE;
const listeners = new Set<() => void>();

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) && /Safari/.test(ua) && !/(CriOS|FxiOS|EdgiOS)/.test(ua);
}

function refresh() {
  snapshot = {
    canPrompt: promptEvent !== null,
    installed: isStandalone(),
    ios: isIosSafari(),
    supported: "onbeforeinstallprompt" in window,
  };
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    promptEvent = event as InstallPromptEvent;
    refresh();
  });
  window.addEventListener("appinstalled", () => {
    promptEvent = null;
    refresh();
  });
  snapshot = {
    canPrompt: false,
    installed: isStandalone(),
    ios: isIosSafari(),
    supported: "onbeforeinstallprompt" in window,
  };
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallSnapshot(): InstallState {
  return snapshot;
}

export function getServerInstallSnapshot(): InstallState {
  return SERVER_STATE;
}

export async function requestInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!promptEvent) return "unavailable";
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  if (choice.outcome === "accepted") {
    promptEvent = null;
    refresh();
  }
  return choice.outcome;
}
```

- [ ] **Step 2: 设置页安装组件**

新建 `src/components/InstallAppSection.tsx`：

```tsx
"use client";

import { useState, useSyncExternalStore } from "react";
import { CheckCircle2, Download, Share } from "lucide-react";
import {
  getInstallSnapshot,
  getServerInstallSnapshot,
  requestInstall,
  subscribeInstall,
} from "@/lib/pwa-install";

export function InstallAppSection() {
  const state = useSyncExternalStore(subscribeInstall, getInstallSnapshot, getServerInstallSnapshot);
  const [message, setMessage] = useState("");

  async function install() {
    setMessage("");
    const outcome = await requestInstall();
    if (outcome === "dismissed") setMessage("已取消。想装的时候随时回来点这里。");
    if (outcome === "unavailable") setMessage("当前浏览器暂未就绪，稍后再试或刷新页面。");
  }

  if (state.installed) {
    return (
      <div className="card installCard">
        <CheckCircle2 aria-hidden size={18} />
        <div>
          <strong>已安装到此设备</strong>
          <p>登峰正以独立应用窗口运行。</p>
        </div>
      </div>
    );
  }

  if (state.ios) {
    return (
      <div className="card installCard">
        <Share aria-hidden size={18} />
        <div>
          <strong>添加到主屏幕</strong>
          <p>在 Safari 里点分享按钮，选择「添加到主屏幕」，即可像 App 一样使用。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card installCard">
      <Download aria-hidden size={18} />
      <div>
        <strong>安装到此设备</strong>
        <p>安装后可在独立窗口使用，支持离线打开。</p>
        {message ? <p className="installHint">{message}</p> : null}
      </div>
      <button className="primaryButton" disabled={!state.canPrompt} onClick={() => void install()} type="button">
        安装
      </button>
    </div>
  );
}
```

`state.supported === false && !state.ios` 时按钮自然处于 disabled（canPrompt false），补一行说明也可：在按钮上方 `{!state.supported && !state.canPrompt ? <p className="installHint">此浏览器不支持一键安装，可尝试 Chrome/Edge。</p> : null}`。

- [ ] **Step 3: 精简 PwaLifecycle**

`src/components/PwaLifecycle.tsx`：
- 顶部加副作用导入：`import "@/lib/pwa-install";`（保证事件早期捕获）。
- 删除：`InstallPromptEvent` 类型、`INSTALL_DISMISSED_AT`、`DISMISS_FOR_MS`、`isStandalone`、`installPrompt`/`showIosHelp` 两个 state、`installDismissedRecently`、注册 `beforeinstallprompt` 的整个 `useEffect`（`:87-102`）、`dismissInstall`、`requestInstall`，以及末尾安装浮层 JSX（`:139-150`）。
- 保留：视口同步 effect、SW 注册与更新 effect、`waitingWorker` 状态、`applyUpdate`、更新提示 aside。
- 组件结尾变为：

```tsx
  if (!waitingWorker) return null;
  return (
    <aside className="pwaNotice pwaUpdate" role="status">
      <RefreshCw aria-hidden size={18} />
      <div><strong>新版本已准备好</strong><span>保存中的内容不受影响；由你决定何时刷新。</span></div>
      <button className="primaryButton" onClick={applyUpdate} type="button">更新</button>
    </aside>
  );
```

- lucide import 收敛为 `import { RefreshCw } from "lucide-react";`。

- [ ] **Step 4: 设置页接入**

`src/app/settings/page.tsx`：
- import：`import { InstallAppSection } from "@/components/InstallAppSection";`
- `settingsTabs` 加 `<a href="#app">应用</a>`（放「设备」之后）。
- 页面末尾（devices section 之后）加：

```tsx
      <section aria-label="应用与安装" className="settingsGroup" id="app">
        <h2 className="settingsGroupTitle">应用</h2>
        <InstallAppSection />
      </section>
```

- [ ] **Step 5: CSS**

`globals.css` 里 `.settingsGroup` 附近追加：

```css
.installCard {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.installCard > svg {
  flex: none;
  margin-top: 2px;
  color: var(--accent);
}

.installCard div {
  flex: 1;
  min-width: 0;
}

.installCard p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.installCard .installHint {
  color: var(--warn);
}
```

- [ ] **Step 6: 编译验证 + Commit**

Run: `npm run lint && npm run build`
Expected: 通过

```bash
git add src/lib/pwa-install.ts src/components/InstallAppSection.tsx src/components/PwaLifecycle.tsx src/app/settings/page.tsx src/app/globals.css
git commit -m "feat(pwa): 安装入口移入设置页，移除自动浮层"
```

---

### Task 7: 全量验证 + 修复 AGENTS.md 悬空引用

**Files:**
- Create: `docs/agent-development-guide.md`
- 全量验证不改代码

- [ ] **Step 1: 补齐 agent 指南**

新建 `docs/agent-development-guide.md`，内容如实描述当前架构（供后续 agent 参考）：

```markdown
# Agent 开发指南（登峰 / zgca-workbench）

## 架构速览
- Next.js 16 App Router + React 19，源码在 `src/`；无 tailwind，样式为 `src/app/globals.css` + `src/styles/tokens.css` CSS 变量（多套 `data-skin` 皮肤，颜色一律走 token）。
- 数据库 better-sqlite3（同步、无 ORM）：建表 `src/lib/db.ts`（服务全新库），版本化迁移 `src/lib/migrations.ts`（服务存量库，带 checksum，只能追加不能改旧迁移）。查询集中在 `src/lib/repo/*.ts` 手写 prepared statements，多租户按 `workspace_id` 隔离。
- 写路径统一：客户端组件 → `src/app/actions/*`（server action，`requireWorkspace()` 鉴权 → repo → `revalidatePath`）→ 客户端 `router.refresh()`。action 一律返回 `{ok, error?}`，不抛错给客户端。

## 测试与验证
- `npm test`（vitest，测试与源码同目录 `*.test.ts`，repo 测试用 `createTestDb()` 内存库跑全量建表+迁移）；`npm run lint`；`npm run build`。三者全绿才算完成。
- 用户生产实例是本机 `next start`（真实数据），改码后需 build + 重启才生效。

## 文档
- 设计 spec：`docs/superpowers/specs/`；实施计划：`docs/superpowers/plans/`；交付报告：`docs/reports/`（报告用 [COMPUTED]/[INFERRED]/[KNOWN] 声明标签标注结论来源）。
```

- [ ] **Step 2: 全量验证**

Run: `npm test && npm run lint && npm run build`
Expected: 测试全过（含本批新增用例）、lint 0 错误、build 成功

- [ ] **Step 3: Commit**

```bash
git add docs/agent-development-guide.md
git commit -m "docs: 补齐 AGENTS.md 引用的 agent 开发指南"
```

- [ ] **Step 4: 起服手工验收（交付给用户前）**

在开发端口起服（不动用户的 3000 生产实例）：

```bash
npm run build && npx next start -p 3100
```

逐项确认：
1. 科目页排序切换（手动/时间/重要性）生效且按科目记忆；手动模式下拖把手重排，刷新后顺序保持。
2. 真题星激活为实心琥珀色；tier 徽章三色区分且换皮肤后仍协调。
3. 拖动掌握度滑块松手后数值落库（刷新验证），状态阈值正确（80 → 已掌握）。
4. 设置页出现「应用」分组；桌面 Chrome/Edge 能弹安装框；首页不再出现自动安装浮层（SW 更新提示仍在）。
5. 提醒用户：生产实例需 `npm run build` 后重启 `next start` 才能生效。
```
