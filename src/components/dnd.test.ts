import { describe, expect, it } from "vitest";
import { edgeForOffset } from "./dnd";

describe("edgeForOffset", () => {
  it("half 模式以中线分前后", () => {
    expect(edgeForOffset(9, 40, "half")).toBe("before");
    expect(edgeForOffset(31, 40, "half")).toBe("after");
  });

  it("nest 模式上 1/4 前、下 1/4 后、中间嵌套", () => {
    expect(edgeForOffset(5, 40, "nest")).toBe("before");
    expect(edgeForOffset(20, 40, "nest")).toBe("inside");
    expect(edgeForOffset(38, 40, "nest")).toBe("after");
  });

  it("越界偏移与零高度有稳定兜底", () => {
    expect(edgeForOffset(-5, 40, "half")).toBe("before");
    expect(edgeForOffset(60, 40, "half")).toBe("after");
    expect(edgeForOffset(10, 0, "half")).toBe("after");
  });
});
