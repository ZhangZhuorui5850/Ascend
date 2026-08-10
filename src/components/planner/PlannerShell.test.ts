import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync(new URL("./PlannerShell.tsx", import.meta.url), "utf8");
const tasks = readFileSync(new URL("../../app/tasks/page.tsx", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../../app/calendar/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../styles/planner/shell.module.css", import.meta.url), "utf8");

describe("shared Planner shell", () => {
  it("owns the single Plan heading and stable task/calendar views", () => {
    expect(shell).toContain("<h1>计划</h1>");
    expect(shell).toContain('href="/tasks"');
    expect(shell).toContain('href="/calendar"');
    expect(shell).toContain('aria-current={active === "tasks"');
    expect(shell).toContain('aria-current={active === "calendar"');
  });

  it("wraps both stable routes without duplicating h1", () => {
    expect(tasks).toContain('<PlannerShell\n      active="tasks"');
    expect(calendar).toContain('<PlannerShell\n      active="calendar"');
    expect(tasks).not.toContain("<h1>");
    expect(calendar).not.toContain("<h1>");
  });

  it("provides mobile-safe 44px view controls", () => {
    expect(styles).toMatch(/\.views a[\s\S]*min-height:\s*44px/);
    expect(styles).toContain("@media (max-width: 600px)");
  });
});
