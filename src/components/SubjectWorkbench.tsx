"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  CornerUpLeft,
  Crosshair,
  FolderPlus,
  GripVertical,
  Loader2,
  ListTree,
  Network,
  Plus,
  Settings2,
  Star,
  Trash2,
} from "lucide-react";
import {
  createChapterAction,
  createPointAction,
  deleteChapterAction,
  deletePointAction,
  deleteSubjectAction,
  getPointDetailAction,
  moveChapterAction,
  moveChapterToPositionAction,
  movePointAction,
  renameChapterAction,
  renameSubjectAction,
  reorderPointsAction,
  reparentChapterAction,
  updatePointAction,
} from "@/app/actions/knowledge";
import {
  MAX_CHAPTER_DEPTH,
  MAX_POINT_DEPTH,
  flattenChapterPoints,
  flattenPointTree,
  type ChapterWithPoints,
  type PointDetail,
  type PointNode,
  type PointRow,
  type SubjectRow,
  type SubjectTrack,
} from "@/lib/repo/knowledge";
import type { Tier } from "@/lib/types";
import {
  countChaptersDeep,
  countPointsDeep,
  DEFAULT_EXPAND_DEPTH,
  findChapterPath,
  subtreeHeightOf,
  subtreeIdsOf,
} from "@/components/chapter-tree";
import { useFeedback } from "@/components/FeedbackProvider";
import { assetFileUrl } from "@/lib/asset-url";
import { MindMapView } from "@/components/MindMapView";
import { POINT_SORT_MODES, sortPointsForView, type PointSortMode } from "@/components/point-sort";
import { RichText } from "@/components/RichText";
import { useOptimisticValue } from "@/components/useOptimisticValue";
import { PointRecallEditor } from "@/components/PointRecallEditor";
import { CreateTrainingTaskButton } from "@/components/CreateTrainingTaskButton";
import {
  attachDragCard,
  treeDropEdgeFromEvent,
  type ChapterDrag,
  type DragPayload,
  type DropEdge,
} from "@/components/dnd";

type SubjectWorkbenchProps = {
  subject: SubjectRow;
  chapters: ChapterWithPoints[];
  loosePoints: PointNode[];
  today: string;
  focusId?: string | null;
  view?: "list" | "map";
};

/** 移动知识点的目标：挂到章节直属层，或成为某个知识点的子点 */
export type PointMoveTarget = { chapterId?: string | null; parentPointId?: string | null };

export const TIER_OPTIONS: Array<{ value: Tier; label: string }> = [
  { value: "r", label: "精通" },
  { value: "y", label: "掌握" },
  { value: "g", label: "了解" },
];

/** 章节树共享的操作句柄：折叠、拖拽、聚焦，列表/导图两个视图共用 */
export type TreeControls = {
  collapsedMap: Record<string, boolean>;
  toggleCollapsed: (id: string, defaultCollapsed: boolean) => void;
  drag: DragPayload | null;
  setDrag: (payload: DragPayload | null) => void;
  nestChapter: (childId: string, parentId: string | null) => Promise<void>;
  moveChapterTo: (id: string, parentId: string | null, index: number) => Promise<void>;
  movePointTo: (pointId: string, target: PointMoveTarget, index: number) => Promise<void>;
  treeBusy: boolean;
  focusChapter: (id: string | null) => void;
};

