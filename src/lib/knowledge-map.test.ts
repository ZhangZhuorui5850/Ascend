import { describe, expect, it } from "vitest";
import { buildFallbackKnowledgeSeed, extractKnowledgeSeed } from "./knowledge-map";

describe("knowledge seed", () => {
  it("bundles a complete M1-M7 fallback seed", () => {
    const seed = buildFallbackKnowledgeSeed();

    expect(seed.subjects).toHaveLength(7);
    expect(seed.subjects[0]).toMatchObject({ code: "M1", name: "线性代数" });
    expect(seed.points.length).toBeGreaterThan(100);
    expect(seed.points.some((point) => point.exam && point.title.includes("PCA"))).toBe(true);
  });

  it("falls back to the bundled seed when the source page is only a deployment placeholder", () => {
    const seed = extractKnowledgeSeed(`
      <script>
        const DATA = [];
        const TIERNAME = {};
      </script>
    `);

    expect(seed.subjects).toHaveLength(7);
    expect(seed.points.length).toBeGreaterThan(100);
  });

  it("parses an inline DATA block from the knowledge map HTML", () => {
    const html = `
      <script>
        const DATA = [["M1", "线性代数", "desc", [["矩阵", [["r", "矩阵乘法", true]]]]]];
        const TIERNAME = {};
      </script>
    `;

    const seed = extractKnowledgeSeed(html);

    expect(seed.subjects).toEqual([{ code: "M1", name: "线性代数", description: "desc" }]);
    expect(seed.points).toHaveLength(1);
    expect(seed.points[0]).toMatchObject({ title: "矩阵乘法", tier: "r", exam: true, submodule: "矩阵" });
  });
});
