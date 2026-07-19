"use client";

import { useState } from "react";
import { BrainCircuit, FolderPlus, Layers3, MousePointer2, ZoomIn, ZoomOut } from "lucide-react";
import { createChapterAction } from "@/app/actions/knowledge";
import type { ChapterWithPoints, PointNode, SubjectRow } from "@/lib/repo/knowledge";
import { findPointNode } from "@/components/chapter-tree";
import { clampZoom, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from "@/components/mindmap";
import { sortPointsForView, type PointSortMode } from "@/components/point-sort";
import { PointDetailPanel } from "@/components/PointDetailPanel";
import type { Report, TreeControls } from "@/components/subject-workbench/shared";
import { ChapterNode } from "./ChapterNode";
import { MapAddCard } from "./MapAddCard";
import { MapPointNode } from "./MapPointNode";
import { useMindMapCanvas } from "./useMindMapCanvas";

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

/** 导图视图壳：缩放/平移画布 + 根卡片与顶层节点编排，右侧知识点详情面板 */
export function MindMapView({ subject, chapters, loosePoints, baseDepth, allowRootAdd, today, sortMode, tree, report }: MindMapViewProps) {
  const { viewportRef, canvasRef, svgRef, zoom, setZoom, startPan, movePan, endPan } = useMindMapCanvas();
  const [addingRoot, setAddingRoot] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPoint = selectedId ? findPointNode(chapters, loosePoints, selectedId) : null;

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
