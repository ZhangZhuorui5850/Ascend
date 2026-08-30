import type { ExplorerFile, ExplorerTreeNode } from "@/lib/repo/library";

export type SortKey = "name" | "size" | "day";

export type DragPayload =
  | { kind: "file"; id: number }
  | { kind: "folder"; path: string }
  | { kind: "algorithm-problem"; problemId: number };

export type MoveTarget =
  | { kind: "file"; id: number; name: string }
  | { kind: "folder"; path: string; name: string }
  | { kind: "batch"; ids: number[]; name: string };

export type ActionResult = { ok: boolean; error?: string };

export type FolderOption = { path: string; name: string; depth: number };

/** 列表排序：中文名 / 大小 / 日期（同日按入库时间），不改动入参数组。 */
export function sortFiles(files: ExplorerFile[], sortKey: SortKey, sortAsc: boolean): ExplorerFile[] {
  const copy = [...files];
  copy.sort((a, b) => {
    let compare = 0;
    if (sortKey === "name") compare = a.original_name.localeCompare(b.original_name, "zh-CN");
    if (sortKey === "size") compare = a.size - b.size;
    if (sortKey === "day") compare = a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at);
    return sortAsc ? compare : -compare;
  });
  return copy;
}

/** 把文件夹树拍平成带缩进层级的选项列表（用于“移动到…”对话框）。 */
export function flattenFolders(nodes: ExplorerTreeNode[], depth = 0): FolderOption[] {
  return nodes.flatMap((node) => [
    { path: node.path, name: node.name, depth },
    ...flattenFolders(node.children, depth + 1),
  ]);
}

export function formatSize(size: number): string {
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}
