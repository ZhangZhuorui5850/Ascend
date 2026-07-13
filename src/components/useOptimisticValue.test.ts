import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { reconcileOptimistic, type OptimisticState } from "./useOptimisticValue";

const source = readFileSync(new URL("./useOptimisticValue.ts", import.meta.url), "utf8");

describe("reconcileOptimistic", () => {
  it("returns null when nothing changed (no override, server value stable)", () => {
    const state: OptimisticState<string> = { confirmed: "A", override: null };
    expect(reconcileOptimistic(state, "A")).toBeNull();
  });

  it("returns null while the override is still in flight (server value unchanged, differs from override)", () => {
    const state: OptimisticState<string> = { confirmed: "A", override: { value: "B" } };
    expect(reconcileOptimistic(state, "A")).toBeNull();
  });

  it("clears the override once the server value catches up with it", () => {
    const state: OptimisticState<string> = { confirmed: "A", override: { value: "B" } };
    expect(reconcileOptimistic(state, "B")).toEqual({ confirmed: "B", override: null });
  });

  it("clears the override when the server value moves to a third value", () => {
    const state: OptimisticState<string> = { confirmed: "A", override: { value: "B" } };
    expect(reconcileOptimistic(state, "C")).toEqual({ confirmed: "C", override: null });
  });

  it("clears a stale override in the A->B->A double-toggle case (server value equals override, confirmed never changed)", () => {
    // apply(B) then apply(A) while in flight; server ends up back at A.
    // confirmed stayed A the whole time, so an edge-triggered check would leave
    // override{A} stuck forever. The level check on override.value must clear it.
    const state: OptimisticState<string> = { confirmed: "A", override: { value: "A" } };
    expect(reconcileOptimistic(state, "A")).toEqual({ confirmed: "A", override: null });
  });

  it('treats falsy values (false / 0 / "") as legitimate, distinguishable overrides', () => {
    const boolState: OptimisticState<boolean> = { confirmed: true, override: { value: false } };
    expect(reconcileOptimistic(boolState, true)).toBeNull(); // still in flight, not cleared
    expect(reconcileOptimistic(boolState, false)).toEqual({ confirmed: false, override: null });

    const numState: OptimisticState<number> = { confirmed: 1, override: { value: 0 } };
    expect(reconcileOptimistic(numState, 0)).toEqual({ confirmed: 0, override: null });

    const strState: OptimisticState<string> = { confirmed: "x", override: { value: "" } };
    expect(reconcileOptimistic(strState, "")).toEqual({ confirmed: "", override: null });
  });
});

describe("useOptimisticValue contract (source assertions)", () => {
  it("is a client-side hook", () => {
    expect(source).toContain('"use client"');
  });

  it("reconciles during render via the pure function, guarded so setState only fires on change", () => {
    expect(source).toMatch(/const next = reconcileOptimistic\(/);
    expect(source).toMatch(/if \(next\)/);
  });

  it("wraps the override in an object so falsy values stay distinguishable", () => {
    expect(source).toContain("override: { value: T } | null");
    expect(source).toContain("state.override ? state.override.value : serverValue");
  });

  it("exposes value / apply / rollback", () => {
    expect(source).toMatch(/apply:/);
    expect(source).toMatch(/rollback:/);
  });
});
