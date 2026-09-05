"use client";

import type { DragEvent, MutableRefObject } from "react";
import { Folder, HardDrive } from "lucide-react";
import type { AlgorithmLibrary } from "@/lib/repo/algorithm-library";
import type { ExplorerState, ExplorerTreeNode } from "@/lib/repo/library";
import type { DragPayload } from "@/components/file-explorer/explorer-utils";
import { formatSize } from "@/components/file-explorer/explorer-utils";

/** 左侧文件夹树 + 算法课程树 + 存储配额；课程主章节支持题目拖放。 */
export function FolderTreePanel({
  explorer,
  isSearch,
  usage,
  dragRef,
  onOpen,
  onDrop,
  algorithmLibrary,
  algorithmActive,
  algorithmFolderId,
  onAlgorithmOpen,
}: {
  explorer: ExplorerState;
  isSearch: boolean;
  usage?: { usedBytes: number; quotaBytes: number };
  dragRef: MutableRefObject<DragPayload | null>;
  onOpen: (path: string) => void;
  onDrop: (path: string, event: DragEvent<HTMLElement>) => Promise<void>;
  algorithmLibrary?: AlgorithmLibrary | null;
  algorithmActive?: boolean;
  algorithmFolderId?: string | null;
  onAlgorithmOpen: (folderId: string | null) => void;
}) {
  return (
    <aside className="driveTree" aria-label="文件夹树">
      <button
        className={!explorer.currentPath && !isSearch ? "driveTreeRoot active" : "driveTreeRoot"}
        onClick={() => onOpen("")}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => void onDrop("", event)}
        type="button"
      >
        <HardDrive size={16} />
        <span>资料库</span>
        <small>{explorer.totalFiles}</small>
      </button>
      <div className="driveTreeList">
        {explorer.tree.map((node) => (
          <TreeNode
            activePath={isSearch ? " " : explorer.currentPath}
            dragRef={dragRef}
            key={node.path}
            node={node}
            onDrop={onDrop}
            onOpen={onOpen}
          />
        ))}
        {algorithmLibrary ? (
          <AlgorithmLibraryBranch active={Boolean(algorithmActive)} activeFolderId={algorithmFolderId ?? null} library={algorithmLibrary} onOpen={onAlgorithmOpen} />
        ) : null}
      </div>
      {usage ? <QuotaMeter quotaBytes={usage.quotaBytes} usedBytes={usage.usedBytes} /> : null}
    </aside>
  );
}

/** 算法训练作为资料库中的普通领域文件夹，内部直接投影题库物理目录。 */
function AlgorithmLibraryBranch({ active, activeFolderId, library, onOpen }: { active: boolean; activeFolderId: string | null; library: AlgorithmLibrary; onOpen: (folderId: string | null) => void }) {
  const renderChildren = (parentId: string | null): React.ReactNode => library.folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((folder) => (
      <div className="driveTreeBranch" key={folder.id}>
        <button className={active && activeFolderId === folder.id ? "driveTreeItem active" : "driveTreeItem"} onClick={() => onOpen(folder.id)} type="button">
          <Folder size={15} /><span>{folder.name}</span><small>{library.items.filter((item) => item.folderId === folder.id).length || ""}</small>
        </button>
        <div className="driveTreeChildren">{renderChildren(folder.id)}</div>
      </div>
    ));
  return (
    <div className="driveTreeBranch" aria-label="算法训练目录">
      <button className={active && !activeFolderId ? "driveTreeItem active" : "driveTreeItem"} onClick={() => onOpen(null)} type="button">
        <Folder size={15} /><span>算法训练</span><small>{library.items.length}</small>
      </button>
      <div className="driveTreeChildren">{renderChildren(null)}</div>
    </div>
  );
}

function TreeNode({ node, activePath, onOpen, onDrop, dragRef }: {
  node: ExplorerTreeNode;
  activePath: string;
  onOpen: (path: string) => void;
  onDrop: (path: string, event: DragEvent<HTMLElement>) => Promise<void>;
  dragRef: MutableRefObject<DragPayload | null>;
}) {
  return (
    <div className="driveTreeBranch">
      <button
        className={activePath === node.path ? "driveTreeItem active" : "driveTreeItem"}
        draggable
        onClick={() => onOpen(node.path)}
        onDragOver={(event) => event.preventDefault()}
        onDragStart={(event) => {
          event.stopPropagation();
          dragRef.current = { kind: "folder", path: node.path };
        }}
        onDrop={(event) => void onDrop(node.path, event)}
        type="button"
      >
        <Folder size={15} />
        <span>{node.name}</span>
        <small>{node.fileCount || ""}</small>
      </button>
      {node.children.length ? (
        <div className="driveTreeChildren">
          {node.children.map((child) => (
            <TreeNode activePath={activePath} dragRef={dragRef} key={child.path} node={child} onDrop={onDrop} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function QuotaMeter({ usedBytes, quotaBytes }: { usedBytes: number; quotaBytes: number }) {
  const ratio = quotaBytes > 0 ? Math.min(1, usedBytes / quotaBytes) : 0;
  const percent = Math.round(ratio * 100);
  const tight = ratio >= 0.85;
  return (
    <div className={tight ? "quotaMeter tight" : "quotaMeter"} title={`已用 ${formatSize(usedBytes)} / ${formatSize(quotaBytes)}`}>
      <div className="quotaTrack">
        <span style={{ transform: `scaleX(${Math.max(2, percent) / 100})` }} />
      </div>
      <small>
        空间 {formatSize(usedBytes)} / {formatSize(quotaBytes)}{tight ? " · 快满了" : ""}
      </small>
    </div>
  );
}