export function SubjectWorkbench({ subject, chapters, loosePoints, today, focusId = null, view = "list" }: SubjectWorkbenchProps) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [chapterTitle, setChapterTitle] = useState("");
  const [sortMode, setSortMode] = useState<PointSortMode>("manual");
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [treeBusy, setTreeBusy] = useState(false);
  useEffect(() => {
    if (drag) document.body.setAttribute("data-dragging", drag.kind);
    else document.body.removeAttribute("data-dragging");
    return () => document.body.removeAttribute("data-dragging");
  }, [drag]);
  useEffect(() => {
    const saved = localStorage.getItem(`zgca-point-sort:${subject.code}`);
    const savedCollapsed = localStorage.getItem(`zgca-chapter-collapsed:${subject.code}`);
    window.setTimeout(() => {
      if (saved === "manual" || saved === "time" || saved === "importance") setSortMode(saved);
      if (savedCollapsed) {
        try {
          setCollapsedMap(JSON.parse(savedCollapsed) as Record<string, boolean>);
        } catch {
          /* 坏数据直接忽略 */
        }
      }
    }, 0);
  }, [subject.code]);
  function changeSortMode(mode: PointSortMode) {
    setSortMode(mode);
    localStorage.setItem(`zgca-point-sort:${subject.code}`, mode);
  }

  function report(result: { ok: boolean; error?: string }) {
    if (result.ok) router.refresh();
    else notify(result.error || "操作失败", "error");
  }

  function toggleCollapsed(id: string, defaultCollapsed: boolean) {
    setCollapsedMap((current) => {
      const effective = current[id] ?? defaultCollapsed;
      const next = { ...current, [id]: !effective };
      localStorage.setItem(`zgca-chapter-collapsed:${subject.code}`, JSON.stringify(next));
      return next;
    });
  }

  async function nestChapter(childId: string, parentId: string | null) {
    if (treeBusy || childId === parentId) return;
    setTreeBusy(true);
    try {
      report(await reparentChapterAction({ id: childId, parentId, subjectCode: subject.code }));
    } catch {
      report({ ok: false, error: "网络异常，章节移动未保存" });
    } finally {
      setTreeBusy(false);
    }
  }

  async function moveChapterTo(id: string, parentId: string | null, index: number) {
    if (treeBusy || id === parentId) return;
    setTreeBusy(true);
    try {
      report(await moveChapterToPositionAction({ id, parentId, index, subjectCode: subject.code }));
    } catch {
      report({ ok: false, error: "网络异常，章节移动未保存" });
    } finally {
      setTreeBusy(false);
    }
  }

  async function movePointTo(pointId: string, target: PointMoveTarget, index: number) {
    if (treeBusy) return;
    setTreeBusy(true);
    try {
      report(await movePointAction({
        pointId,
        targetChapterId: target.chapterId ?? null,
        targetParentPointId: target.parentPointId ?? null,
        index,
        subjectCode: subject.code,
      }));
    } catch {
      report({ ok: false, error: "网络异常，移动未保存" });
    } finally {
      setTreeBusy(false);
    }
  }

  /** 聚焦/切换视图都走 URL，保持另一个参数不丢 */
  function navigate(nextFocus: string | null, nextView: "list" | "map") {
    const params = new URLSearchParams();
    if (nextFocus) params.set("focus", nextFocus);
    if (nextView === "map") params.set("view", "map");
    const query = params.toString();
    router.push(`/subjects/${subject.code}${query ? `?${query}` : ""}`);
  }

  function focusChapter(id: string | null) {
    navigate(id, view);
  }

  const tree: TreeControls = {
    collapsedMap,
    toggleCollapsed,
    drag,
    setDrag,
    nestChapter,
    moveChapterTo,
    movePointTo,
    treeBusy,
    focusChapter,
  };

  const focusPath = focusId ? findChapterPath(chapters, focusId) : null;
  const focusTarget = focusPath ? focusPath[focusPath.length - 1] : null;

  async function addChapter() {
    const title = chapterTitle.trim();
    if (!title) return;
    const result = await createChapterAction({ subjectCode: subject.code, title });
    if (result.ok) setChapterTitle("");
    report(result);
  }

  async function removeSubject() {
    const chapterCount = chapters.reduce((count, chapter) => count + countChaptersDeep(chapter), 0);
    const pointCount = flattenChapterPoints(chapters).length + flattenPointTree(loosePoints).length;
    const confirmed = await confirm({
      title: `删除 ${subject.code} · ${subject.name}？`,
      description: `将删除 ${chapterCount} 个章节、${pointCount} 个知识点。学习记录和资料会保留，但会解除关联。`,
      confirmLabel: "删除科目",
      danger: true,
    });
    if (!confirmed) return;
    const result = await deleteSubjectAction(subject.code);
    if (result.ok) {
      notify("科目已删除");
      router.push("/subjects");
      router.refresh();
    } else {
      notify(result.error || "删除失败", "error");
    }
  }

  return (
    <section className="card subjectWorkbench" aria-label="章节与知识点管理">
      <div className="workbenchHeader">
        <div className="workbenchHeading">
          <span className="eyebrow">知识结构</span>
          <h2>从目录进入每个知识点</h2>
          <p>整理章节关系，选中知识点后完善回忆卡与学习证据。</p>
        </div>
        <div className="workbenchToolbar">
        <div aria-label="视图" className="sortModeSwitch viewSwitch" role="group">
          <button
            aria-pressed={view === "list"}
            className={view === "list" ? "active" : undefined}
            onClick={() => navigate(focusId, "list")}
            type="button"
          >
            <ListTree size={14} />
            目录
          </button>
          <button
            aria-pressed={view === "map"}
            className={view === "map" ? "active" : undefined}
            onClick={() => navigate(focusId, "map")}
            type="button"
          >
            <Network size={14} />
            图谱
          </button>
        </div>
        <div aria-label="知识点排序方式" className="sortModeSwitch sortSwitch" role="group">
          {POINT_SORT_MODES.map((option) => (
            <button
              aria-pressed={sortMode === option.value}
              className={sortMode === option.value ? "active" : undefined}
              key={option.value}
              onClick={() => changeSortMode(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <details className="subjectSettings">
          <summary aria-label="打开科目设置">
            <Settings2 size={15} />
            科目设置
          </summary>
          <div className="subjectSettingsPopover">
            <label>
              <span>科目名称</span>
              <input
                aria-label="科目名称"
                defaultValue={subject.name}
                key={`name-${subject.name}`}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && name !== subject.name) {
                    void renameSubjectAction({ code: subject.code, name }).then(report);
                  }
                }}
              />
            </label>
            <label>
              <span>考试形式</span>
              <select
                aria-label="科目类型"
                onChange={(event) =>
                  void renameSubjectAction({
                    code: subject.code,
                    name: subject.name,
                    track: event.target.value as SubjectTrack,
                  }).then(report)
                }
                value={subject.track}
              >
                <option value="written">笔试</option>
                <option value="machine">机试</option>
              </select>
            </label>
            <button className="subjectDeleteButton" onClick={() => void removeSubject()} type="button">
              <Trash2 size={14} />
              删除科目
            </button>
          </div>
        </details>
        </div>
      </div>

      {focusTarget && focusPath ? (
        <nav aria-label="聚焦路径" className="focusBreadcrumb">
          <button onClick={() => focusChapter(null)} type="button">{subject.name}</button>
          {focusPath.map((node, index) => (
            <span key={node.id}>
              <span aria-hidden> / </span>
              {index === focusPath.length - 1 ? (
                <strong><RichText text={node.title} /></strong>
              ) : (
                <button onClick={() => focusChapter(node.id)} type="button"><RichText text={node.title} /></button>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      {focusId && !focusTarget ? <p className="empty">聚焦的章节不存在（可能已被删除），已显示完整目录。</p> : null}

      {view === "map" ? (
        <MindMapView
          allowRootAdd={!focusTarget}
          baseDepth={focusPath ? focusPath.length : 1}
          chapters={focusTarget ? [focusTarget] : chapters}
          loosePoints={focusTarget ? [] : loosePoints}
          report={report}
          sortMode={sortMode}
          subject={subject}
          today={today}
          tree={tree}
        />
      ) : focusTarget && focusPath ? (
        <div className="chapterList">
          <ChapterBlock
            canPromote={false}
            chapter={focusTarget}
            depth={1}
            first
            key={focusTarget.id}
            last
            promoteTargetId={null}
            report={report}
            siblingIds={[focusTarget.id]}
            sortMode={sortMode}
            subjectCode={subject.code}
            today={today}
            tree={tree}
          />
        </div>
      ) : (
        <>
          <div className="chapterList">
            {chapters.map((chapter, index) => (
              <ChapterBlock
                canPromote={false}
                chapter={chapter}
                depth={1}
                first={index === 0}
                key={chapter.id}
                last={index === chapters.length - 1}
                promoteTargetId={null}
                report={report}
                siblingIds={chapters.map((item) => item.id)}
                sortMode={sortMode}
                subjectCode={subject.code}
                today={today}
                tree={tree}
              />
            ))}
            {loosePoints.length ? (
              <article className="chapterBlock">
                <div className="chapterHead">
                  <strong className="chapterLoose">未分章知识点</strong>
                </div>
                <div className="pointList">
                  {sortPointsForView(flattenPointTree(loosePoints), sortMode).map((point) => (
                    <PointLine key={point.id} point={point} report={report} subjectCode={subject.code} today={today} />
                  ))}
                </div>
              </article>
            ) : null}
            {!chapters.length && !loosePoints.length ? (
              <p className="empty">还没有章节。先添加一个章节，再往里挂知识点。</p>
            ) : null}
          </div>

          <div className="chapterCreate">
            <input
              value={chapterTitle}
              onChange={(event) => setChapterTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addChapter();
              }}
              placeholder="新增章节，例如：特征值与二次型"
            />
            <button disabled={!chapterTitle.trim()} onClick={() => void addChapter()} type="button">
              <Plus size={15} />
              添加章节
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function ChapterBlock({ chapter, subjectCode, first, last, today, report, sortMode, depth, tree, canPromote, promoteTargetId, siblingIds }: {
  chapter: ChapterWithPoints;
  subjectCode: string;
  first: boolean;
  last: boolean;
  today: string;
  report: (result: { ok: boolean; error?: string }) => void;
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

/** 一个兄弟组（同章节 + 同父点）的知识点列表：组内排序在这里发起，成员各自递归渲染子点 */
function PointList({ points, chapterId, parentPointId, pointDepth, subjectCode, today, sortMode, tree, report }: {
  points: PointNode[];
  chapterId: string;
  parentPointId: string | null;
  /** 组内节点的知识点层级（章节直属 = 1） */
  pointDepth: number;
  subjectCode: string;
  today: string;
  sortMode: PointSortMode;
  tree: TreeControls;
  report: (result: { ok: boolean; error?: string }) => void;
}) {
  const [reordering, setReordering] = useState(false);
  const sorted = sortPointsForView(points, sortMode);

  async function applyOrder(ids: string[]) {
    setReordering(true);
    try {
      report(await reorderPointsAction({ chapterId, parentPointId, subjectCode, orderedIds: ids }));
    } catch {
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
  report: (result: { ok: boolean; error?: string }) => void;
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

function PointLine({ point, subjectCode, today, report, onAddChild }: {
  point: PointRow;
  subjectCode: string;
  today: string;
  report: (result: { ok: boolean; error?: string }) => void;
  onAddChild?: () => void;
}) {
  const { confirm, notify } = useFeedback();
  const due = Boolean(point.next_review && point.next_review <= today);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<PointDetail | null>(null);
  const tierView = useOptimisticValue<Tier>(point.tier);
  const examView = useOptimisticValue<boolean>(Boolean(point.exam));
  const [editingTitle, setEditingTitle] = useState(false);

  async function changeTier(next: Tier) {
    tierView.apply(next);
    try {
      const result = await updatePointAction({ id: point.id, tier: next, subjectCode });
      if (!result.ok) tierView.rollback();
      report(result);
    } catch {
      tierView.rollback();
      report({ ok: false, error: "网络异常，层级未保存" });
    }
  }

  async function toggleExam() {
    const next = !examView.value;
    examView.apply(next);
    try {
      const result = await updatePointAction({ id: point.id, exam: next, subjectCode });
      if (!result.ok) examView.rollback();
      report(result);
    } catch {
      examView.rollback();
      report({ ok: false, error: "网络异常，星标未保存" });
    }
  }

  async function removePoint() {
    const confirmed = await confirm({
      title: `删除知识点“${point.title}”？`,
      description: "复习和错题记录会保留，但会解除与这个知识点的关联。",
      confirmLabel: "删除知识点",
      danger: true,
    });
    if (!confirmed) return;
    const result = await deletePointAction({ id: point.id, subjectCode });
    report(result);
    if (result.ok) notify("知识点已删除");
  }

  async function toggleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!detail && !loading) {
      setLoading(true);
      const result = await getPointDetailAction(point.id);
      if (result.ok && result.detail) setDetail(result.detail);
      setLoading(false);
    }
  }

  return (
    <div className="pointItem">
    <div className="pointLine">
      <button
        aria-expanded={expanded}
        aria-label={expanded ? "收起详情" : "展开关联的资料和错题"}
        className="pointExpand"
        onClick={() => void toggleExpand()}
        type="button"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <select
        aria-label="层级"
        className="tierSelect"
        data-tier={tierView.value}
        onChange={(event) => void changeTier(event.target.value as Tier)}
        value={tierView.value}
      >
        {TIER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {editingTitle ? (
        <input
          aria-label="知识点标题"
          autoFocus
          className="pointTitle"
          defaultValue={point.title}
          onBlur={(event) => {
            setEditingTitle(false);
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
        // 非编辑态渲染公式（$...$），点击切回输入框编辑原文
        <button
          aria-label={`编辑知识点标题“${point.title}”`}
          className="pointTitle pointTitleView"
          onClick={() => setEditingTitle(true)}
          type="button"
        >
          <RichText text={point.title} />
        </button>
      )}
      <button
        aria-label={examView.value ? "取消真题标记" : "标记为真题"}
        className={examView.value ? "examStar active" : "examStar"}
        onClick={() => void toggleExam()}
        title={examView.value ? "真题考点" : "标记为真题考点"}
        type="button"
      >
        <Star fill={examView.value ? "currentColor" : "none"} size={13} />
      </button>
      <MasteryCell point={point} report={report} subjectCode={subjectCode} />
      <small className={due ? "pointDue due" : "pointDue"}>
        {due ? "待复习" : point.next_review ? `下次 ${point.next_review.slice(5)}` : "未排期"}
      </small>
      <small className="pointCounts">
        {point.asset_count ? `${point.asset_count} 资料` : ""}
        {point.asset_count && point.mistake_count ? " · " : ""}
        {point.mistake_count ? `${point.mistake_count} 错题` : ""}
      </small>
      <div className="pointActions">
        {onAddChild ? (
          <button
            aria-label={`为“${point.title}”添加子知识点`}
            className="pointAddChild"
            onClick={onAddChild}
            title="添加子知识点"
            type="button"
          >
            <Plus size={13} />
          </button>
        ) : null}
        <button aria-label="删除知识点" className="iconDanger" onClick={() => void removePoint()} type="button">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
    {expanded ? (
      <div className="pointDetail">
        {loading ? (
          <p className="empty inset"><Loader2 className="spin" size={13} /> 加载中…</p>
        ) : detail ? (
          <>
            <div className="pointTrainingAction">
              <div><span className="sectionKicker">NEXT ACTION</span><strong>针对训练</strong><small>创建 45 分钟 P1 训练，带回今日工作台执行。</small></div>
              <CreateTrainingTaskButton compact day={today} notes={`知识点专项训练：${point.title}。完成后更新掌握度并记录回忆线索。`} subjectCode={subjectCode} title={`知识点专项：${point.title}`} />
            </div>
            <PointRecallEditor point={point} report={report} subjectCode={subjectCode} />
            <div className="pointDetailCol">
              <h4>关联资料 {detail.assets.length ? `(${detail.assets.length})` : ""}</h4>
              {detail.assets.map((asset) => (
                <a href={assetFileUrl(asset.id)} key={asset.id} rel="noopener" target="_blank">
                  {asset.original_name}
                  <small>{asset.day}</small>
                </a>
              ))}
              {!detail.assets.length ? <p className="empty inset">暂无。收纳文件时选中这个知识点即可关联。</p> : null}
            </div>
            <div className="pointDetailCol">
              <h4>错题 {detail.mistakes.length ? `(${detail.mistakes.length})` : ""}</h4>
              {detail.mistakes.map((mistake) => (
                <div key={mistake.id}>
                  <span className={mistake.graduated ? "rowBadge" : "rowBadge mistake"}>
                    {mistake.graduated ? "已毕业" : "回炉中"}
                  </span>
                  <RichText text={mistake.title} />
                  <small>{mistake.cause ? <RichText text={mistake.cause} /> : mistake.day}</small>
                </div>
              ))}
              {!detail.mistakes.length ? <p className="empty inset">暂无错题。</p> : null}
            </div>
            <div className="pointDetailCol">
              <h4>复习记录 {detail.reviews.length ? `(${detail.reviews.length})` : ""}</h4>
              {detail.reviews.map((review) => (
                <div key={review.id}>
                  <span className="rowBadge review">{review.score}/3</span>
                  {review.day}
                  {review.note ? <small>{review.note}</small> : null}
                </div>
              ))}
              {!detail.reviews.length ? <p className="empty inset">还没复习过。</p> : null}
            </div>
          </>
        ) : (
          <p className="empty inset">加载失败，请重试。</p>
        )}
      </div>
    ) : null}
    </div>
  );
}

export function MasteryCell({ point, subjectCode, report }: {
  point: PointRow;
  subjectCode: string;
  report: (result: { ok: boolean; error?: string }) => void;
}) {
  const [value, setValue] = useState(point.mastery);
  const savingRef = useRef(false);
  const queuedRef = useRef<number | null>(null);
  const lastConfirmedRef = useRef(point.mastery);
  useEffect(() => {
    // setTimeout(0) 是本项目对 eslint set-state-in-effect 规则的既有惯例；
    // 回调内再检查一次 ref，避免请求在飞期间把旧的 point.mastery 闪回滑块。
    window.setTimeout(() => {
      if (!savingRef.current && queuedRef.current === null) {
        lastConfirmedRef.current = point.mastery;
        setValue(point.mastery);
      }
    }, 0);
  }, [point.mastery]);

  async function send(next: number) {
    savingRef.current = true;
    let result: { ok: boolean; error?: string };
    try {
      result = await updatePointAction({ id: point.id, mastery: next, subjectCode });
    } catch {
      result = { ok: false, error: "网络异常，掌握度未保存，请重新设置" };
    } finally {
      savingRef.current = false;
    }
    if (result.ok) {
      lastConfirmedRef.current = next;
    } else {
      // 服务端异常时补发大概率也失败，故连排队值一起丢弃；
      // 回滚到最近一次确认成功的值（闭包的 point.mastery 可能已过期）。
      queuedRef.current = null;
      setValue(lastConfirmedRef.current);
    }
    if (queuedRef.current !== null && queuedRef.current !== next) {
      const queued = queuedRef.current;
      queuedRef.current = null;
      void send(queued);
      return;
    }
    queuedRef.current = null;
    report(result);
  }

  function commit() {
    if (value === lastConfirmedRef.current) return;
    if (savingRef.current) {
      queuedRef.current = value;
      return;
    }
    void send(value);
  }

  return (
    <div className="masteryCell" title={`掌握度 ${value} · 已复习 ${point.reviews} 次 · 拖动可直接设置`}>
      <input
        aria-label={`设置“${point.title}”的掌握度`}
        className="masteryRange"
        max={100}
        min={0}
        onBlur={commit}
        onChange={(event) => setValue(Number(event.target.value))}
        onKeyUp={(event) => {
          if (event.key === "Enter" || event.key.startsWith("Arrow")) commit();
        }}
        onPointerUp={commit}
        step={5}
        style={{ "--mastery-pct": value } as CSSProperties}
        type="range"
        value={value}
      />
      <small>{value}</small>
    </div>
  );
}
