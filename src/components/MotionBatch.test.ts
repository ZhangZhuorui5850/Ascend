import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const capture = source("./CapturePanel.tsx");
const settings = source("./SettingsForm.tsx");
const notes = source("./DayNotes.tsx");
const review = source("./ReviewQueue.tsx");
const mistake = source("./MistakeReattempt.tsx");
const presence = source("./usePresenceAnimation.ts");
const plannerActions = source("../app/actions/planner.ts");
const globals = source("../app/globals.css");
const summit = source("../styles/summit.css");
const appShell = source("./AppShell.tsx");
const captureStyles = source("./CapturePanel.module.css");
const commandPalette = source("./CommandPalette.tsx");
const sidebar = source("./Sidebar.tsx");
const plannerPrimitives = source("../styles/planner/primitives.module.css");
const todayStyles = source("../app/Today.module.css");

describe("motion batch list presence", () => {
  it("keeps capture file state explicit and countdown insertion/removal animated", () => {
    expect(capture).toContain('type AttachmentStatus = "queued" | "uploading" | "uploaded" | "error"');
    expect(capture).toContain("Promise.all(queued.map(uploadAttachment))");
    expect(capture).toContain("outcomes.filter((saved) => !saved)");
    expect(settings).toContain("enteringCountdownKeys");
    expect(settings).toContain("leavingCountdownKeys");
    expect(settings).toContain("key={item.clientKey}");
  });

  it("provides animationend plus computed-duration fallback", () => {
    expect(presence).toContain("maxAnimationDurationMs");
    expect(presence).toContain("onAnimationEnd");
    expect(presence).toContain("PRESENCE_EVENT_GRACE_MS");
  });

  it("uses optimistic note insertion and request-independent deletion presence", () => {
    expect(notes).toContain("useOptimistic(");
    expect(notes).toContain("noteClientKeys");
    expect(notes).toContain("exitingNotes");
    expect(notes).toContain("startTransition(async () =>");
    expect(notes).not.toContain("router.refresh()");
    expect(plannerActions).toContain("return { ok: true, note }");
  });
});

describe("review state machines", () => {
  it("separates online exit, offline queued, failure, and undo states", () => {
    expect(review).toContain("reviewSnapshots");
    expect(review).toContain("armExit(key)");
    expect(review).toContain("setPendingOffline((current) => current + 1)");
    expect(review).toContain("setExitedKeys(new Set())");
    expect(review).toContain("prefers-reduced-motion: reduce");
  });

  it("refreshes standalone mistakes only after successful exit", () => {
    const failureBranch = mistake.slice(mistake.indexOf("if (!result.ok)"), mistake.indexOf("setLeavingIds"));
    expect(failureBranch).not.toContain("router.refresh()");
    expect(mistake).toContain("data-leaving={leaving");
    expect(mistake).toContain("function finishExit");
  });
});

describe("motion batch CSS contracts", () => {
  it("uses tokenized list enter/exit animations", () => {
    expect(captureStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globals).toMatch(/\.queueCard\[data-leaving\][\s\S]*var\(--motion-fast\)/);
  });

  it("adds progressive disclosure and panel entry", () => {
    expect(summit).toContain("@supports (interpolate-size: allow-keywords)");
    expect(summit).toContain(".dayModule::details-content");
    expect(summit).toContain("transition-behavior: allow-discrete");
    expect(commandPalette).toContain("<Dialog.Root");
    expect(summit).toContain(".commandPalette[data-ending-style]");
    expect(plannerPrimitives).toContain('.drawerPopup[data-planner-surface="drawer"][data-ending-style]');
  });

  it("assigns spatial meaning to page navigation without double-enter motion", () => {
    expect(summit).toContain("summit-page-in var(--motion-page) var(--motion-ease-enter)");
    expect(summit).toContain("summit-page-out var(--motion-fast) var(--motion-ease-exit)");
    expect(summit).toContain(":active-view-transition-type(nav-switch)");
    expect(summit).toContain(":active-view-transition-type(nav-forward)");
    expect(summit).toContain(":active-view-transition-type(nav-back)");
    expect(summit).toMatch(/\.mainPane > \.pageStack > \*\s*{\s*animation: none;/);
    expect(sidebar).toContain('transitionTypes={["nav-switch"]}');
    expect(sidebar).not.toContain('transitionTypes={["nav-forward"]}');
    expect(appShell).not.toContain('enter="summit-page-enter"');
    expect(appShell).not.toContain('exit="summit-page-exit"');
  });

  it("keeps high-frequency completion feedback brief and reducible", () => {
    expect(todayStyles).toContain("today-check-confirm var(--motion-quick)");
    expect(todayStyles).toContain(':global(html[data-motion="reduce"])');
    expect(captureStyles).toContain("var(--motion-loop)");
  });

  it("opens the same accessible capture primitive from every route", () => {
    expect(capture).toContain("PlannerDrawer");
    expect(capture).toContain('surface={surface}');
    expect(appShell).toContain("<CapturePanel");
    expect(appShell).toContain("!captureOpen");
    expect(appShell).not.toContain("isPlannerRoute");
  });

  it("removes the global ICP overlay from both Planner workspaces", () => {
    expect(globals).toContain('body:has([data-planner-workspace="tasks"]) .icpFooter');
    expect(globals).toContain('body:has([data-planner-workspace="calendar"]) .icpFooter');
  });

  it("migrates progress motion to transform", () => {
    expect(summit).toMatch(/\.progressTrack span,[\s\S]*transition: transform var\(--motion-quick\)/);
    expect(globals).not.toMatch(/\.progressTrack span\s*\{[^}]*transition:\s*width/s);
    expect(globals).not.toMatch(/\.taskProgress span\s*\{[^}]*transition:\s*width/s);
    expect(globals).not.toMatch(/\.mockScoreProgress i\s*\{[^}]*transition:\s*width/s);
  });
});
