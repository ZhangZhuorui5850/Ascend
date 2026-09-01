import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("navigation continuity", () => {
  it("keeps query-only Tasks navigation inside one mounted workspace", () => {
    const page = read("../app/tasks/page.tsx");
    const workspace = read("./planner/PlannerTasksWorkspace.tsx");
    const sidebar = read("./planner/PlannerSidebar.tsx");

    expect(page).toContain("listTaskViewSource(db, access)");
    expect(workspace).toContain("filterPlannerTaskView(");
    expect(workspace).toContain("window.history.pushState");
    expect(workspace).toContain('window.addEventListener("popstate"');
    expect(workspace).not.toContain("startViewTransition");
    expect(workspace).not.toContain("viewPending");
    expect(workspace).not.toContain("router.refresh()");
    expect(sidebar).not.toContain('from "next/link"');
    expect(sidebar).not.toContain("/tasks?view=");
  });

  it("keeps subject focus and list/map switches local because their data is already loaded", () => {
    const workbench = read("./subject-workbench/SubjectWorkbench.tsx");

    expect(workbench).toContain("setActiveFocusId");
    expect(workbench).toContain("setActiveView");
    expect(workbench).toContain("window.history.pushState");
    expect(workbench).toContain('window.addEventListener("popstate"');
    expect(workbench).not.toContain("startNavigationTransition");
    expect(workbench).not.toContain("navigationPending");
    expect(workbench).not.toContain("router.push(`/subjects/${subject.code}");
  });

  it("keeps filter changes scoped to task results while preserving the inspector", () => {
    const workspace = read("./planner/PlannerTasksWorkspace.tsx");
    const groups = read("./planner/PlannerTaskGroups.tsx");
    const list = read("./planner/PlannerTaskList.tsx");
    const row = read("./planner/PlannerTaskRow.tsx");

    expect(workspace).toContain("const selected = tasks.find");
    expect(workspace).toContain('key={activeListId ? `list:${activeListId}` : `view:${activeView}`}');
    expect(groups).not.toContain("AnimatePresence");
    expect(list).toContain('<AnimatePresence initial={false} mode="popLayout">');
    expect(row).toContain("initial={contract.enter}");
    expect(row).toContain("exit={contract.exit}");
  });

  it("enables the Next 16 React Compiler for stable subtree reuse", () => {
    const nextConfig = read("../../next.config.ts");
    const packageJson = read("../../package.json");

    expect(nextConfig).toContain("reactCompiler: true");
    expect(packageJson).toContain('"babel-plugin-react-compiler"');
  });

  it("keeps cross-page planner navigation on the single nav-switch contract", () => {
    const shell = read("./planner/PlannerShell.tsx");

    expect(shell.match(/transitionTypes=\{\["nav-switch"\]\}/g)).toHaveLength(2);
    expect(shell).not.toContain("nav-forward");
    expect(shell).not.toContain("nav-back");
  });
});
