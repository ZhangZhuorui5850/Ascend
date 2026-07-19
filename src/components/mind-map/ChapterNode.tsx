"use client";

import { useState, type DragEvent as ReactDragEvent } from "react";
import { ChevronDown, ChevronRight, Crosshair, FolderPlus, Plus, Trash2 } from "lucide-react";
import {
  createChapterAction,
  createPointAction,
  deleteChapterAction,
  renameChapterAction,
} from "@/app/actions/knowledge";
import { MAX_CHAPTER_DEPTH, type ChapterWithPoints } from "@/lib/repo/knowledge";
import {
  countChaptersDeep,
  countPointsDeep,
  DEFAULT_EXPAND_DEPTH,
  subtreeHeightOf,
  subtreeIdsOf,
} from "@/components/chapter-tree";
import { attachDragCard, treeDropEdgeFromEvent, type DropEdge } from "@/components/dnd";
import { useFeedback } from "@/components/FeedbackProvider";
import { sortPointsForView, type PointSortMode } from "@/components/point-sort";
import { RichText } from "@/components/RichText";
import type { Report, TreeControls } from "@/components/subject-workbench/shared";
import { MapAddCard } from "./MapAddCard";
import { MapPointNode } from "./MapPointNode";

/** 导图里的章节卡片：双击改名、折叠计数、拖拽三态，递归渲染直属知识点与子章节 */
export function ChapterNode({ chapter, depth, visualDepth, parentKey, siblingIds, subjectCode, today, sortMode, tree, report, selectedId, onSelect }: {
  chapter: ChapterWithPoints;
  /** 真实层级深度（聚焦子树时从聚焦章节的实际深度起算），用于层级上限判断 */
  depth: number;
  /** 视觉深度（当前视图内从 1 起算），只决定默认折叠 */
  visualDepth: number;
  parentKey: string;
  siblingIds: string[];
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
  const [addingChapter, setAddingChapter] = useState(false);
  const [addingPoint, setAddingPoint] = useState(false);
  const [drop, setDrop] = useState<DropEdge | null>(null);
  const defaultCollapsed = visualDepth >= DEFAULT_EXPAND_DEPTH;
  const collapsed = tree.collapsedMap[chapter.id] ?? defaultCollapsed;
  const sortedPoints = sortPointsForView(chapter.points, sortMode);
  const deepPoints = countPointsDeep(chapter);
  const subChapterCount = countChaptersDeep(chapter) - 1;
  const hasChildren = chapter.points.length > 0 || chapter.children.length > 0;
  const showChildren = (!collapsed && hasChildren) || addingChapter || addingPoint;
  const nodeKey = `c:${chapter.id}`;

  function expandIfCollapsed() {
    if (collapsed) tree.toggleCollapsed(chapter.id, defaultCollapsed);
  }

  function edgeFor(event: ReactDragEvent<HTMLDivElement>): DropEdge | null {
    if (tree.drag?.kind === "point") {
      // 已是本章直属知识点时不响应；嵌套子点拖到章节卡 = 提升为本章直属
      return tree.drag.chapterId === chapter.id && tree.drag.parentPointId === null ? null : "inside";
    }
    if (tree.drag?.kind !== "chapter") return null;
    return treeDropEdgeFromEvent(event, tree.drag, { id: chapter.id, depth }, MAX_CHAPTER_DEPTH);
  }

  async function removeChapter() {
    const confirmed = await confirm({
      title: `删除章节“${chapter.title}”？`,
      description: `其中 ${deepPoints} 个知识点${subChapterCount ? `、${subChapterCount} 个子章节` : ""}会一并删除，学习记录会保留。`,
      confirmLabel: "删除章节",
      danger: true,
    });
    if (!confirmed) return;
    const result = await deleteChapterAction({ id: chapter.id, subjectCode });
    report(result);
    if (result.ok) notify("章节已删除");
  }

  return (
    <div className="mapNode">
      <div
        className={`mapCard mapChapterCard${drop === "inside" ? " dropInside" : ""}${drop === "before" ? " dropBefore" : ""}${drop === "after" ? " dropAfter" : ""}`}
        data-map-node={nodeKey}
        data-map-parent={parentKey}
        draggable={!editing && !tree.treeBusy}
        onDoubleClick={() => setEditing(true)}
        onDragEnd={() => tree.setDrag(null)}
        onDragLeave={() => setDrop(null)}
        onDragOver={(event) => {
          if (!tree.drag) return;
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
          event.dataTransfer.setData("text/plain", chapter.title);
          attachDragCard(event, chapter.title, `${deepPoints} 个知识点`);
          tree.setDrag({
            kind: "chapter",
            id: chapter.id,
            title: chapter.title,
            subtreeIds: subtreeIdsOf(chapter),
            height: subtreeHeightOf(chapter),
          });
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const dragged = tree.drag;
          const edge = edgeFor(event);
          setDrop(null);
          tree.setDrag(null);
          if (!dragged || !edge) return;
          if (dragged.kind === "point") {
            void tree.movePointTo(dragged.id, { chapterId: chapter.id }, chapter.points.length);
            return;
          }
          if (edge === "inside") {
            void tree.moveChapterTo(dragged.id, chapter.id, chapter.children.length);
            return;
          }
          const ids = siblingIds.filter((id) => id !== dragged.id);
          const position = ids.indexOf(chapter.id) + (edge === "after" ? 1 : 0);
          void tree.moveChapterTo(dragged.id, chapter.parent_id, position);
        }}
      >
        {editing ? (
          <input
            aria-label="章节标题"
            autoFocus
            defaultValue={chapter.title}
            onBlur={(event) => {
              setEditing(false);
              const title = event.target.value.trim();
              if (title && title !== chapter.title) {
                void renameChapterAction({ id: chapter.id, title, subjectCode }).then(report);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
            }}
          />
        ) : (
          <span className="mapCardTitle" title="双击重命名">
            <RichText text={chapter.title} />
          </span>
        )}
        {hasChildren ? (
          <button
            aria-expanded={!collapsed}
            aria-label={collapsed ? `展开“${chapter.title}”` : `折叠“${chapter.title}”`}
            className="mapCollapse"
            onClick={() => tree.toggleCollapsed(chapter.id, defaultCollapsed)}
            type="button"
          >
            {collapsed ? (
              <>
                <ChevronRight size={12} />
                <small>{deepPoints}</small>
              </>
            ) : (
              <ChevronDown size={12} />
            )}
          </button>
        ) : null}
        <div className="mapTools">
          <button
            aria-label={`在“${chapter.title}”下添加知识点`}
            onClick={() => {
              expandIfCollapsed();
              setAddingPoint(true);
            }}
            title="添加知识点"
            type="button"
          >
            <Plus size={13} />
          </button>
          {depth < MAX_CHAPTER_DEPTH ? (
            <button
              aria-label={`在“${chapter.title}”下添加子章节`}
              onClick={() => {
                expandIfCollapsed();
                setAddingChapter(true);
              }}
              title="添加子章节"
              type="button"
            >
              <FolderPlus size={13} />
            </button>
          ) : null}
          <button
            aria-label={`聚焦“${chapter.title}”子树`}
            onClick={() => tree.focusChapter(chapter.id)}
            title="聚焦此章节"
            type="button"
          >
            <Crosshair size={13} />
          </button>
          <button aria-label="删除章节" className="iconDanger" onClick={() => void removeChapter()} type="button">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {showChildren ? (
        <div className="mapChildren">
          {collapsed
            ? null
            : sortedPoints.map((point) => (
                <MapPointNode
                  chapterId={chapter.id}
                  key={point.id}
                  onSelect={onSelect}
                  parentKey={nodeKey}
                  parentPointId={null}
                  point={point}
                  pointDepth={1}
                  report={report}
                  selectedId={selectedId}
                  siblingPointIds={sortedPoints.map((item) => item.id)}
                  sortMode={sortMode}
                  subjectCode={subjectCode}
                  today={today}
                  tree={tree}
                />
              ))}
          {addingPoint ? (
            <MapAddCard
              onCancel={() => setAddingPoint(false)}
              onSubmit={async (title) => {
                const result = await createPointAction({ chapterId: chapter.id, title, tier: "g", subjectCode });
                if (result.ok) setAddingPoint(false);
                report(result);
              }}
              parentKey={nodeKey}
              placeholder="新知识点标题"
            />
          ) : null}
          {collapsed
            ? null
            : chapter.children.map((child) => (
                <ChapterNode
                  chapter={child}
                  depth={depth + 1}
                  key={child.id}
                  onSelect={onSelect}
                  parentKey={nodeKey}
                  report={report}
                  selectedId={selectedId}
                  siblingIds={chapter.children.map((item) => item.id)}
                  sortMode={sortMode}
                  subjectCode={subjectCode}
                  today={today}
                  tree={tree}
                  visualDepth={visualDepth + 1}
                />
              ))}
          {addingChapter ? (
            <MapAddCard
              onCancel={() => setAddingChapter(false)}
              onSubmit={async (title) => {
                const result = await createChapterAction({ subjectCode, title, parentId: chapter.id });
                if (result.ok) setAddingChapter(false);
                report(result);
              }}
              parentKey={nodeKey}
              placeholder="新子章节标题"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
