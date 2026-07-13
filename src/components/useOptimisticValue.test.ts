import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./useOptimisticValue.ts", import.meta.url), "utf8");

describe("useOptimisticValue contract", () => {
  it("clears the local override during render once the server value catches up", () => {
    expect(source).toContain("if (!Object.is(confirmed, serverValue))");
    expect(source).toContain("setConfirmed(serverValue)");
    expect(source).toContain("setOverride(null)");
  });

  it("wraps the override in an object so falsy values stay distinguishable", () => {
    expect(source).toContain("useState<{ value: T } | null>(null)");
    expect(source).toContain("override ? override.value : serverValue");
  });

  it("exposes value / apply / rollback", () => {
    expect(source).toMatch(/apply:/);
    expect(source).toMatch(/rollback:/);
  });
});
