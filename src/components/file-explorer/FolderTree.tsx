"use client";

import type { DragEvent, MutableRefObject } from "react";
import { FileCode2, Folder, GraduationCap, HardDrive } from "lucide-react";
import type { AlgorithmTrainingTree } from "@/lib/repo/algorithm-training";
import type { ExplorerState, ExplorerTreeNode } from "@/lib/repo/library";
import type { DragPayload } from "@/components/file-explorer/explorer-utils";
import { formatSize } from "@/components/file-explorer/explorer-utils";

/** 左侧文件夹树 + 算法训练虚拟树 + 存储配额。纯展示，拖放通过 dragRef/onDrop 回传壳组件。 */
export function FolderTreePanel({ explorer, isSearch, usage, dragRef, onOpen, onDrop, algorithmTree }: {
  explorer: ExplorerState;
  isSearch: boolean;
  usage?: { usedBytes: number; quotaBytes: number };
  dragRef: MutableRefObject<DragPayload | null>;
  onOpen: (path: string) => void;
  onDrop: (path: string, event: DragEvent<HTMLElement>) => Promise<void>;
  algorithmTree?: AlgorithmTrainingTree | null;
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
      {algorithmTree?.courses.length ? <AlgorithmTrainingSection tree={algorithmTree} /> : null}
      {usage ? <QuotaMeter quotaBytes={usage.quotaBytes} usedBytes={usage.usedBytes} /> : null}
    </aside>
  );
}

/** 算法训练与网盘共用一棵树：课程 → 阶段 → 题目，点击题目跳算法训练详情。 */
function AlgorithmTrainingSection({ tree }: { tree: AlgorithmTrainingTree }) {
  return (
    <div className="driveTreeList algoTree" aria-label="算法训练目录">
      <div className="driveTreeItem algoTreeHeader">
        <GraduationCap size={15} />
        <span>算法训练</span>
        <small>{tree.problemTotal}</small>
      </div>
      {tree.courses.map((course) => (
        <details className="driveTreeBranch algoBranch" key={course.key} open={tree.courses.length <= 3}>
          <summary className="driveTreeItem">
            <Folder size={15} />
            <span>{course.name}</span>
            <small>{course.total}</small>
          </summary>
          <div className="driveTreeChildren">
            {course.stages.map((stage) => (
              <details className="driveTreeBranch algoBranch" key={stage.key}>
                <summary className="driveTreeItem">
                  <Folder size={15} />
                  <span>{stage.name}</span>
                  <small>{stage.total}</small>
                </summary>
                <div className="driveTreeChildren">
                  {stage.problems.map((problem) => (
                    <a
                      className="driveTreeItem algoProblem"
                      href={`/practice/algorithms?problem=${problem.id}`}
                      key={problem.id}
                      title={`${problem.label} · ${problem.title}${problem.hasAsset ? " · 已有参考 CPP" : ""}`}
                    >
                      <FileCode2 size={13} />
                      <span>{problem.title}</span>
                      {problem.hasAsset ? <small>CPP</small> : null}
                    </a>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
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
