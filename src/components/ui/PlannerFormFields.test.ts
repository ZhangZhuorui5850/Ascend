import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./PlannerFormFields.tsx", import.meta.url), "utf8");

describe("PlannerDateTimeField", () => {
  it("derives its visible ISO value when a parent changes the controlled value", () => {
    expect(source).toContain("const controlledValue = props.value");
    expect(source).toContain("const visibleValue = controlledValue === undefined ? displayValue : String(controlledValue)");
    expect(source).toContain("{visibleValue ||");
  });
});
