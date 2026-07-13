import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DayTasks.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

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
