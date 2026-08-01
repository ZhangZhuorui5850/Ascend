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

describe("motion batch list presence", () => {
  it("animates local attachment and countdown insertion/removal", () => {
    expect(capture).toContain("enteringAttachmentIds");
    expect(capture).toContain("leavingAttachmentIds");
    expect(capture).toContain("data-entering={entering");
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
    expect(globals).toMatch(/\.attachmentCard\[data-entering\][\s\S]*var\(--motion-quick\)/);
    expect(globals).toMatch(/\.queueCard\[data-leaving\][\s\S]*var\(--motion-fast\)/);
  });

  it("adds progressive disclosure and panel entry", () => {
    expect(summit).toContain("@supports (interpolate-size: allow-keywords)");
    expect(summit).toContain(".dayModule::details-content");
    expect(summit).toContain("transition-behavior: allow-discrete");
    expect(summit).toMatch(/\.commandPalette,[\s\S]*captureMenuIn var\(--motion-fast\)/);
  });

  it("connects page tokens and removes dead transition props", () => {
    expect(summit).toContain("summit-page-in var(--motion-page) var(--motion-ease-enter)");
    expect(summit).toContain("summit-page-out var(--motion-fast) var(--motion-ease-exit)");
    expect(appShell).not.toContain('enter="summit-page-enter"');
    expect(appShell).not.toContain('exit="summit-page-exit"');
  });

  it("keeps the capture FAB out of both Planner routes and active Planner overlays", () => {
    expect(appShell).toContain('const isPlannerRoute = pathname.startsWith("/tasks") || pathname.startsWith("/calendar")');
    expect(appShell).toContain("!captureOpen && !isPlannerRoute");
    expect(appShell).not.toContain("captureFabPlanner");
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
