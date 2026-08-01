import FullCalendar from "@fullcalendar/react";
import { Drawer } from "@base-ui/react/drawer";
import { LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import { describe, expect, it } from "vitest";

describe("Planner frontend technology prototype", () => {
  it("loads the Motion lazy feature bundle and reduced-motion provider", () => {
    expect(typeof LazyMotion).toBe("function");
    expect(typeof MotionConfig).toBe("function");
    expect(typeof m.div).toBe("object");
    expect(domAnimation).toBeDefined();
  });

  it("loads the stable Base UI Drawer anatomy and virtual keyboard provider", () => {
    expect(typeof Drawer.Root).toBe("function");
    expect(Drawer.Popup).toBeDefined();
    expect(typeof Drawer.VirtualKeyboardProvider).toBe("function");
  });

  it("keeps the existing FullCalendar React adapter available", () => {
    expect(typeof FullCalendar).toBe("function");
  });
});
