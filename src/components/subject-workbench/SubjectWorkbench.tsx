"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ListTree, Network, Plus, Settings2, Trash2 } from "lucide-react";
import {
  createChapterAction,
  deleteSubjectAction,
  renameSubjectAction,
} from "@/app/actions/knowledge";
import {
  flattenChapterPoints,
  flattenPointTree,
  type ChapterWithPoints,
  type PointNode,
  type SubjectRow,
  type SubjectTrack,
} from "@/lib/repo/knowledge";
import { countChaptersDeep, findChapterPath } from "@/components/chapter-tree";
import { useFeedback } from "@/components/FeedbackProvider";
import { MindMapView } from "@/components/mind-map/MindMapView";
import { POINT_SORT_MODES, sortPointsForView } from "@/components/point-sort";
import { RichText } from "@/components/RichText";
import { ChapterBlock } from "./ChapterBlock";
import { PointLine } from "./PointLine";
import type { TreeControls } from "./shared";
import { useSortModePref } from "./useSortModePref";
import { useTreeControls } from "./useTreeControls";

type SubjectWorkbenchProps = {
  subject: SubjectRow;
  chapters: ChapterWithPoints[];
  loosePoints: PointNode[];
  today: string;
  focusId?: string | null;
  view?: "list" | "map";
};

/** 科目工作台壳：头部工具栏（视图/排序/科目设置）、聚焦面包屑，按视图分发到列表或导图 */
export function SubjectWorkbench({ subject, chapters, loosePoints, today, focusId = null, view = "list" }: SubjectWorkbenchProps) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [chapterTitle, setChapterTitle] = useState("");
  const { sortMode, changeSortMode } = useSortModePref(subject.code);

  function report(result: { ok: boolean; error?: string }) {
    if (result.ok) router.refresh();
    else notify(result.error || "操作失败", "error");
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

  const tree: TreeControls = useTreeControls({ subjectCode: subject.code, report, focusChapter });

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
