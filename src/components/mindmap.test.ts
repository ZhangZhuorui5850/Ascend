import { describe, expect, it } from "vitest";
import { clampZoom, linkPath, MAX_ZOOM, MIN_ZOOM } from "./mindmap";

describe("clampZoom", () => {
  it("夹取在上下限之间", () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
  });

  it("对齐到 0.1 档位并消除浮点误差", () => {
    expect(clampZoom(0.7 + 0.1)).toBe(0.8);
    expect(clampZoom(1.04)).toBe(1);
    expect(clampZoom(1.06)).toBe(1.1);
  });
});

describe("linkPath", () => {
  it("控制点取水平中线的三次贝塞尔", () => {
    expect(linkPath(0, 10, 100, 50)).toBe("M 0 10 C 50 10, 50 50, 100 50");
  });

  it("支持反向（子在父左侧）时仍取中点", () => {
    expect(linkPath(100, 0, 0, 0)).toBe("M 100 0 C 50 0, 50 0, 0 0");
  });
});
