import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DayTasks.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const plannerActions = readFileSync(new URL("../app/actions/planner.ts", import.meta.url), "utf8");
const toggleActionSource = plannerActions.slice(
  plannerActions.indexOf("export async function toggleTaskAction"),
  plannerActions.indexOf("export async function updateTaskAction"),
);

describe("TaskLine completion presentation", () => {
  it("uses the optimistic done value for the checkbox state, label, and icon", () => {
    expect(source).toContain("aria-checked={done}");
    expect(source).toContain('aria-label={done ? "标记为未完成" : "标记为完成"}');
    expect(source).toContain("{done ? <Check size={13} /> : null}");
  });
});

describe("task-row spacing", () => {
  it("uses a multiline editor and has no stale pre-taskLineMain mobile grid hacks", () => {
    expect(source).toContain("<textarea");
    expect(source).toContain("resizeTitle(titleRef.current)");
    // 旧版直接把 .taskLine 当 grid 布局的移动端规则会把新 .taskLineMain 结构挤坏——不允许回归
    expect(styles).not.toMatch(/grid-template-areas:\s*"check title subject delete"/s);
    expect(styles).not.toContain(".dayTasks .taskSubject");
  });

  it("keeps the row minimal: single detail-settings entry, meta chips only when marked", () => {
    expect(source).toContain("TaskMetaRow");
    expect(source).toContain("task.priority !== 2");
    expect(source).toContain("task.estimated_minutes !== 30");
    expect(source).toContain('aria-label="任务详细设置"');
    // 科目改到详情面板里编辑，行内不再放下拉框
    expect(source).not.toContain('className={task.subject_code ? "taskSubject tagged" : "taskSubject"}');
  });

  it("centers the checkbox icon with place-items instead of manual nudges", () => {
    expect(styles).toMatch(/\.taskCheck\s*\{[^}]*padding:\s*0;/s);
    expect(styles).toMatch(/\.taskCheck\s*\{[^}]*place-items:\s*center;/s);
    // 曾用 left/top -0.5px 手调，反而把对勾推离中心——不允许回归
    expect(styles).not.toMatch(/\.taskCheck svg\s*\{[^}]*(left|top):/s);
  });
});

describe("optimistic toggle wiring", () => {
  it("uses page-level completion state and rolls back on failure", () => {
    expect(source).toContain("completionOverrides");
    expect(source).toContain("displayTasks");
    expect(source).toContain("onCompletionChange(task.id, nextDone)");
    expect(source).toContain("onCompletionChange(task.id, done)");
    expect(source).not.toContain("router.refresh()");
  });

  it("routes failures to the global toast instead of inline formError", () => {
    expect(source).toContain('notify(result.error || "操作失败", "error")');
    expect(source).not.toContain("formError");
  });

  it("persists writes via revalidatePath, never refresh()", () => {
    // Next 16.2 软导航页面会丢弃 refresh() 的 RSC 回流（见 docs/agent-development-guide.md）
    expect(plannerActions).toContain('import { revalidatePath } from "next/cache"');
    expect(plannerActions).not.toContain("import { refresh");
    expect(plannerActions).toContain("function revalidateTaskViews");
    expect(toggleActionSource).toContain("revalidateTaskViews(input.day)");
    expect(source).not.toContain("router.refresh()");
  });
});

describe("optimistic task insertion", () => {
  it("inserts a pending row inside a transition and mirrors server ordering", () => {
    expect(source).toContain("useOptimistic(");
    expect(source).toContain("startTransition(");
    expect(source).toContain("sortDayTasks(");
    expect(source).toContain("data-entering");
    expect(source).toContain("data-leaving");
    expect(source).toContain("draftOrderRef.current++");
    expect(source).toContain("taskClientKeysRef.current.set(task.id, draft.clientKey!)");
    expect(source).toContain("onAnimationEnd");
    expect(source).toContain("exitingTasks");
    expect(plannerActions).toContain("return { ok: true, task }");
    // 输入框在 transition 外立即清空,回车手感零等待
    expect(source).toMatch(/setTitle\(""\);\s*startTransition\(/);
  });

  it("starts refresh-backed mutations directly inside an event transition", () => {
    expect(source).not.toContain(".then(report)");
    expect(source).toContain("report(await action())");
    expect(source).toContain("report(await updateTaskAction(input))");
  });

  it("keeps enter/exit animations on motion tokens, exit faster than enter", () => {
    expect(styles).toContain("@keyframes taskRiseIn");
    expect(styles).toContain("@keyframes taskFallOut");
    expect(styles).toMatch(/\.taskLine\[data-entering\],[^{]*\{[^}]*var\(--motion-quick\)[^}]*var\(--motion-ease-enter\)/s);
    expect(styles).toMatch(/\.taskLine\[data-leaving\],[^{]*\{[^}]*var\(--motion-fast\)[^}]*var\(--motion-ease-exit\)/s);
  });
});
