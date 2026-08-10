import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./Today.module.css", import.meta.url), "utf8");
const timeline = readFileSync(new URL("../components/today/TodayTimeline.tsx", import.meta.url), "utf8");

describe("Today product contract", () => {
  it("keeps the home route to the four Today sections and one strongest NOW action", () => {
    expect(page).toContain("getTodayReadModel");
    expect(page).toContain("NOW");
    expect(page).toContain("TODAY");
    expect(page).toContain("REVIEW");
    expect(page).toContain("CAPTURE");
    expect(page).toContain("action.reasons.map");
    expect(page).toContain("className={styles.primaryAction}");
    expect(page).not.toContain("getWeeklyCapacity");
    expect(page).not.toContain("getPluginTodayRecommendations");
  });

  it("keeps events distinct and labels due-only tasks as unscheduled", () => {
    expect(timeline).toContain('item.kind === "task"');
    expect(timeline).toContain("未排时");
    expect(timeline).toContain('aria-label="日历事件"');
    expect(timeline).toContain("toggleDayTaskAction");
    expect(timeline).toContain('actionLabel: "撤销"');
  });

  it("uses a scoped CSS module with mobile touch targets and no horizontal layout dependency", () => {
    expect(page).toContain('import styles from "./Today.module.css"');
    expect(styles).toMatch(/@media \(max-width: 390px\)/);
    expect(styles).toMatch(/\.primaryAction[\s\S]*min-height:\s*46px/);
    expect(styles).toMatch(/\.secondaryLink[\s\S]*min-height:\s*44px/);
    expect(styles).not.toContain("100vw");
  });
});
