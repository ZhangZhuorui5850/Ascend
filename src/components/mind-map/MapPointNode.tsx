"use client";

import { useState, type DragEvent as ReactDragEvent } from "react";
import { ChevronDown, ChevronRight, Plus, Star, Trash2 } from "lucide-react";
import { createPointAction, deletePointAction, updatePointAction } from "@/app/actions/knowledge";
import { flattenPointTree, MAX_POINT_DEPTH, type PointNode } from "@/lib/repo/knowledge";
import { subtreeHeightOf, subtreeIdsOf } from "@/components/chapter-tree";
import { attachDragCard, treeDropEdgeFromEvent, type DropEdge } from "@/components/dnd";
import { useFeedback } from "@/components/FeedbackProvider";
import { sortPointsForView, type PointSortMode } from "@/components/point-sort";
import { RichText } from "@/components/RichText";
import type { PointMoveTarget, Report, TreeControls } from "@/components/subject-workbench/shared";
import { MapAddCard } from "./MapAddCard";

/** 导图里的知识点卡片：单击选中进右侧面板，双击改名，拖拽三态（前插/后插/成为子点），子点递归 */
export function MapPointNode({ point, chapterId, parentPointId, pointDepth, parentKey, siblingPointIds, subjectCode, today, sortMode, tree, report, selectedId, onSelect }: {
  point: PointNode;
  chapterId: string | null;
  parentPointId: string | null;
  /** 知识点层级（章节直属 = 1），用于嵌套上限判断 */
  pointDepth: number;
  parentKey: string;
  siblingPointIds: string[];
  subjectCode: string;
  today: string;
  sortMode: PointSortMode;
  tree: TreeControls;
  report: Report;
  selectedId: string | null;
  onSelect: (pointId: string) => void;
}) {
  const { confirm, notify } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [drop, setDrop] = useState<DropEdge | null>(null);
  const due = Boolean(point.next_review && point.next_review <= today);
  const draggable = sortMode === "manual" && !editing && !tree.treeBusy;
  const nodeKey = `p:${point.id}`;
  const collapsed = tree.collapsedMap[point.id] ?? false;
  const hasChildren = point.children.length > 0;
  const showChildren = (!collapsed && hasChildren) || addingChild;
  const deepCount = flattenPointTree([point]).length - 1;
  // 未分章顶层组没有可落库的排序目标，只允许「成为子点」
  const looseTop = chapterId === null && parentPointId === null;
  const sortedChildren = sortPointsForView(point.children, sortMode);

  function edgeFor(event: ReactDragEvent<HTMLDivElement>): DropEdge | null {
    if (tree.drag?.kind !== "point" || sortMode !== "manual") return null;
    const edge = treeDropEdgeFromEvent(event, tree.drag, { id: point.id, depth: pointDepth }, MAX_POINT_DEPTH);
    if (edge && edge !== "inside" && looseTop) return null;
    return edge;
  }

  async function removePoint() {
    const confirmed = await confirm({
      title: `删除知识点“${point.title}”？`,
      description: `${deepCount ? `其中 ${deepCount} 个子知识点会一并删除，` : ""}复习和错题记录会保留，但会解除关联。`,
      confirmLabel: "删除知识点",
      danger: true,
    });
    if (!confirmed) return;
    const result = await deletePointAction({ id: point.id, subjectCode });
    report(result);
    if (result.ok) notify("知识点已删除");
  }

  return (
    <div className="mapNode">
      <div
        className={`mapCard mapPointCard${drop === "before" ? " dropBefore" : ""}${drop === "after" ? " dropAfter" : ""}${
          drop === "inside" ? " dropInside" : ""
        }${selectedId === point.id ? " selected" : ""}`}
        data-map-node={nodeKey}
        data-map-parent={parentKey}
        data-tier={point.tier}
        aria-current={selectedId === point.id ? "true" : undefined}
        draggable={draggable}
        onClick={() => onSelect(point.id)}
        onDoubleClick={() => setEditing(true)}
        onDragEnd={() => tree.setDrag(null)}
        onDragLeave={() => setDrop(null)}
        onDragOver={(event) => {
          const edge = edgeFor(event);
          if (!edge) {
            setDrop(null);
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          setDrop((current) => (current === edge ? current : edge));
        }}
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", point.title);
          attachDragCard(event, point.title, deepCount ? `${deepCount + 1} 个知识点` : undefined);
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
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const dragged = tree.drag;
          const edge = edgeFor(event);
          setDrop(null);
          tree.setDrag(null);
          if (dragged?.kind !== "point" || !edge) return;
          if (edge === "inside") {
            void tree.movePointTo(dragged.id, { parentPointId: point.id }, point.children.length);
            return;
          }
          const ids = siblingPointIds.filter((id) => id !== dragged.id);
          const position = ids.indexOf(point.id) + (edge === "after" ? 1 : 0);
          const target: PointMoveTarget = parentPointId ? { parentPointId } : { chapterId };
          void tree.movePointTo(dragged.id, target, position);
        }}
      >
        <span aria-label={point.tier_name} className="mapTierDot" data-tier={point.tier} />
        {editing ? (
          <input
            aria-label="知识点标题"
            autoFocus
            defaultValue={point.title}
            onBlur={(event) => {
              setEditing(false);
              const title = event.target.value.trim();
              if (title && title !== point.title) {
                void updatePointAction({ id: point.id, title, subjectCode }).then(report);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
            }}
          />
        ) : (
          <span className="mapCardTitle" title="单击查看详情，双击重命名">
            <RichText text={point.title} />
          </span>
        )}
        {point.exam ? <Star aria-label="真题考点" className="mapExamStar" fill="currentColor" size={11} /> : null}
        {due ? <small className="mapDue">待复习</small> : <small className="mapMastery">{point.mastery}</small>}
        {hasChildren ? (
          <button
            aria-expanded={!collapsed}
            aria-label={collapsed ? `展开“${point.title}”` : `折叠“${point.title}”`}
            className="mapCollapse"
            onClick={(event) => {
              event.stopPropagation();
              tree.toggleCollapsed(point.id, false);
            }}
            type="button"
          >
            {collapsed ? (
              <>
                <ChevronRight size={12} />
                <small>{deepCount}</small>
              </>
            ) : (
              <ChevronDown size={12} />
            )}
          </button>
        ) : null}
        <div className="mapTools">
          {pointDepth < MAX_POINT_DEPTH ? (
            <button
              aria-label={`为“${point.title}”添加子知识点`}
              onClick={(event) => {
                event.stopPropagation();
                if (collapsed) tree.toggleCollapsed(point.id, false);
                setAddingChild(true);
              }}
              title="添加子知识点"
              type="button"
            >
              <Plus size={12} />
            </button>
          ) : null}
          <button
            aria-label="删除知识点"
            className="iconDanger"
            onClick={(event) => {
              event.stopPropagation();
              void removePoint();
            }}
            type="button"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {showChildren ? (
        <div className="mapChildren">
          {collapsed
            ? null
            : sortedChildren.map((child) => (
                <MapPointNode
                  chapterId={chapterId}
                  key={child.id}
                  onSelect={onSelect}
                  parentKey={nodeKey}
                  parentPointId={point.id}
                  point={child}
                  pointDepth={pointDepth + 1}
                  report={report}
                  selectedId={selectedId}
                  siblingPointIds={sortedChildren.map((item) => item.id)}
                  sortMode={sortMode}
                  subjectCode={subjectCode}
                  today={today}
                  tree={tree}
                />
              ))}
          {addingChild ? (
            <MapAddCard
              onCancel={() => setAddingChild(false)}
              onSubmit={async (title) => {
                const result = await createPointAction({ parentPointId: point.id, title, subjectCode });
                if (result.ok) setAddingChild(false);
                report(result);
              }}
              parentKey={nodeKey}
              placeholder="新子知识点标题"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
