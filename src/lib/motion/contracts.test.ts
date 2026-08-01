import { describe, expect, it } from "vitest";
import { motion } from "@/lib/motion/contracts";

describe("semantic motion contracts", () => {
  it("makes row exits faster than enters", () => {
    expect(motion.row.exit.transition.duration!).toBeLessThan(motion.row.animate.transition.duration!);
    expect(motion.feedback.exit.transition.duration!).toBeLessThan(motion.feedback.animate.transition.duration!);
  });

  it("provides opacity-only reduce variants for object motion", () => {
    for (const contract of [motion.row.reduced, motion.feedback.reduced]) {
      for (const state of [contract.enter, contract.animate, contract.exit]) {
        expect(Object.keys(state).filter((key) => key !== "opacity" && key !== "transition")).toEqual([]);
      }
      expect(contract.animate.transition.duration!).toBeLessThanOrEqual(0.12);
      expect(contract.exit.transition.duration!).toBeLessThanOrEqual(0.12);
      expect(contract.exit.transition.duration!).toBeLessThanOrEqual(contract.animate.transition.duration!);
    }
  });
});
