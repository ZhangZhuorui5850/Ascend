"use client";

import { useState, type DragEvent as ReactDragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  CornerUpLeft,
  Crosshair,
  FolderPlus,
  Plus,
  Trash2,
} from "lucide-react";
import {
  createChapterAction,
  createPointAction,
  deleteChapterAction,
  moveChapterAction,
  renameChapterAction,
} from "@/app/actions/knowledge";
import { MAX_CHAPTER_DEPTH, type ChapterWithPoints } from "@/lib/repo/knowledge";
import type { Tier } from "@/lib/types";
import {
  countChaptersDeep,
  countPointsDeep,
  DEFAULT_EXPAND_DEPTH,
  subtreeHeightOf,
} from "@/components/chapter-tree";
import { treeDropEdgeFromEvent, type ChapterDrag, type DropEdge } from "@/components/dnd";
import { useFeedback } from "@/components/FeedbackProvider";
import type { PointSortMode } from "@/components/point-sort";
import { PointList } from "./PointTree";
import { TIER_OPTIONS, type Report, type TreeControls } from "./shared";

/** 列表视图的递归章节块：标题行（拖拽/折叠/升降级/聚焦/删除）+ 直属知识点 + 子章节递归 */
export function ChapterBlock({ chapter, subjectCode, first, last, today, report, sortMode, depth, tree, canPromote, promoteTargetId, siblingIds }: {
  chapter: ChapterWithPoints;
  subjectCode: string;
  first: boolean;
  last: boolean;
  today: string;
  report: Report;
  sortMode: PointSortMode;
  depth: number;
  tree: TreeControls;
  canPromote: boolean;
  promoteTargetId: string | null;
  siblingIds: string[];
}) {
  const { confirm, notify } = useFeedback();
  const [pointTitle, setPointTitle] = useState("");
  const [pointTier, setPointTier] = useState<Tier>("g");
  const [chapterDrop, setChapterDrop] = useState<DropEdge | null>(null);
  const [headDrop, setHeadDrop] = useState(false);
  const [zoneDrop, setZoneDrop] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [subTitle, setSubTitle] = useState("");
  const defaultCollapsed = depth >= DEFAULT_EXPAND_DEPTH;
  const collapsed = tree.collapsedMap[chapter.id] ?? defaultCollapsed;
  const deepPoints = countPointsDeep(chapter);
  const subChapterCount = countChaptersDeep(chapter) - 1;
  const canNestDeeper = depth < MAX_CHAPTER_DEPTH;

  async function addSubChapter() {
    const title = subTitle.trim();
    if (!title) return;
    const result = await createChapterAction({ subjectCode, title, parentId: chapter.id });
    if (result.ok) {
      setSubTitle("");
      setAddingSub(false);
    }
    report(result);
  }

  /** 章节拖拽命中：null = 非法目标（自己/自己的子树/超深） */
  function chapterEdgeFor(event: ReactDragEvent<HTMLDivElement>, dragged: ChapterDrag): DropEdge | null {
    return treeDropEdgeFromEvent(event, dragged, { id: chapter.id, depth }, MAX_CHAPTER_DEPTH);
  }

  async function addPoint() {
    const title = pointTitle.trim();
    if (!title) return;
    const result = await createPointAction({ chapterId: chapter.id, title, tier: pointTier, subjectCode });
    if (result.ok) setPointTitle("");
    report(result);
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
    <article className="chapterBlock" data-depth={depth}>
      <div
        className={`chapterHead${
          (headDrop || chapterDrop === "inside") && tree.drag ? " dropInside" : ""
        }${chapterDrop === "before" && tree.drag ? " dropBefore" : ""}${chapterDrop === "after" && tree.drag ? " dropAfter" : ""}`}
        onDragOver={(event) => {
          if (tree.drag?.kind === "point") {
            // 已经是本章直属知识点时不响应；嵌套子点拖到章节头 = 提升为本章直属
            if (tree.drag.chapterId === chapter.id && tree.drag.parentPointId === null) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setHeadDrop(true);
            return;
          }
          if (tree.drag?.kind !== "chapter") return;
          const edge = chapterEdgeFor(event, tree.drag);
          if (!edge) {
            setChapterDrop(null);
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setChapterDrop((current) => (current === edge ? current : edge));
        }}
        onDragLeave={() => {
          setHeadDrop(false);
          setChapterDrop(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          const dragged = tree.drag;
          setHeadDrop(false);
          setChapterDrop(null);
          tree.setDrag(null);
          if (dragged?.kind === "point") {
            if (dragged.chapterId !== chapter.id || dragged.parentPointId !== null) {
              void tree.movePointTo(dragged.id, { chapterId: chapter.id }, chapter.points.length);
            }
            return;
          }
          if (dragged?.kind !== "chapter") return;
          const edge = chapterEdgeFor(event, dragged);
          if (!edge) return;
          if (edge === "inside") {
            void tree.moveChapterTo(dragged.id, chapter.id, chapter.children.length);
            return;
          }
          const ids = siblingIds.filter((id) => id !== dragged.id);
          const position = ids.indexOf(chapter.id) + (edge === "after" ? 1 : 0);
          void tree.moveChapterTo(dragged.id, chapter.parent_id, position);
        }}
      >
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? "展开章节" : "折叠章节"}
          className="chapterCollapse"
          onClick={() => tree.toggleCollapsed(chapter.id, defaultCollapsed)}
          type="button"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <input
          aria-label="章节标题"
          defaultValue={chapter.title}
          key={chapter.title}
          onBlur={(event) => {
            const title = event.target.value.trim();
            if (title && title !== chapter.title) {
              void renameChapterAction({ id: chapter.id, title, subjectCode }).then(report);
            }
          }}
        />
        <span className="chapterCount">
          {deepPoints} 个知识点{subChapterCount ? ` · ${subChapterCount} 个子章节` : ""}
        </span>
        <div className="chapterTools">
          <button
            aria-label="上移"
            disabled={first || tree.treeBusy}
            onClick={() => void moveChapterAction({ id: chapter.id, direction: "up", subjectCode }).then(report)}
            type="button"
          >
            <ArrowUp size={14} />
          </button>
          <button
            aria-label="下移"
            disabled={last || tree.treeBusy}
            onClick={() => void moveChapterAction({ id: chapter.id, direction: "down", subjectCode }).then(report)}
            type="button"
          >
            <ArrowDown size={14} />
          </button>
          {canPromote ? (
            <button
              aria-label="提升一层（移出当前父章节）"
              disabled={tree.treeBusy}
              onClick={() => void tree.nestChapter(chapter.id, promoteTargetId)}
              title="提升一层"
              type="button"
            >
              <CornerUpLeft size={14} />
            </button>
          ) : null}
          {!first && depth + subtreeHeightOf(chapter) <= MAX_CHAPTER_DEPTH ? (
            <button
              aria-label={`降级为上一章节的子章节`}
              disabled={tree.treeBusy}
              onClick={() => void tree.nestChapter(chapter.id, siblingIds[siblingIds.indexOf(chapter.id) - 1] ?? null)}
              title="降级为上一章节的子章节"
              type="button"
            >
              <CornerDownRight size={14} />
            </button>
          ) : null}
          {canNestDeeper ? (
            <button
              aria-label="添加子章节"
              onClick={() => setAddingSub((value) => !value)}
              title="添加子章节"
              type="button"
            >
              <FolderPlus size={14} />
            </button>
          ) : null}
          <button
            aria-label={`聚焦“${chapter.title}”子树`}
            onClick={() => tree.focusChapter(chapter.id)}
            title="聚焦此章节"
            type="button"
          >
            <Crosshair size={14} />
          </button>
          <button aria-label="删除章节" className="iconDanger" onClick={() => void removeChapter()} type="button">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {addingSub ? (
        <div className="chapterCreate subChapterCreate">
          <input
            autoFocus
            onChange={(event) => setSubTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addSubChapter();
              if (event.key === "Escape") setAddingSub(false);
            }}
            placeholder={`在“${chapter.title}”下新增子章节`}
            value={subTitle}
          />
          <button disabled={!subTitle.trim()} onClick={() => void addSubChapter()} type="button">
            <Plus size={14} />
            添加
          </button>
        </div>
      ) : null}

      {collapsed ? null : (
      <>
      <div className="pointList">
        <PointList
          chapterId={chapter.id}
          parentPointId={null}
          pointDepth={1}
          points={chapter.points}
          report={report}
          sortMode={sortMode}
          subjectCode={subjectCode}
          today={today}
          tree={tree}
        />
        {!chapter.points.length ? (
          tree.drag?.kind === "point" ? (
            <div
              className={zoneDrop ? "pointDropZone dropInside" : "pointDropZone"}
              onDragLeave={() => setZoneDrop(false)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setZoneDrop(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setZoneDrop(false);
                const dragged = tree.drag;
                tree.setDrag(null);
                if (dragged?.kind === "point") void tree.movePointTo(dragged.id, { chapterId: chapter.id }, 0);
              }}
            >
              拖到这里，移入本章
            </div>
          ) : (
            <p className="empty inset">本章还没有知识点。</p>
          )
        ) : null}
      </div>

      <div className="pointCreate">
        <input
          value={pointTitle}
          onChange={(event) => setPointTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void addPoint();
          }}
          placeholder="添加知识点"
        />
        <select onChange={(event) => setPointTier(event.target.value as Tier)} value={pointTier} aria-label="目标层级">
          {TIER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              目标：{option.label}
            </option>
          ))}
        </select>
        <button disabled={!pointTitle.trim()} onClick={() => void addPoint()} type="button" aria-label="添加知识点">
          <Plus size={14} />
        </button>
      </div>

      {chapter.children.length ? (
        <div className="chapterChildren">
          {chapter.children.map((child, index) => (
            <ChapterBlock
              canPromote
              chapter={child}
              depth={depth + 1}
              first={index === 0}
              key={child.id}
              last={index === chapter.children.length - 1}
              promoteTargetId={chapter.parent_id}
              report={report}
              siblingIds={chapter.children.map((item) => item.id)}
              sortMode={sortMode}
              subjectCode={subjectCode}
              today={today}
              tree={tree}
            />
          ))}
        </div>
      ) : null}
      </>
      )}
    </article>
  );
}
