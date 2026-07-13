# 批次二（乐观更新）实施计划：useOptimisticValue + 失败回滚 + 全局错误 toast

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 高频操作界面先响应、后台提交，失败自动回滚并弹全局错误 toast；把 DayTasks 的 ad-hoc 乐观勾选收编为共享 hook。

**Architecture:** 新增客户端 hook `useOptimisticValue<T>`（本地覆盖值 + 渲染期与服务端值对账，模式取自 DayTasks.TaskLine 现有实现并加注释说明）。失败反馈复用既有 `FeedbackProvider.notify(message, "error")`（根布局已挂 toastViewport），组件内联 formError 移除。server action 协议与服务端零改动。

**Tech Stack:** React 19（render-time state reconciliation）、既有 FeedbackProvider。无新依赖。

**对应 spec:** `docs/superpowers/specs/2026-07-13-knowledge-ux-batch-design.md` 批次二（已按现状修订：toast 复用既有设施）。

**背景事实（执行者必读）:**
- `src/components/FeedbackProvider.tsx` 已提供 `useFeedback()` → `notify(message, kind)`（kind: "success"|"error"|"info"）与 `confirm()`；根布局已包 Provider。SubjectWorkbench/DayTasks 已在用 confirm/notify。
- `src/components/DayTasks.tsx` 的 TaskLine（:148-171）已有乐观勾选雏形：`optimisticDone` + `confirmedDone` 渲染期对账。本批把该模式抽成 hook 后收编。
- 组件测试惯例是**源码断言**（见 `src/components/DayTasks.test.ts`：readFileSync 读源码 + expect(source).toContain(...)），项目无 @testing-library/react，不要引入。
- `DayTasks.test.ts:9-11` 断言 `aria-checked={done}` 等字符串——重构时保持变量名 `done` 与这三处 JSX 字面量不变，否则先改测试（不允许，见任务说明）。
- SubjectWorkbench（批次一后）:PointLine 的 tier `<select data-tier>`、examStar、MasteryCell（savingRef/queuedRef 串行化 + try/catch/finally）。MasteryCell 失败时目前**保留**用户本地值，本批改为回滚到服务端值。
- 批次一模式：网络 reject 必须 catch（server action 网络失败会 reject 而非返回 {ok:false}），守卫标志在 finally 复位。
- 运行命令：`npm test`、`npm run lint`、`npm run build`。

---

### Task 1: `useOptimisticValue` hook + 源码断言测试

**Files:**
- Create: `src/components/useOptimisticValue.ts`
- Test: `src/components/useOptimisticValue.test.ts`

- [ ] **Step 1: 写失败测试** — 新建 `src/components/useOptimisticValue.test.ts`：

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./useOptimisticValue.ts", import.meta.url), "utf8");

