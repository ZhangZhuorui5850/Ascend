"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { BrainCircuit, ChevronDown, ChevronRight, Crosshair, FolderPlus, Layers3, MousePointer2, Plus, Star, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import {
  createChapterAction,
  createPointAction,
  deleteChapterAction,
  deletePointAction,
  renameChapterAction,
  updatePointAction,
} from "@/app/actions/knowledge";
import {
  flattenPointTree,
  MAX_CHAPTER_DEPTH,
  MAX_POINT_DEPTH,
  type ChapterWithPoints,
  type PointNode,
  type SubjectRow,
} from "@/lib/repo/knowledge";
import {
  countChaptersDeep,
  countPointsDeep,
  DEFAULT_EXPAND_DEPTH,
  findPointNode,
  subtreeHeightOf,
  subtreeIdsOf,
} from "@/components/chapter-tree";
import { attachDragCard, treeDropEdgeFromEvent, type DropEdge } from "@/components/dnd";
import { useFeedback } from "@/components/FeedbackProvider";
import { clampZoom, linkPath, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from "@/components/mindmap";
import { sortPointsForView, type PointSortMode } from "@/components/point-sort";
import { PointDetailPanel } from "@/components/PointDetailPanel";
import { RichText } from "@/components/RichText";
import type { PointMoveTarget, TreeControls } from "@/components/SubjectWorkbench";

type Report = (result: { ok: boolean; error?: string }) => void;

type MindMapViewProps = {
  subject: SubjectRow;
  chapters: ChapterWithPoints[];
  loosePoints: PointNode[];
  /** 第一层章节的层级深度：完整视图为 1，聚焦子树时为聚焦章节的实际深度 */
  baseDepth: number;
  /** 聚焦子树时隐藏根卡片的“添加章节” */
  allowRootAdd: boolean;
  today: string;
  sortMode: PointSortMode;
  tree: TreeControls;
  report: Report;
};

export function MindMapView({ subject, chapters, loosePoints, baseDepth, allowRootAdd, today, sortMode, tree, report }: MindMapViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [addingRoot, setAddingRoot] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPoint = selectedId ? findPointNode(chapters, loosePoints, selectedId) : null;

  /** 量出每张卡片相对画布的位置，重画父→子贝塞尔连线（纯 DOM 写入，不进 state） */
  const drawLinks = useCallback(() => {
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    if (!canvas || !svg) return;
    const canvasRect = canvas.getBoundingClientRect();
    const scale = canvas.offsetWidth ? canvasRect.width / canvas.offsetWidth : 1;
    svg.setAttribute("width", String(canvas.offsetWidth));
    svg.setAttribute("height", String(canvas.offsetHeight));
    svg.setAttribute("viewBox", `0 0 ${canvas.offsetWidth} ${canvas.offsetHeight}`);
    const cards = new Map<string, HTMLElement>();
    canvas.querySelectorAll<HTMLElement>("[data-map-node]").forEach((el) => {
      const key = el.dataset.mapNode;
      if (key) cards.set(key, el);
    });
    const paths: SVGPathElement[] = [];
    cards.forEach((el) => {
      const parentKey = el.dataset.mapParent;
      const parent = parentKey ? cards.get(parentKey) : null;
      if (!parent) return;
      const from = parent.getBoundingClientRect();
      const to = el.getBoundingClientRect();
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "mapLink");
      path.setAttribute(
        "d",
        linkPath(
          (from.right - canvasRect.left) / scale,
          (from.top + from.height / 2 - canvasRect.top) / scale,
          (to.left - canvasRect.left) / scale,
          (to.top + to.height / 2 - canvasRect.top) / scale,
        ),
      );
      paths.push(path);
    });
    svg.replaceChildren(...paths);
  }, []);

  // 每次渲染后重画连线（折叠、增删、改名都会改变布局）
  useLayoutEffect(drawLinks);

  useEffect(() => {
    const viewport = viewportRef.current;
    const treeEl = canvasRef.current;
    if (!viewport || !treeEl) return;
    // 字体/公式异步加载导致的尺寸变化
    const observer = new ResizeObserver(() => drawLinks());
    observer.observe(treeEl);
    // React 的 onWheel 挂在 root 上是 passive 的，preventDefault 无效，只能手动挂非 passive 监听
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((current) => clampZoom(current + (event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("wheel", onWheel);
    };
  }, [drawLinks]);

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport || event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".mapCard, button, input, select, a")) return;
    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.setAttribute("data-panning", "true");
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    const pan = panRef.current;
    if (!viewport || !pan || pan.pointerId !== event.pointerId) return;
    viewport.scrollLeft = pan.left - (event.clientX - pan.x);
    viewport.scrollTop = pan.top - (event.clientY - pan.y);
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    viewport?.removeAttribute("data-panning");
  }

  return (
    <div className="mindMapShell">
      <div className="mindMapViewportWrap">
      <div aria-label="缩放" className="mindMapZoom" role="group">
        <button
          aria-label="缩小"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
          type="button"
        >
          <ZoomOut size={14} />
        </button>
        <button aria-label="恢复 100%" onClick={() => setZoom(1)} type="button">
          {Math.round(zoom * 100)}%
        </button>
        <button
          aria-label="放大"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
          type="button"
        >
          <ZoomIn size={14} />
        </button>
      </div>
      <div
        className="mindMapViewport"
        onPointerCancel={endPan}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        ref={viewportRef}
      >
        <div className="mindMapCanvas" ref={canvasRef} style={{ zoom }}>
          <svg aria-hidden className="mindMapLinks" ref={svgRef} />
          <div className="mapNode">
            <div className="mapCard mapRootCard" data-map-node="root">
              <span className="mapCardTitle">{subject.name}</span>
              {allowRootAdd ? (
                <div className="mapTools">
                  <button aria-label="添加章节" onClick={() => setAddingRoot(true)} title="添加章节" type="button">
                    <FolderPlus size={13} />
                  </button>
                </div>
              ) : null}
            </div>
            <div className="mapChildren">
              {chapters.map((chapter) => (
                <ChapterNode
                  chapter={chapter}
                  depth={baseDepth}
                  key={chapter.id}
                  onSelect={setSelectedId}
                  parentKey="root"
                  report={report}
                  selectedId={selectedId}
                  siblingIds={chapters.map((item) => item.id)}
                  sortMode={sortMode}
                  subjectCode={subject.code}
                  today={today}
                  tree={tree}
                  visualDepth={1}
                />
              ))}
              {addingRoot ? (
                <MapAddCard
                  onCancel={() => setAddingRoot(false)}
                  onSubmit={async (title) => {
                    const result = await createChapterAction({ subjectCode: subject.code, title });
                    if (result.ok) setAddingRoot(false);
                    report(result);
                  }}
                  parentKey="root"
                  placeholder="新章节标题"
                />
              ) : null}
              {loosePoints.length ? (
                <div className="mapNode">
                  <div className="mapCard mapLooseCard" data-map-node="loose" data-map-parent="root">
                    <span className="mapCardTitle">未分章知识点</span>
                  </div>
                  <div className="mapChildren">
                    {sortPointsForView(loosePoints, sortMode).map((point) => (
                      <MapPointNode
                        chapterId={null}
                        key={point.id}
                        onSelect={setSelectedId}
                        parentKey="loose"
                        parentPointId={null}
                        point={point}
                        pointDepth={1}
                        report={report}
                        selectedId={selectedId}
                        siblingPointIds={loosePoints.map((item) => item.id)}
                        sortMode={sortMode}
                        subjectCode={subject.code}
                        today={today}
                        tree={tree}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              {!chapters.length && !loosePoints.length && !addingRoot ? (
                <p className="empty">还没有章节。点击科目卡片上的 + 新建一个。</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      </div>
      {selectedPoint ? (
        <PointDetailPanel
          key={selectedPoint.id}
          onClose={() => setSelectedId(null)}
          point={selectedPoint}
          report={report}
          subjectCode={subject.code}
          today={today}
        />
      ) : (
        <aside aria-label="知识点工作台引导" className="pointPanel pointPanelWelcome">
          <div className="pointPanelWelcomeMark"><BrainCircuit size={26} /></div>
          <span className="eyebrow">学习工作台</span>
          <h3>选择一个知识点开始</h3>
          <p>右侧会集中显示回忆卡、掌握度、学习资料、错题证据与复习轨迹。</p>
          <div className="pointPanelWelcomeSteps">
            <div><span><MousePointer2 size={15} /></span><p><strong>定位</strong><small>在图谱中选择知识点</small></p></div>
            <div><span><BrainCircuit size={15} /></span><p><strong>加工</strong><small>写检索问题与答案骨架</small></p></div>
            <div><span><Layers3 size={15} /></span><p><strong>巩固</strong><small>用错题和复习记录校准掌握度</small></p></div>
          </div>
        </aside>
      )}
    </div>
  );
}

function ChapterNode({ chapter, depth, visualDepth, parentKey, siblingIds, subjectCode, today, sortMode, tree, report, selectedId, onSelect }: {
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

function MapPointNode({ point, chapterId, parentPointId, pointDepth, parentKey, siblingPointIds, subjectCode, today, sortMode, tree, report, selectedId, onSelect }: {
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

/** 新建章节/知识点的临时输入卡片：Enter 提交，Esc/失焦取消 */
function MapAddCard({ parentKey, placeholder, onSubmit, onCancel }: {
  parentKey: string;
  placeholder: string;
  onSubmit: (title: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function submit(input: HTMLInputElement) {
    const title = input.value.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      await onSubmit(title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mapNode">
      <div className="mapCard mapAddCard" data-map-node={`add:${parentKey}`} data-map-parent={parentKey}>
        <input
          aria-label={placeholder}
          autoFocus
          disabled={busy}
          onBlur={(event) => {
            if (!event.target.value.trim()) onCancel();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit(event.currentTarget);
            if (event.key === "Escape") onCancel();
          }}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
