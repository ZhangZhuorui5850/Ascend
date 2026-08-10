import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./CommandPalette.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("CommandPalette global entity search", () => {
  it("debounces authenticated workspace search and cancels stale requests", () => {
    expect(source).toContain("/api/search?q=");
    expect(source).toContain("new AbortController()");
    expect(source).toContain("}, 180)");
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain("controller.abort()");
  });

  it("groups entity results and keeps keyboard navigation on the flattened order", () => {
    expect(source).toContain("groupEntries(entries)");
    expect(source).toContain("knowledge_point: Brain");
    expect(source).toContain("mistake: Bug");
    expect(source).toContain("task: CheckSquare2");
    expect(source).toContain("note: StickyNote");
    expect(source).toContain("asset: FileText");
    expect(source).toContain("algorithm_problem: Code2");
    expect(source).toContain("execute(safeActiveIndex)");
  });

  it("offers an explicit add-to-training action only for actionable results", () => {
    expect(source).toContain("entry.training");
    expect(source).toContain("createDayTaskAction");
    expect(source).toContain("加入今日训练");
    expect(source).toContain("sourceType: training.sourceType");
  });

  it("styles grouped results and a separate training control", () => {
    expect(styles).toContain(".commandGroupLabel");
    expect(styles).toContain(".commandResultRow");
    expect(styles).toContain(".commandTrainingAction");
  });
});
