import { flattenPointTree, type ChapterWithPoints, type PointNode } from "@/lib/repo/knowledge";

/** 默认展开到第 3 层，更深的章节初始折叠（可手动展开并记忆），列表/导图两个视图共用 */
export const DEFAULT_EXPAND_DEPTH = 3;

/** 整棵子树（含根）的知识点总数（含嵌套子点） */
export function countPointsDeep(chapter: ChapterWithPoints): number {
  return flattenPointTree(chapter.points).length
    + chapter.children.reduce((sum, child) => sum + countPointsDeep(child), 0);
}

/** 整棵子树的章节数（含根自身） */
export function countChaptersDeep(chapter: ChapterWithPoints): number {
  return 1 + chapter.children.reduce((sum, child) => sum + countChaptersDeep(child), 0);
}

/** 整棵子树（含根）的 id 列表，用于拖拽时禁止投放到自己内部；章节树/知识点树通用 */
export function subtreeIdsOf<T extends { id: string; children: T[] }>(node: T): string[] {
  return [node.id, ...node.children.flatMap(subtreeIdsOf)];
}

/** 子树高度（根算 1），用于客户端预判层级上限；章节树/知识点树通用 */
export function subtreeHeightOf<T extends { id: string; children: T[] }>(node: T): number {
  return 1 + node.children.reduce((max, child) => Math.max(max, subtreeHeightOf(child)), 0);
}

/** 从根到目标章节的路径（含目标）；找不到返回 null */
export function findChapterPath(chapters: ChapterWithPoints[], id: string): ChapterWithPoints[] | null {
  for (const chapter of chapters) {
    if (chapter.id === id) return [chapter];
    const sub = findChapterPath(chapter.children, id);
    if (sub) return [chapter, ...sub];
  }
  return null;
}

/** 从一组知识点根节点定位到目标的完整路径（含目标）；找不到返回 null。 */
export function findPointPath(points: PointNode[], id: string): PointNode[] | null {
  for (const point of points) {
    if (point.id === id) return [point];
    const sub = findPointPath(point.children, id);
    if (sub) return [point, ...sub];
  }
  return null;
}

export type PointLocation = {
  /** 空数组表示未分章知识点，否则为根章节到直属章节的路径。 */
  chapterPath: ChapterWithPoints[];
  /** 根知识点到目标知识点的路径。 */
  pointPath: PointNode[];
};

/** 同时返回知识点与所属章节路径，供跨页面深链准确定位知识点。 */
export function findPointLocation(
  chapters: ChapterWithPoints[],
  loosePoints: PointNode[],
  id: string,
): PointLocation | null {
  const loosePath = findPointPath(loosePoints, id);
  if (loosePath) return { chapterPath: [], pointPath: loosePath };

  function visit(items: ChapterWithPoints[], parents: ChapterWithPoints[]): PointLocation | null {
    for (const chapter of items) {
      const chapterPath = [...parents, chapter];
      const pointPath = findPointPath(chapter.points, id);
      if (pointPath) return { chapterPath, pointPath };
      const nested = visit(chapter.children, chapterPath);
      if (nested) return nested;
    }
    return null;
  }

  return visit(chapters, []);
}

/** 在整个科目（章节树 + 未分章）里按 id 找知识点节点 */
export function findPointNode(chapters: ChapterWithPoints[], loosePoints: PointNode[], id: string): PointNode | null {
  const location = findPointLocation(chapters, loosePoints, id);
  return location?.pointPath.at(-1) ?? null;
}
