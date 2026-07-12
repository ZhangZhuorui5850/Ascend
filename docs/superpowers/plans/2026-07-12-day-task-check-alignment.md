# 今日任务勾选对齐修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the doubled horizontal space before task titles and keep a task checkbox's visual and ARIA state consistent during optimistic completion updates.

**Architecture:** Keep the existing `TaskLine` component and global task-row styles. Use its already-computed `done` value for every completed-state output, and remove only the title input's horizontal padding so the grid's existing gap is the single source of horizontal spacing.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest 4, CSS.

## Global Constraints

- Preserve the 8px `.taskLine` grid gap, the existing checkbox dimensions, and the hover/focus styling.
- Do not change deletion controls, subject tags, task-row height, or any other list styles.
- No new runtime dependencies.

---

### Task 1: Cover and implement consistent completion presentation

**Files:**
- Create: `src/components/DayTasks.test.ts`
- Modify: `src/components/DayTasks.tsx:169-180`

**Interfaces:**
- Consumes: `done: boolean`, the local completion value calculated by `TaskLine`.
- Produces: `aria-checked`, `aria-label`, and the `<Check>` element from the same completion value.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DayTasks.tsx", import.meta.url), "utf8");

describe("TaskLine completion presentation", () => {
  it("uses the optimistic done value for the checkbox state, label, and icon", () => {
    expect(source).toContain("aria-checked={done}");
    expect(source).toContain('aria-label={done ? "标记为未完成" : "标记为完成"}');
    expect(source).toContain("{done ? <Check size={13} /> : null}");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/DayTasks.test.ts`

Expected: FAIL because `TaskLine` still reads `task.done` for at least one checkbox output.

- [ ] **Step 3: Write minimal implementation**

```tsx
<button
  aria-checked={done}
  aria-label={done ? "标记为未完成" : "标记为完成"}
  className="taskCheck"
  disabled={pending}
  onClick={() => void toggle()}
  role="checkbox"
  type="button"
>
  {done ? <Check size={13} /> : null}
</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/DayTasks.test.ts`

Expected: PASS with one completed test.

- [ ] **Step 5: Commit**

```bash
git add src/components/DayTasks.tsx src/components/DayTasks.test.ts
git commit -m "fix(tasks): keep checkbox state in sync"
```

### Task 2: Cover and implement one source of horizontal task-row spacing

**Files:**
- Modify: `src/components/DayTasks.test.ts`
- Modify: `src/app/globals.css:1118-1126`

**Interfaces:**
- Consumes: `.taskLine` grid `gap: 8px`.
- Produces: `.taskTitle` with `padding: 6px 0`, leaving its vertical hit area and focus border intact.

- [ ] **Step 1: Write the failing test**

Append this assertion to `src/components/DayTasks.test.ts`:

```ts
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("task-row spacing", () => {
  it("does not add title-side padding to the existing grid gap", () => {
    expect(styles).toMatch(/\.taskTitle\s*\{[^}]*padding:\s*6px 0;/s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/DayTasks.test.ts`

Expected: FAIL because `.taskTitle` currently declares `padding: 6px 8px`.

- [ ] **Step 3: Write minimal implementation**

```css
.taskTitle {
  min-width: 0;
  padding: 6px 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 14px;
}
```

- [ ] **Step 4: Run test and production checks**

Run: `npm test -- src/components/DayTasks.test.ts && npm run lint && npm run build`

Expected: the focused test, lint, and production build all exit successfully.

- [ ] **Step 5: Verify the rendered geometry**

Run a headless Playwright check against the local app with a fixture task and assert that the title input's left edge begins exactly one grid gap after the checkbox, while the visible task text begins with no additional horizontal padding. Then toggle the task once and assert its checkbox has `aria-checked="true"` and contains an SVG.

Expected: one 8px structural gap; no extra 8px title-side gap; icon and ARIA state agree after the optimistic toggle.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/components/DayTasks.test.ts
git commit -m "fix(tasks): align completed task check"
```
