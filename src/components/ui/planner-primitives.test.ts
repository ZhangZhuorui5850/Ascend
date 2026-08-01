import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findPlannerMotionLiteralViolations } from "@/components/planner/planner-view-model";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("Planner shared interaction primitives", () => {
  it("provides a small Motion boundary with runtime reduced-motion semantics", () => {
    const source = read("./MotionProvider.tsx");
    const tasks = read("../planner/PlannerTasksWorkspace.tsx");
    const calendar = read("../calendar/CalendarWorkspace.tsx");
    expect(source).toContain('from "motion/react"');
    expect(source).toContain("LazyMotion");
    expect(source).toContain("domAnimation");
    expect(source).toContain("reducedMotion={preference}");
    expect(source).toContain('data-motion-provider={preference}');
    expect(source).toContain("MotionReducedContext");
    expect(source).toContain("MutationObserver");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(tasks).toContain("<MotionProvider>");
    expect(calendar).toContain("<MotionProvider>");
  });

  it("wraps Base UI Drawer anatomy, focus return, snap points, and virtual keyboard support", () => {
    const source = read("./PlannerDrawer.tsx");
    expect(source).toContain('from "@base-ui/react/drawer"');
    expect(source).toContain("Drawer.VirtualKeyboardProvider");
    expect(source).toContain("snapPoints");
    expect(source).toContain("finalFocus");
    expect(source).toContain('data-planner-surface={surface}');
    expect(source).toContain("<Drawer.Backdrop className={styles.backdrop} data-planner-backdrop />");
    expect(source.match(/data-planner-backdrop/g)).toHaveLength(1);
  });

  it("uses Base UI for popover, collapsible, toast, and destructive confirmation", () => {
    expect(read("./PlannerPopover.tsx")).toContain('from "@base-ui/react/popover"');
    expect(read("./PlannerCollapsible.tsx")).toContain('from "@base-ui/react/collapsible"');
    const toast = read("./PlannerToast.tsx");
    expect(toast).toContain('from "@base-ui/react/toast"');
    expect(toast).toContain("undo");
    expect(read("../FeedbackProvider.tsx")).toContain('from "@base-ui/react/dialog"');
  });

  it("exposes segmented control and mutation status with accessible semantics", () => {
    const segmented = read("./PlannerSegmentedControl.tsx");
    const status = read("./PlannerStatusIndicator.tsx");
    expect(segmented).toContain('role="tablist"');
    expect(segmented).toContain("aria-selected");
    expect(status).toContain('aria-live={assertive ? "assertive" : "polite"}');
    expect(status).toContain("restored");
    expect(status).toContain("conflict");
  });

  it("keeps property controls quiet until interaction and allows field variants", () => {
    const fields = read("./PlannerFormFields.tsx");
    const primitives = read("../../styles/planner/primitives.module.css");
    expect(fields).toContain("className?: string");
    expect(fields).toContain('`${styles.field} ${className ?? ""}`.trim()');
    expect(primitives).toMatch(/\.propertyRow input,[\s\S]*?border: 1px solid transparent;[\s\S]*?background: transparent;/);
    expect(primitives).toMatch(/\.dateTimeField\s*\{[\s\S]*?border: 1px solid transparent;[\s\S]*?background: transparent;/);
    expect(primitives).toContain(".dateTimeField:hover");
    expect(primitives).toContain("background: var(--planner-field-hover)");
    expect(primitives).toContain("background: var(--planner-field-focus)");
  });

  it("keeps primitive motion CSS on project tokens", () => {
    const primitives = read("../../styles/planner/primitives.module.css");
    const motion = read("../../styles/planner/motion.module.css");
    expect(findPlannerMotionLiteralViolations(`${primitives}\n${motion}`)).toEqual([]);
    expect(motion).toContain("--motion-panel");
    expect(motion).toContain('html[data-motion="reduce"]');
    expect(motion).toContain("prefers-reduced-motion");
  });
});
