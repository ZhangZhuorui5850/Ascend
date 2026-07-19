"use client";

import type { DragEvent, MutableRefObject } from "react";
import { Folder, HardDrive } from "lucide-react";
import type { ExplorerState, ExplorerTreeNode } from "@/lib/repo/library";
import type { DragPayload } from "@/components/file-explorer/explorer-utils";
import { formatSize } from "@/components/file-explorer/explorer-utils";

/** 左侧文件夹树 + 存储配额。纯展示，拖放通过 dragRef/onDrop 回传壳组件。 */
export function FolderTreePanel({ explorer, isSearch, usage, dragRef, onOpen, onDrop }: {
  explorer: ExplorerState;
  isSearch: boolean;
  usage?: { usedBytes: number; quotaBytes: number };
  dragRef: MutableRefObject<DragPayload | null>;
  onOpen: (path: string) => void;
  onDrop: (path: string, event: DragEvent<HTMLElement>) => Promise<void>;
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
      </div>
      {usage ? <QuotaMeter quotaBytes={usage.quotaBytes} usedBytes={usage.usedBytes} /> : null}
    </aside>
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
