"use client";

import { useState, type DragEvent as ReactDragEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus } from "lucide-react";
import { createPointAction, reorderPointsAction } from "@/app/actions/knowledge";
import { MAX_POINT_DEPTH, flattenPointTree, type PointNode } from "@/lib/repo/knowledge";
import { subtreeHeightOf, subtreeIdsOf } from "@/components/chapter-tree";
import { attachDragCard, treeDropEdgeFromEvent, type DropEdge } from "@/components/dnd";
import { sortPointsForView, type PointSortMode } from "@/components/point-sort";
import { PointLine } from "./PointLine";
import type { Report, TreeControls } from "./shared";

/** 一个兄弟组（同章节 + 同父点）的知识点列表：组内排序在这里发起，成员各自递归渲染子点 */
export function PointList({ points, chapterId, parentPointId, pointDepth, subjectCode, today, sortMode, tree, report }: {
  points: PointNode[];
  chapterId: string;
  parentPointId: string | null;
  /** 组内节点的知识点层级（章节直属 = 1） */
  pointDepth: number;
  subjectCode: string;
  today: string;
  sortMode: PointSortMode;
  tree: TreeControls;
  report: Report;
}) {
  const [reordering, setReordering] = useState(false);
  const sorted = sortPointsForView(points, sortMode);

  async function applyOrder(ids: string[]) {
    setReordering(true);
    try {
      report(await reorderPointsAction({ chapterId, parentPointId, subjectCode, orderedIds: ids }));
    } catch (error) {
      console.error("知识点排序保存失败", error);
      report({ ok: false, error: "网络异常，排序未保存" });
    } finally {
      setReordering(false);
    }
  }

  async function movePoint(pointId: string, direction: -1 | 1) {
    if (reordering) return;
    const ids = sorted.map((point) => point.id);
    const from = ids.indexOf(pointId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await applyOrder(ids);
  }

  return (
    <>
      {sorted.map((point, index) => (
        <PointBranch
          chapterId={chapterId}
          first={index === 0}
          key={point.id}
          last={index === sorted.length - 1}
          onMove={movePoint}
          parentPointId={parentPointId}
          point={point}
          pointDepth={pointDepth}
          reordering={reordering}
          report={report}
          siblingIds={sorted.map((item) => item.id)}
          sortMode={sortMode}
          subjectCode={subjectCode}
          today={today}
          tree={tree}
        />
      ))}
    </>
  );
}

/** 单个知识点分支：行（拖拽三态——上前插/下后插/中间成为子点）+ 子点递归 */
function PointBranch({ point, chapterId, parentPointId, pointDepth, siblingIds, first, last, reordering, onMove, subjectCode, today, sortMode, tree, report }: {
  point: PointNode;
  chapterId: string;
  parentPointId: string | null;
  pointDepth: number;
  siblingIds: string[];
  first: boolean;
  last: boolean;
  reordering: boolean;
  onMove: (pointId: string, direction: -1 | 1) => Promise<void>;
  subjectCode: string;
  today: string;
  sortMode: PointSortMode;
  tree: TreeControls;
  report: Report;
}) {
  const [drop, setDrop] = useState<DropEdge | null>(null);
  const [addingChild, setAddingChild] = useState(false);
  const [childTitle, setChildTitle] = useState("");
  const draggable = sortMode === "manual";
  const canNest = pointDepth < MAX_POINT_DEPTH;

  function pointEdgeFor(event: ReactDragEvent<HTMLDivElement>): DropEdge | null {
    if (tree.drag?.kind !== "point") return null;
    return treeDropEdgeFromEvent(event, tree.drag, { id: point.id, depth: pointDepth }, MAX_POINT_DEPTH);
  }

  async function addChild() {
    const title = childTitle.trim();
    if (!title) return;
    const result = await createPointAction({ parentPointId: point.id, title, subjectCode });
    if (result.ok) {
      setChildTitle("");
      setAddingChild(false);
    }
    report(result);
  }

  return (
    <div className="pointBranch" data-depth={pointDepth}>
      <div
        className={`pointDragWrap${drop === "before" && tree.drag ? " dropBefore" : ""}${
          drop === "after" && tree.drag ? " dropAfter" : ""
        }${drop === "inside" && tree.drag ? " dropInside" : ""}`}
        onDragLeave={draggable ? () => setDrop(null) : undefined}
        onDragOver={
          draggable
            ? (event) => {
                const edge = pointEdgeFor(event);
                if (!edge) {
                  setDrop(null);
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDrop((current) => (current === edge ? current : edge));
              }
            : undefined
        }
        onDrop={
          draggable
            ? (event) => {
                event.preventDefault();
                const dragged = tree.drag;
                const edge = pointEdgeFor(event);
                setDrop(null);
                tree.setDrag(null);
                if (dragged?.kind !== "point" || !edge) return;
                if (edge === "inside") {
                  void tree.movePointTo(dragged.id, { parentPointId: point.id }, point.children.length);
                  return;
                }
                const ids = siblingIds.filter((id) => id !== dragged.id);
                const position = ids.indexOf(point.id) + (edge === "after" ? 1 : 0);
                void tree.movePointTo(
                  dragged.id,
                  parentPointId ? { parentPointId } : { chapterId },
                  position,
                );
              }
            : undefined
        }
      >
        {draggable ? (
          <>
            <button
              aria-disabled={reordering || undefined}
              aria-label={`拖拽或用方向键调整“${point.title}”的顺序，拖到其他知识点中部可变为其子点`}
              className="pointDragHandle"
              draggable={!reordering && !tree.treeBusy}
              onDragEnd={() => {
                tree.setDrag(null);
                setDrop(null);
              }}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", point.title);
                attachDragCard(event, point.title, point.children.length ? `${flattenPointTree([point]).length} 个知识点` : undefined);
                tree.setDrag({
                  kind: "point",
                  id: point.id,
                  chapterId,
                  parentPointId,
                  title: point.title,
                  subtreeIds: subtreeIdsOf(point),
                  height: subtreeHeightOf(point),
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  void onMove(point.id, event.key === "ArrowUp" ? -1 : 1);
                }
              }}
              type="button"
            >
              <GripVertical size={13} />
            </button>
            <span className="pointMoveButtons">
              <button
                aria-label={`上移“${point.title}”`}
                disabled={reordering || first}
                onClick={() => void onMove(point.id, -1)}
                type="button"
              >
                <ArrowUp size={11} />
              </button>
              <button
                aria-label={`下移“${point.title}”`}
                disabled={reordering || last}
                onClick={() => void onMove(point.id, 1)}
                type="button"
              >
                <ArrowDown size={11} />
              </button>
            </span>
          </>
        ) : null}
        <PointLine
          onAddChild={canNest ? () => setAddingChild((value) => !value) : undefined}
          point={point}
          report={report}
          subjectCode={subjectCode}
          today={today}
        />
      </div>
      {addingChild ? (
        <div className="chapterCreate subChapterCreate pointChildCreate">
          <input
            autoFocus
            onChange={(event) => setChildTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addChild();
              if (event.key === "Escape") setAddingChild(false);
            }}
            placeholder={`在“${point.title}”下新增子知识点`}
            value={childTitle}
          />
          <button disabled={!childTitle.trim()} onClick={() => void addChild()} type="button">
            <Plus size={14} />
            添加
          </button>
        </div>
      ) : null}
      {point.children.length ? (
        <div className="pointChildren">
          <PointList
            chapterId={chapterId}
            parentPointId={point.id}
            pointDepth={pointDepth + 1}
            points={point.children}
            report={report}
            sortMode={sortMode}
            subjectCode={subjectCode}
            today={today}
            tree={tree}
          />
        </div>
      ) : null}
    </div>
  );
}
