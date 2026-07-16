import { describe, expect, it } from "vitest";
import { treeDropEdgeForOffset, edgeForOffset, type ChapterDrag } from "./dnd";

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

describe("treeDropEdgeForOffset", () => {
  const MAX = 8;
  function dragged(partial?: Partial<ChapterDrag>): ChapterDrag {
    return { kind: "chapter", id: "x", title: "x", subtreeIds: ["x", "x1"], height: 2, ...partial };
  }

  it("拖到自己或自己的子树上是非法目标", () => {
    expect(treeDropEdgeForOffset(20, 40, dragged(), { id: "x", depth: 1 }, MAX)).toBeNull();
    expect(treeDropEdgeForOffset(20, 40, dragged(), { id: "x1", depth: 2 }, MAX)).toBeNull();
  });

  it("放进去和放旁边都不超深时按 nest 三态判定", () => {
    expect(treeDropEdgeForOffset(5, 40, dragged(), { id: "t", depth: 6 }, MAX)).toBe("before");
    expect(treeDropEdgeForOffset(20, 40, dragged(), { id: "t", depth: 6 }, MAX)).toBe("inside");
    expect(treeDropEdgeForOffset(38, 40, dragged(), { id: "t", depth: 6 }, MAX)).toBe("after");
  });

  it("放进去会超深时退化为 half 两态", () => {
    expect(treeDropEdgeForOffset(20, 40, dragged(), { id: "t", depth: 7 }, MAX)).toBe("after");
    expect(treeDropEdgeForOffset(5, 40, dragged(), { id: "t", depth: 7 }, MAX)).toBe("before");
  });

  it("怎么放都超深时是非法目标", () => {
    expect(treeDropEdgeForOffset(20, 40, dragged(), { id: "t", depth: 8 }, MAX)).toBeNull();
  });
});
