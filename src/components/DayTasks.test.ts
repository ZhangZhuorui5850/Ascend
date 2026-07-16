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
  it("uses a multiline editor while keeping task controls in one centered row", () => {
    expect(source).toContain("<textarea");
    expect(source).toContain("resizeTitle(titleRef.current)");
    expect(styles).toMatch(/grid-template-areas:\s*"check title subject delete"/s);
    expect(styles).toMatch(/\.dayTasks \.taskLine\s*\{[^}]*align-items:\s*center;/s);
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

  it("persists completion without refreshing the current route", () => {
    expect(plannerActions).toContain('import { refresh } from "next/cache"');
    expect(plannerActions).not.toContain("revalidatePath");
    expect(toggleActionSource).not.toContain("refresh()");
    expect(source).not.toContain("router.refresh()");
  });
});