describe("useOptimisticValue contract", () => {
  it("clears the local override during render once the server value catches up", () => {
    expect(source).toContain("if (!Object.is(confirmed, serverValue))");
    expect(source).toContain("setConfirmed(serverValue)");
    expect(source).toContain("setOverride(null)");
  });

  it("wraps the override in an object so falsy values stay distinguishable", () => {
    expect(source).toContain("useState<{ value: T } | null>(null)");
    expect(source).toContain("override ? override.value : serverValue");
  });

  it("exposes value / apply / rollback", () => {
    expect(source).toMatch(/apply:/);
    expect(source).toMatch(/rollback:/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/components/useOptimisticValue.test.ts`
Expected: FAIL（文件不存在）

- [ ] **Step 3: 实现** — 新建 `src/components/useOptimisticValue.ts`：

```ts
"use client";

import { useState } from "react";

/**
 * 乐观值：apply() 立即生效本地覆盖，server action 成功后 router.refresh() 送来
 * 新的服务端值时在渲染期自动清除覆盖；失败时调用 rollback() 立刻还原。
 * 渲染期 setState 对账是 React 支持的同组件模式（避免 effect 级联渲染），
 * 取自 DayTasks.TaskLine 的既有实现。覆盖值包在对象里以兼容 falsy 值。
 */
export function useOptimisticValue<T>(serverValue: T): {
  value: T;
  apply: (next: T) => void;
  rollback: () => void;
} {
  const [override, setOverride] = useState<{ value: T } | null>(null);
  const [confirmed, setConfirmed] = useState(serverValue);
  if (!Object.is(confirmed, serverValue)) {
    setConfirmed(serverValue);
    setOverride(null);
  }
  return {
    value: override ? override.value : serverValue,
    apply: (next: T) => setOverride({ value: next }),
    rollback: () => setOverride(null),
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/components/useOptimisticValue.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/useOptimisticValue.ts src/components/useOptimisticValue.test.ts
git commit -m "feat(ux): useOptimisticValue 乐观值 hook"
```

---

### Task 2: DayTasks 收编 + 失败走全局 toast

**Files:**
- Modify: `src/components/DayTasks.tsx`
- Test: `src/components/DayTasks.test.ts`（如需，只允许新增断言，不许放松既有断言）

- [ ] **Step 1: TaskLine 收编到 hook**

`TaskLine` 中删除 `optimisticDone`/`confirmedDone` 两个 state 及渲染期对账代码（:149-157），改为：

```tsx
import { useOptimisticValue } from "@/components/useOptimisticValue";

  const { value: done, apply, rollback } = useOptimisticValue(Boolean(task.done));
```

`toggle()` 改为（注意 catch/finally，网络 reject 也要回滚）：

```tsx
  async function toggle() {
    if (pending) return;
    setPending(true);
    apply(!done);
    try {
      const result = await toggleTaskAction({ id: task.id, day, done: !done });
      if (!result.ok) rollback();
      report(result);
    } catch {
      rollback();
      report({ ok: false, error: "网络异常，操作未保存" });
    } finally {
      setPending(false);
    }
  }
```

保持变量名 `done` 不变——`DayTasks.test.ts` 的三条 JSX 源码断言（aria-checked={done} 等）必须原样通过。

- [ ] **Step 2: 失败反馈改 toast**

`DayTasks` 组件：
- 引入 `useFeedback`（文件尚未导入：`import { useFeedback } from "@/components/FeedbackProvider";`，组件内 `const { notify } = useFeedback();`）。
- `report()` 改为：

```tsx
  function report(result: { ok: boolean; error?: string }) {
    if (result.ok) router.refresh();
    else notify(result.error || "操作失败", "error");
  }
```

- 删除 `error` state 与 `{error ? <p className="formError">{error}</p> : null}`。

- [ ] **Step 3: 更新源码断言测试**

在 `DayTasks.test.ts` 追加一个 describe（不动既有断言）：

```ts
describe("optimistic toggle wiring", () => {
  it("uses the shared optimistic hook and rolls back on failure", () => {
    expect(source).toContain('from "@/components/useOptimisticValue"');
    expect(source).toContain("useOptimisticValue(Boolean(task.done))");
    expect(source).toContain("rollback()");
    expect(source).not.toContain("optimisticDone");
  });

  it("routes failures to the global toast instead of inline formError", () => {
    expect(source).toContain('notify(result.error || "操作失败", "error")');
    expect(source).not.toContain("formError");
  });
});
```

- [ ] **Step 4: 验证**

Run: `npx vitest run src/components/DayTasks.test.ts && npm run lint && npm run build`
Expected: 全过

- [ ] **Step 5: Commit**

```bash
git add src/components/DayTasks.tsx src/components/DayTasks.test.ts
git commit -m "feat(ux): 任务勾选收编共享乐观 hook，失败走全局 toast"
```

---

### Task 3: SubjectWorkbench 高频操作乐观化

**Files:**
- Modify: `src/components/SubjectWorkbench.tsx`

- [ ] **Step 1: report 改 toast**

`SubjectWorkbench` 顶层组件已有 `const { confirm, notify } = useFeedback();`。`report()` 改为：

```tsx
  function report(result: { ok: boolean; error?: string }) {
    if (result.ok) router.refresh();
    else notify(result.error || "操作失败", "error");
  }
```

删除 `error` state 与 `{error ? <p className="formError">{error}</p> : null}`；`removeSubject` 的 `setError(...)` 分支改为 `notify(result.error || "删除失败", "error")`。

- [ ] **Step 2: PointLine tier 与星标乐观化**

`PointLine` 内：

```tsx
import { useOptimisticValue } from "@/components/useOptimisticValue";

  const tierView = useOptimisticValue<Tier>(point.tier);
  const examView = useOptimisticValue<boolean>(Boolean(point.exam));

  async function changeTier(next: Tier) {
    tierView.apply(next);
    try {
      const result = await updatePointAction({ id: point.id, tier: next, subjectCode });
      if (!result.ok) tierView.rollback();
      report(result);
    } catch {
      tierView.rollback();
      report({ ok: false, error: "网络异常，层级未保存" });
    }
  }

  async function toggleExam() {
    const next = !examView.value;
    examView.apply(next);
    try {
      const result = await updatePointAction({ id: point.id, exam: next, subjectCode });
      if (!result.ok) examView.rollback();
      report(result);
    } catch {
      examView.rollback();
      report({ ok: false, error: "网络异常，星标未保存" });
    }
  }
```

JSX 改造：
- tier select：`value={tierView.value}`、`data-tier={tierView.value}`、`onChange={(event) => void changeTier(event.target.value as Tier)}`。
- 星标按钮：`className={examView.value ? "examStar active" : "examStar"}`、`aria-label`/`title`/`fill` 全部改用 `examView.value`、`onClick={() => void toggleExam()}`。

- [ ] **Step 3: MasteryCell 失败回滚**

`MasteryCell.send()` 现有 try/catch/finally 结构中：
- `{ok:false}` 分支（`result.ok === false` 时）与 catch 分支都要把本地 value 回滚到服务端值：`setValue(point.mastery)`，同时 `queuedRef.current = null`（catch 已有）。
- 具体：await 结果后、链式排队检查之前，加 `if (!result.ok) { queuedRef.current = null; setValue(point.mastery); }`；catch 里在既有清理后加 `setValue(point.mastery)`。
- 滑块本身立即跟手（本地 value onChange 已是乐观显示），这一步只补失败回滚语义。

- [ ] **Step 4: 章节改名/标题失败提示核对**

`renameChapterAction`/`updatePointAction`（title onBlur）已走 report → 现在自动获得 toast。不做输入框强制回滚（uncontrolled input 保留用户输入，服务端值在 refresh 后经 key 重置）——spec 已明确此边界。确认无遗漏的 setError 引用即可。

- [ ] **Step 5: 验证**

Run: `npm test && npm run lint && npm run build`
Expected: 全过（SubjectWorkbench 无专属测试文件，靠全量回归 + build）

- [ ] **Step 6: Commit**

```bash
git add src/components/SubjectWorkbench.tsx
git commit -m "feat(ux): 知识点 tier/星标/掌握度乐观更新与失败回滚"
```

---

### Task 4: 全量验证 + 起服冒烟

**Files:** 无代码改动（冒烟脚本放 scratchpad，不入库）

- [ ] **Step 1: 全量验证**

Run: `npm test && npm run lint && npm run build`
Expected: 全绿

- [ ] **Step 2: 起服冒烟（隔离库，3100 端口）**

复用批次一模式：`ZGCA_DATA_ROOT` 指向 scratchpad 临时目录，`APP_LOGIN_EMAIL`/`APP_LOGIN_PASSWORD` bootstrap 登录，`npx next start -p 3100`，playwright 无头验证。**严禁触碰真实 data/ 目录与 3000 端口实例。**

验证点：
1. 任务勾选：点击后勾选态立即翻转（不等网络）；`page.route` 拦截并 abort 对应 POST 后再点击 → 勾选态回滚 + 出现 `.toast-error`。
2. tier 徽章：改选后 `data-tier` 立即变化；abort 网络后改选 → 回滚 + toast。
3. 星标：同上（fill 立即变化，失败回滚）。
4. 掌握度滑块：设值成功落库（刷新保持）；abort 网络后设值 → 滑块回到服务端值 + toast。
5. 内联 formError 段落不再出现在 DayTasks / SubjectWorkbench DOM 中。

结束后杀 3100 进程、删临时库。无法自动化的点如实标 SKIPPED。

- [ ] **Step 3: 报告**

每个验证点 PASS/FAIL/SKIPPED(原因)。

## 交付后

合并 main 后提醒用户：生产实例（localhost:3000 next start）需 `npm run build` + 重启才生效。
