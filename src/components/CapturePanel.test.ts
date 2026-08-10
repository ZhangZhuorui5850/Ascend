import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const capture = readFileSync(new URL("./CapturePanel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./CapturePanel.module.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");

describe("Universal Capture contract", () => {
  it("keeps every intent visible and sends text intents through one server boundary", () => {
    for (const kind of ["task", "study", "mistake", "note", "asset"]) {
      expect(capture).toContain(`kind: "${kind}"`);
    }
    expect(capture).toContain("parseCaptureText");
    expect(capture).toContain("建议：");
    expect(capture).toContain("recordCaptureAction");
    expect(capture).toContain("clientMutationId");
  });

  it("uses the Base UI drawer/sheet primitive with global paste and drag asset capture", () => {
    expect(capture).toContain("PlannerDrawer");
    expect(capture).toContain('window.matchMedia("(max-width: 760px)")');
    expect(capture).toContain('window.addEventListener("paste"');
    expect(capture).toContain('window.addEventListener("drop"');
    expect(capture).toContain("initialFocus");
  });

  it("maps Ctrl/Cmd+K and the floating action to the same capture state", () => {
    expect(shell).toContain('(event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"');
    expect(shell).toContain("setCaptureOpen(true)");
    expect(shell).toContain("<CapturePanel");
    expect(shell).toContain("记录");
  });

  it("keeps the confirmation action visible above the mobile keyboard", () => {
    expect(styles).toContain("position: sticky");
    expect(styles).toContain("env(safe-area-inset-bottom)");
    expect(styles).toMatch(/\.footer button[\s\S]*min-height:\s*44px/);
    expect(styles).toMatch(/@media \(max-width: 390px\)/);
  });
});
