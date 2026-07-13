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

  it("optically centers the checkbox icon without changing the row gap", () => {
    expect(styles).toMatch(/\.taskCheck\s*\{[^}]*padding:\s*0;/s);
    expect(styles).toMatch(/\.taskCheck svg\s*\{[^}]*left:\s*-0\.5px;[^}]*top:\s*-0\.5px;/s);
  });
});
