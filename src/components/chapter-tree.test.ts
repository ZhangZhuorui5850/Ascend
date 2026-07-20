import { describe, expect, it } from "vitest";
import type { ChapterWithPoints, PointNode } from "@/lib/repo/knowledge";
import {
  countChaptersDeep,
  countPointsDeep,
  findChapterPath,
  findPointLocation,
  findPointNode,
  findPointPath,
  subtreeHeightOf,
  subtreeIdsOf,
} from "./chapter-tree";

function point(id: string, children: PointNode[] = []): PointNode {
  return { id, children } as PointNode;
}

function chapter(id: string, children: ChapterWithPoints[] = [], points: PointNode[] = []): ChapterWithPoints {
  return {
    id,
    title: id,
    sort_order: 0,
    parent_id: null,
    points,
    children,
  };
}

// a ── b ── d（2 点，其中 p1 下嵌套 p1a）
//   └─ c（1 点）
const tree = chapter("a", [
  chapter("b", [chapter("d", [], [point("d-p0"), point("d-p1", [point("d-p1a")])])]),
  chapter("c", [], [point("c-p0")]),
]);

describe("chapter-tree 纯工具", () => {
  it("countPointsDeep 统计整棵子树的知识点（含嵌套子点）", () => {
    expect(countPointsDeep(tree)).toBe(4);
    expect(countPointsDeep(tree.children[0])).toBe(3);
  });

  it("countChaptersDeep 含根自身", () => {
    expect(countChaptersDeep(tree)).toBe(4);
    expect(countChaptersDeep(tree.children[1])).toBe(1);
  });

  it("subtreeIdsOf 深度优先且含根", () => {
    expect(subtreeIdsOf(tree)).toEqual(["a", "b", "d", "c"]);
  });

  it("subtreeHeightOf 取最深分支，叶子为 1", () => {
    expect(subtreeHeightOf(tree)).toBe(3);
    expect(subtreeHeightOf(tree.children[1])).toBe(1);
  });

  it("findChapterPath 返回根到目标的完整路径，找不到返回 null", () => {
    expect(findChapterPath([tree], "d")?.map((node) => node.id)).toEqual(["a", "b", "d"]);
    expect(findChapterPath([tree], "a")?.map((node) => node.id)).toEqual(["a"]);
    expect(findChapterPath([tree], "missing")).toBeNull();
  });

  it("findPointNode 能找到深层嵌套点与未分章点", () => {
    expect(findPointNode([tree], [], "d-p1a")?.id).toBe("d-p1a");
    expect(findPointNode([tree], [point("loose-1", [point("loose-1a")])], "loose-1a")?.id).toBe("loose-1a");
    expect(findPointNode([tree], [], "missing")).toBeNull();
  });

  it("findPointPath 返回根知识点到目标的路径", () => {
    expect(findPointPath(tree.children[0].children[0].points, "d-p1a")?.map((node) => node.id)).toEqual([
      "d-p1",
      "d-p1a",
    ]);
    expect(findPointPath(tree.children[0].children[0].points, "missing")).toBeNull();
  });

  it("findPointLocation 区分章节内与未分章知识点", () => {
    const nested = findPointLocation([tree], [], "d-p1a");
    expect(nested?.chapterPath.map((node) => node.id)).toEqual(["a", "b", "d"]);
    expect(nested?.pointPath.map((node) => node.id)).toEqual(["d-p1", "d-p1a"]);

    const loose = findPointLocation([tree], [point("loose-1", [point("loose-1a")])], "loose-1a");
    expect(loose?.chapterPath).toEqual([]);
    expect(loose?.pointPath.map((node) => node.id)).toEqual(["loose-1", "loose-1a"]);
  });

  it("subtreeIdsOf/subtreeHeightOf 对知识点树同样适用", () => {
    const nested = point("p", [point("p1", [point("p1a")]), point("p2")]);
    expect(subtreeIdsOf(nested)).toEqual(["p", "p1", "p1a", "p2"]);
    expect(subtreeHeightOf(nested)).toBe(3);
  });
});
