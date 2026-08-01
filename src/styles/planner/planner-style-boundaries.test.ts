import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findPlannerMotionLiteralViolations } from "@/components/planner/planner-view-model";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Planner style and audit boundaries", () => {
  it("keeps migrated Planner styles out of the legacy global stylesheets", () => {
    const summit = source("src/styles/summit.css");
    const globals = source("src/app/globals.css");

    expect(summit).not.toMatch(
      /\.(?:plannerTasksShell|plannerTaskRow|calendarWorkspace|calendarLayout|calendarInbox|eventTask)\b/,
    );
    expect(globals).not.toMatch(
      /\.(?:calendarShell|calendarViewSwitch|calendarAgenda)\b/,
    );
  });

  it("uses semantic motion tokens in both Planner feature stylesheets", () => {
    const plannerStyles = [
      source("src/styles/planner/tasks.module.css"),
      source("src/styles/planner/calendar.module.css"),
    ].join("\n");

    expect(findPlannerMotionLiteralViolations(plannerStyles)).toEqual([]);
  });

  it("covers the Planner routes in the responsive audit", () => {
    const responsiveAudit = source("scripts/responsive-audit.mjs");
    const localizedCopyAudit = responsiveAudit.slice(
      responsiveAudit.indexOf("async function assertPlannerLocalizedCopy"),
      responsiveAudit.indexOf("async function auditMobileTaskLayout"),
    );

    expect(responsiveAudit).toContain('"/tasks"');
    expect(responsiveAudit).toContain('"/calendar"');
    expect(responsiveAudit).toContain('auditPlannerTasks("tasks-desktop", "/tasks", 1440, 1000)');
    expect(responsiveAudit).toContain('auditPlannerCalendar("calendar-desktop", "/calendar", 1440, 1000)');
    expect(responsiveAudit).toContain('auditPlannerTasks("tasks-tablet", "/tasks", 900, 1000, "drawer")');
    expect(responsiveAudit).toContain('auditPlannerCalendar("calendar-tablet", "/calendar", 900, 1000, "drawer")');
    expect(responsiveAudit).toContain('auditPlannerTasks("tasks-mobile", "/tasks", 390, 844, "sheet")');
    expect(responsiveAudit).toContain('auditPlannerCalendar("calendar-mobile", "/calendar", 390, 844, "sheet")');
    expect(responsiveAudit).toContain("data-planner-surface");
    expect(responsiveAudit).toContain("assertPlannerTaskRowContract");
    expect(responsiveAudit).toContain("assertPlannerFieldSkin");
    expect(responsiveAudit).toContain('Number.parseFloat(fieldStyle.opacity) === 0');
    expect(responsiveAudit).toContain('output[aria-hidden="true"]');
    expect(responsiveAudit).toContain("assertNoPlannerOverlayIntersections");
    expect(responsiveAudit).toContain('!element.matches("[data-planner-backdrop]")');
    expect(responsiveAudit).toContain('!element.matches(\'[data-base-ui-inert][aria-hidden="true"][role="presentation"]\')');
    expect(responsiveAudit).toContain('scope.closest("[data-planner-surface]")');
    expect(responsiveAudit).toContain('getComputedStyle(overlayLayer).position !== "fixed"');
    expect(responsiveAudit).toContain("const insideScope = scope.contains(layer)");
    expect(responsiveAudit).toContain("layerZIndex < overlayZIndex");
    expect(responsiveAudit).toContain('effective-z=${layerZIndex ?? "unknown"}');
    expect(responsiveAudit).toContain("RESPONSIVE_AUDIT_STATE_MATRIX");
    expect(responsiveAudit).toContain("auditPlannerStateMatrix");
    expect(responsiveAudit).toContain("createQuickCaptureTaskAndWaitForPersistence");
    expect(responsiveAudit).toContain("page.waitForResponse");
    expect(responsiveAudit).toContain('response.request().headers()["next-action"]');
    expect(responsiveAudit).toContain("response.request().method() === \"POST\"");
    expect(responsiveAudit).toContain("response.ok()");
    expect(responsiveAudit).toContain('[data-planner-task-open]:not([data-planner-task-id^="draft:"])');
    expect(responsiveAudit).toContain("quick capture submission diagnostics");
    expect(responsiveAudit).toContain('button.getAttribute("aria-disabled") !== "true"');
    expect(responsiveAudit).toContain('request.headers()["next-action"]');
    expect(responsiveAudit).toContain('page.route("**/*"');
    expect(responsiveAudit).toContain("const context = await browser.newContext()");
    expect(responsiveAudit).toContain("const page = await context.newPage()");
    expect(responsiveAudit).toContain("page.context().newPage()");
    expect(responsiveAudit).toContain("await context.close()");
    expect(responsiveAudit).toContain('[data-status="conflict"]');
    expect(responsiveAudit).toContain('[data-kind="conflict"]');
    expect(responsiveAudit).toContain("state-empty");
    expect(responsiveAudit).toContain("state-dense");
    expect(responsiveAudit).toContain("network-error");
    expect(responsiveAudit).toContain("network-recovery");
    expect(responsiveAudit).toContain("conflict-recovery");
    expect(responsiveAudit).toContain("auditCalendarDesktopViews");
    expect(responsiveAudit).toContain("calendar desktop baseline did not return to month view");
    for (const view of ["月视图", "周视图", "日视图", "议程视图"]) expect(responsiveAudit).toContain(view);
    expect(responsiveAudit).toContain("RESPONSIVE_AUDIT_KEYBOARD_MATRIX");
    expect(responsiveAudit).toContain("auditPlannerKeyboardMatrix");
    expect(responsiveAudit).toContain("simulated-visual-viewport-resize");
    expect(responsiveAudit).toContain("visualViewport.height");
    expect(responsiveAudit).toContain("assertPlannerLocalizedCopy");
    expect(responsiveAudit).toContain("RESPONSIVE_AUDIT_SCREENSHOT_DIR");
    expect(responsiveAudit).toContain("capturePlannerEvidence");
    expect(responsiveAudit).toContain("fullPage: false");
    expect(responsiveAudit).toContain("for (let attempt = 1; attempt <= 3; attempt += 1)");
    expect(responsiveAudit).toContain("const before = await readPlannerCaptureState()");
    expect(responsiveAudit).toContain("const after = await readPlannerCaptureState()");
    expect(responsiveAudit).toContain('animations: "disabled"');
    expect(responsiveAudit).toContain("scroll: finalState.scroll");
    expect(responsiveAudit).toContain('document.querySelector(".topbar")');
    expect(responsiveAudit).toContain('document.querySelector(".sidebar")');
    expect(responsiveAudit).toContain("Planner evidence capture did not remain stable");
    expect(responsiveAudit).toContain("waitForCaptureStability");
    expect(responsiveAudit).toContain("document.getAnimations({ subtree: true })");
    expect(responsiveAudit).toContain("Promise.allSettled(before.map((animation) => animation.finished))");
    expect(responsiveAudit).toContain("window.scrollTo(0, 0)");
    expect(responsiveAudit).toContain("await frame()");
    expect(responsiveAudit).toContain("auditPlannerAppearanceMatrix");
    expect(responsiveAudit).toContain('"aurora", "brutal", "cloud", "terminal"');
    expect(responsiveAudit).toContain('reducedMotion: "reduce"');
    expect(responsiveAudit).toContain("auditAppReducedMotionRuntime");
    expect(responsiveAudit).toContain('data-motion-provider="always"');
    expect(responsiveAudit).toContain('localStorage.setItem("zgca-motion", "reduce")');
    expect(responsiveAudit).toContain("runtime setting did not apply without reload");
    const motionAudit = source("scripts/motion-audit.mjs");
    expect(motionAudit).toContain("duplicate-keyframes");
    expect(motionAudit).toContain("KEYFRAME_LEGACY_BASELINE");
    expect(motionAudit).toContain("KNOWN_PLANNER_MOTION_CONSUMERS");
    expect(motionAudit).toContain("motion-semantic-contract");
    expect(motionAudit).not.toContain('console.error(regressions.join("\\n"))');
    expect(responsiveAudit).toContain('var(--planner-field-line)');
    expect(responsiveAudit).toContain('var(--radius-sm)');
    expect(responsiveAudit).toContain('resolveBackground("--planner-field-hover")');
    expect(responsiveAudit).toContain('resolveBackground("--planner-field-focus")');
    expect(responsiveAudit).toContain("if (field.focused) approvedBackgrounds.push(result.approved.focus)");
    expect(responsiveAudit).toContain("if (field.hovered) approvedBackgrounds.push(result.approved.hover)");
    expect(responsiveAudit).toContain('rootStyle.getPropertyValue("--line-strong")');
    expect(responsiveAudit).toContain('field.getAttribute("data-planner-field-variant")');
    expect(responsiveAudit).toContain('field.variant === "underline"');
    expect(responsiveAudit).toContain("Number.parseFloat(field.radius) !== 0");
    expect(responsiveAudit).toContain('field.borderBottomWidth === "0px"');
    expect(responsiveAudit).toContain("approvedBottomLines.includes(field.borderBottomColor)");
    expect(responsiveAudit).toContain('field.radius !== result.approved.radius');
    expect(responsiveAudit).toContain('`${name} inline inspector`, \'[aria-label="任务详情"]\'');
    expect(responsiveAudit).toContain('`${name} inline context`, \'[aria-label="日历上下文"]\'');
    expect(localizedCopyAudit).toContain('/\\b(?:Today|Upcoming|Completed|Trash|Open|min|pending|leased|sent|failed|canceled|in_app|web_push|date-only)\\b/i');
    expect(localizedCopyAudit).toContain('querySelectorAll("input, textarea")');
    expect(localizedCopyAudit).not.toContain("select");
  });

  it("keeps the visible date/time wrapper on approved Planner interaction surfaces", () => {
    const primitives = source("src/styles/planner/primitives.module.css");

    expect(primitives).toMatch(/\.dateTimeField\s*\{[\s\S]*?background:\s*transparent/);
    expect(primitives).toMatch(/\.dateTimeField:has\(input:focus-visible\)\s*\{[\s\S]*?background:\s*var\(--planner-field-focus\)/);
  });

  it("uses the accessible calendar inbox contract in smoke coverage", () => {
    const smoke = source("scripts/smoke.mjs");

    expect(smoke).toContain("排入 ${inboxTaskName}");
    expect(smoke).not.toContain(".calendarInboxTask");
    expect(smoke).toContain('getByRole("dialog")');
    expect(smoke).not.toContain(".confirmDialog");
  });
});
