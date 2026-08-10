import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wizard = readFileSync(new URL("./OnboardingWizard.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./OnboardingWizard.module.css", import.meta.url), "utf8");

describe("minimal onboarding contract", () => {
  it("uses exactly the three frozen product steps", () => {
    expect(wizard).toContain('const steps = ["学习", "目标", "第一件事"]');
    expect(wizard).toContain("你准备学什么？");
    expect(wizard).toContain("最近最重要的目标是什么？");
    expect(wizard).toContain("今天第一件要完成的事是什么？");
    expect(wizard).not.toContain("WEEKLY_PRESETS");
    expect(wizard).not.toContain("examCountdowns");
  });

  it("submits one idempotent transaction and routes directly to Today", () => {
    expect(wizard).toContain("completeOnboardingAction");
    expect(wizard).toContain("clientMutationId");
    expect(wizard).toContain('router.push("/")');
    expect(wizard).not.toContain("router.refresh()");
  });

  it("uses module-scoped responsive controls with 44px targets", () => {
    expect(wizard).toContain('import styles from "./OnboardingWizard.module.css"');
    expect(styles).toMatch(/\.primary,[\s\S]*min-height:\s*44px/);
    expect(styles).toContain("@media (max-width: 600px)");
  });
});
