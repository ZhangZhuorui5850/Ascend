import { describe, expect, it } from "vitest";
import {
  getAppMotionPreference,
  resolveMotionConfigPreference,
  resolveReducedMotion,
} from "@/components/ui/MotionProvider";

describe("MotionProvider preference resolution", () => {
  it("keeps motion when both system and application allow it", () => {
    expect(resolveReducedMotion(false, false)).toBe(false);
    expect(resolveMotionConfigPreference(false)).toBe("never");
  });

  it("honors system reduced motion when the app is normal", () => {
    expect(resolveReducedMotion(true, false)).toBe(true);
    expect(resolveMotionConfigPreference(resolveReducedMotion(true, false))).toBe("always");
  });

  it("honors the application reduce setting when the system is normal", () => {
    expect(resolveReducedMotion(false, true)).toBe(true);
  });

  it("re-evaluates a runtime html data-motion change", () => {
    const root = { dataset: {} } as HTMLElement;
    expect(getAppMotionPreference(root)).toBe(false);
    root.dataset.motion = "reduce";
    expect(resolveReducedMotion(false, getAppMotionPreference(root))).toBe(true);
    delete root.dataset.motion;
    expect(resolveReducedMotion(false, getAppMotionPreference(root))).toBe(false);
  });

  it("keeps the initial server fallback safe for system reduced motion", () => {
    expect(resolveMotionConfigPreference(null)).toBe("user");
  });
});
