import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../styles/summit.css", import.meta.url), "utf8");

describe("analytics outcome-first hierarchy", () => {
  it("places result and verification signals before activity metrics", () => {
    expect(source.indexOf('aria-label="学习结果与过程质量"'))
      .toBeLessThan(source.indexOf('aria-label="近七天概览"'));
    expect(source).toContain("delayedRecall7");
    expect(source).toContain("delayedRecall30");
    expect(source).toContain("mistakeReattempt");
    expect(source).toContain("confidenceCalibration");
    expect(source).toContain("backlogAge");
    expect(source).toContain("interventionVerification");
  });

  it("shows sample state and avoids causal claims", () => {
    expect(source).toContain("小样本 n=");
    expect(source).toContain("少于 5 个样本只展示，不生成强结论");
    expect(source).toContain("不代表因果改善");
    expect(source).toContain("结果评分仍包含用户核对后的自评");
  });

  it("uses responsive result cards", () => {
    expect(styles).toContain(".outcomeSignalGrid");
    expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.outcomeSignalGrid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });

  it("renders enabled plugin evidence before generic activity metrics", () => {
    expect(source).toContain("getPluginAnalyticsSections");
    expect(source).toContain("pluginAnalyticsSections.map");
    expect(source).toContain("PLUGIN EVIDENCE");
    expect(source.indexOf("pluginAnalyticsSections.map"))
      .toBeLessThan(source.indexOf('aria-label="近七天概览"'));
  });
});
