import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getSourceRoot } from "./db";
import { extractKnowledgeSeed } from "./knowledge-map";

describe("extractKnowledgeSeed", () => {
  it("extracts M1-M7 subjects and knowledge points from the current HTML map", () => {
    const html = readFileSync(path.join(getSourceRoot(), "知识地图页面.html"), "utf8");

    const seed = extractKnowledgeSeed(html);

    expect(seed.subjects).toHaveLength(7);
    expect(seed.subjects[0]).toMatchObject({ code: "M1", name: "线性代数" });
    expect(seed.points.length).toBeGreaterThan(100);
    expect(seed.points.filter((point) => point.tier === "r").length).toBeGreaterThan(50);
    expect(seed.points.some((point) => point.exam && point.title.includes("PCA"))).toBe(true);
  });

  it("falls back to the bundled M1-M7 seed when the source page is only a deployment placeholder", () => {
    const seed = extractKnowledgeSeed(`
      <script>
        const DATA = [];
        const TIERNAME = {};
      </script>
    `);

    expect(seed.subjects).toHaveLength(7);
    expect(seed.points.length).toBeGreaterThan(100);
    expect(seed.points.some((point) => point.exam && point.title.includes("PCA"))).toBe(true);
  });
});
