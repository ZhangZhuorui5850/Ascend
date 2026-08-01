import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles/summit.css", import.meta.url), "utf8");

describe("home weekly capacity feedback", () => {
  it("uses the saved weekly target and keeps actual, planned, unallocated, and overload separate", () => {
    expect(source).toContain("getWeeklyCapacity");
    expect(source).toContain("targetMinutes: settings.weeklyMinutes");
    expect(source).toContain("已学习");
    expect(source).toContain("已排未完成");
    expect(source).toContain("尚未分配");
    expect(source).toContain("超出目标");
    expect(source).toContain("预计时间不是实际学习");
  });

  it("presents allocation as a read-only draft with day-page deep links", () => {
    expect(source).toContain("查看剩余容量草案");
    expect(source).toContain("这是只读草案，不会自动创建或移动任务");
    expect(source).toContain("day.suggestedMinutes");
    expect(source).toContain("`/day/${day.day}#day-tasks`");
  });

  it("has responsive capacity layout styles", () => {
    expect(styles).toContain(".homeCapacityMetrics");
    expect(styles).toContain("grid-template-columns: repeat(4");
    expect(styles).toMatch(/@media[\s\S]*\.homeCapacityMetrics\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
  });

  it("renders only actionable plugin recommendations with a one-hop destination", () => {
    expect(source).toContain("getPluginTodayRecommendations");
    expect(source).toContain("pluginRecommendations.length");
    expect(source).toContain("href={recommendation.href}");
    expect(source).toContain("recommendation.description");
  });
});
